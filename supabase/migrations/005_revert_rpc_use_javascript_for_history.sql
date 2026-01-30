-- ========================================
-- MIGRATION 005: Revert RPC approach - use JavaScript for blood_stock_history
-- ========================================
-- 
-- REASON: For consistency with 'add' implementation, all blood_stock_history
--         inserts should be done via JavaScript controllers, not via RPC
--
-- PREVIOUS: RPC function insert blood_stock_history
-- NEW: JavaScript controller insert blood_stock_history
--
-- This migration reverts RPC to original form (no INSERT statement)
-- Implementation is now in allocationController.js
-- ========================================

CREATE OR REPLACE FUNCTION complete_allocation_pickup(
    p_allocation_id UUID,
    p_quantity_picked_up INTEGER
)
RETURNS BOOLEAN AS $$
DECLARE
    current_allocation RECORD;
    new_status allocation_status;
BEGIN
    -- Get current allocation
    SELECT * INTO current_allocation
    FROM blood_allocation
    WHERE id = p_allocation_id;
    
    IF current_allocation IS NULL THEN
        RAISE EXCEPTION 'Allocation not found: %', p_allocation_id;
    END IF;
    
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
        
        -- NOTE: blood_stock_history insert is now handled in allocationController.js
        -- This keeps consistency with how 'add' entries are created
    END IF;
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- ========================================
-- MIGRATION COMPLETE
-- ========================================
-- blood_stock_history entries akan di-handle oleh:
-- ✅ 'add'   - fulfillmentController.js (saat donasi selesai)
-- ✅ 'used'  - allocationController.js (saat allocation di-pickup)
-- ✅ 'used'  - allocationController.js (saat free stock di-pickup)
-- ℹ️  'reduce'/'expired' - dapat ditambahkan kemudian jika diperlukan
