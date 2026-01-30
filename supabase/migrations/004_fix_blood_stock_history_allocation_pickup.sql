-- ========================================
-- MIGRATION 004: Fix blood_stock_history for allocation pickups
-- ========================================
-- 
-- ISSUE: blood_stock_history tidak ada entry 'used' untuk allocation pickups
-- ROOT CAUSE: RPC function complete_allocation_pickup() tidak insert ke blood_stock_history
-- SOLUTION: Update RPC function untuk insert ke blood_stock_history saat allocation di-pickup
--
-- STATUS: Applied to both migration 001 and 002
-- This migration applies the same fix to the actual database
-- ========================================

-- ✅ Update RPC: complete_allocation_pickup() to insert blood_stock_history
CREATE OR REPLACE FUNCTION complete_allocation_pickup(
    p_allocation_id UUID,
    p_quantity_picked_up INTEGER
)
RETURNS BOOLEAN AS $$
DECLARE
    current_allocation RECORD;
    current_stock RECORD;
    new_status allocation_status;
BEGIN
    -- Get current allocation
    SELECT * INTO current_allocation
    FROM blood_allocation
    WHERE id = p_allocation_id;
    
    IF current_allocation IS NULL THEN
        RAISE EXCEPTION 'Allocation not found: %', p_allocation_id;
    END IF;
    
    -- Get current stock details for history logging
    SELECT quantity, institution_id, blood_type INTO current_stock
    FROM blood_stock
    WHERE id = current_allocation.blood_stock_id;
    
    -- Validate quantity
    IF p_quantity_picked_up > (current_allocation.quantity_allocated - current_allocation.quantity_picked_up) THEN
        RAISE EXCEPTION 'Quantity picked up exceeds available: % > %', 
            p_quantity_picked_up, 
            (current_allocation.quantity_allocated - current_allocation.quantity_picked_up);
    END IF;
    
    -- Determine new status
    IF (current_allocation.quantity_picked_up + p_quantity_picked_up) >= current_allocation.quantity_allocated THEN
        new_status := 'picked_up'::allocation_status;
    ELSE
        new_status := 'partial_pickup'::allocation_status;
    END IF;
    
    -- Update allocation
    UPDATE blood_allocation
    SET 
        quantity_picked_up = quantity_picked_up + p_quantity_picked_up,
        status = new_status,
        picked_up_at = CASE 
            WHEN new_status = 'picked_up'::allocation_status THEN NOW()
            ELSE picked_up_at
        END
    WHERE id = p_allocation_id;
    
    -- Update blood stock status if fully picked up
    IF new_status = 'picked_up'::allocation_status THEN
        UPDATE blood_stock
        SET status = 'used'::stock_status, used_at = NOW()
        WHERE id = current_allocation.blood_stock_id;
        
        -- ✅ NEW: Record to blood_stock_history for audit trail
        INSERT INTO blood_stock_history (
            institution_id,
            blood_type,
            change_type,
            quantity_change,
            previous_quantity,
            new_quantity,
            notes,
            created_by
        ) VALUES (
            current_stock.institution_id,
            current_stock.blood_type,
            'used'::varchar,
            p_quantity_picked_up,
            current_stock.quantity,
            current_stock.quantity - p_quantity_picked_up,
            'Allocation di-pickup dan dikonfirmasi dengan kode unik',
            current_stock.institution_id
        );
    END IF;
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- ========================================
-- MIGRATION COMPLETE
-- ========================================
-- blood_stock_history will now contain entries for:
-- ✅ 'add' - Donasi masuk (from fulfillmentController or donation process)
-- ✅ 'used' - Allocation pickups (from complete_allocation_pickup RPC function)
-- ✅ 'used' - Free stock pickups (from allocationController)
-- ✅ 'reduce'/'expired' - dapat ditambahkan kemudian jika diperlukan
