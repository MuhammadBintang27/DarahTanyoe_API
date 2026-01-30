-- DarahTanyoe Migration: Blood Allocation System (Opsi 2)
-- Purpose: Add allocation tracking for blood from fulfillment to blood requests
-- Version: 002
-- Created: 2026-01-29

-- ========================================
-- BLOOD ALLOCATION SYSTEM (Opsi 2)
-- ========================================

-- 1. Create allocation_status enum (if not exists)
DO $$ BEGIN
    CREATE TYPE allocation_status AS ENUM (
        'allocated',      -- Darah sudah dialokasikan untuk request
        'partial_pickup', -- Sebagian sudah diambil, sisa pending
        'picked_up',      -- Semua darah sudah diambil
        'expired',        -- Alokasi expired
        'cancelled'       -- Alokasi dibatalkan
    );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- 2. Create blood_allocation table (NEW)
-- Tracks darah allocation dari fulfillment ke blood requests
-- Memastikan darah dari fulfillment A hanya dipakai untuk request A
CREATE TABLE IF NOT EXISTS blood_allocation (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- References
    blood_request_id UUID NOT NULL REFERENCES blood_requests(id) ON DELETE CASCADE,
    fulfillment_request_id UUID REFERENCES fulfillment_requests(id) ON DELETE SET NULL,
    blood_stock_id UUID NOT NULL REFERENCES blood_stock(id) ON DELETE CASCADE,
    
    -- Allocation tracking
    quantity_allocated INTEGER NOT NULL CHECK (quantity_allocated > 0),
    quantity_picked_up INTEGER DEFAULT 0 CHECK (quantity_picked_up >= 0),
    status allocation_status DEFAULT 'allocated',
    
    -- Priority & notes
    priority INTEGER DEFAULT 0,
    notes TEXT,
    
    -- Timestamps
    allocated_at TIMESTAMPTZ DEFAULT NOW(),
    pickup_scheduled_at TIMESTAMPTZ,
    picked_up_at TIMESTAMPTZ,
    expired_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    cancellation_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Constraints
    CHECK (quantity_picked_up <= quantity_allocated),
    CHECK (
        (fulfillment_request_id IS NOT NULL) OR 
        (fulfillment_request_id IS NULL)  -- Allow general allocation without fulfillment
    )
);

-- 3. Create indexes for blood_allocation
CREATE INDEX IF NOT EXISTS idx_blood_allocation_request ON blood_allocation(blood_request_id);
CREATE INDEX IF NOT EXISTS idx_blood_allocation_fulfillment ON blood_allocation(fulfillment_request_id);
CREATE INDEX IF NOT EXISTS idx_blood_allocation_stock ON blood_allocation(blood_stock_id);
CREATE INDEX IF NOT EXISTS idx_blood_allocation_status ON blood_allocation(status);
CREATE INDEX IF NOT EXISTS idx_blood_allocation_allocated_at ON blood_allocation(allocated_at DESC);
CREATE INDEX IF NOT EXISTS idx_blood_allocation_picked_up_at ON blood_allocation(picked_up_at DESC);

-- 4. Create trigger for updated_at
CREATE OR REPLACE FUNCTION update_blood_allocation_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_blood_allocation_updated_at ON blood_allocation;

CREATE TRIGGER update_blood_allocation_updated_at 
    BEFORE UPDATE ON blood_allocation 
    FOR EACH ROW 
    EXECUTE FUNCTION update_blood_allocation_updated_at();

-- ========================================
-- BLOOD ALLOCATION FUNCTIONS
-- ========================================

-- Function: Auto-create allocation when donation is completed
-- Allocates blood from completed donation to fulfillment request
CREATE OR REPLACE FUNCTION auto_allocate_blood_on_donation()
RETURNS TRIGGER AS $$
DECLARE
    fulfillment_id UUID;
    blood_req_id UUID;
    fulfillment_quantity_needed INTEGER;
    already_allocated INTEGER;
    can_allocate INTEGER;
    blood_stock_id UUID;
BEGIN
    -- Only process when donation is completed
    IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN
        
        -- Find fulfillment request for this donation (via donor_confirmation)
        SELECT dc.fulfillment_request_id INTO fulfillment_id
        FROM donor_confirmations dc
        WHERE dc.donation_id = NEW.id
        LIMIT 1;
        
        -- If found fulfillment request, create allocation
        IF fulfillment_id IS NOT NULL THEN
            -- Find the blood_stock entry for this donation (should have just been created)
            SELECT bs.id INTO blood_stock_id
            FROM blood_stock bs
            WHERE bs.donation_id = NEW.id
            LIMIT 1;
            
            -- Only proceed if blood_stock exists
            IF blood_stock_id IS NOT NULL THEN
                -- Get fulfillment request details including blood_request_id
                SELECT 
                    fr.blood_request_id,
                    fr.quantity_needed,
                    COALESCE(fr.quantity_collected, 0)
                INTO blood_req_id, fulfillment_quantity_needed, already_allocated
                FROM fulfillment_requests fr
                WHERE fr.id = fulfillment_id;
                
                -- Calculate how much can be allocated
                can_allocate := LEAST(
                    NEW.quantity,
                    fulfillment_quantity_needed - already_allocated
                );
                
                -- Create allocation if there's quantity to allocate
                IF can_allocate > 0 THEN
                    INSERT INTO blood_allocation (
                        blood_request_id,
                        fulfillment_request_id,
                        blood_stock_id,
                        quantity_allocated,
                        status
                    )
                    VALUES (
                        blood_req_id,
                        fulfillment_id,
                        blood_stock_id,
                        can_allocate,
                        'allocated'::allocation_status
                    );
                END IF;
            END IF;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop old trigger if exists
DROP TRIGGER IF EXISTS blood_allocation_on_donation_completion ON donations;

-- Create trigger to auto-allocate blood
CREATE TRIGGER blood_allocation_on_donation_completion
    AFTER UPDATE ON donations
    FOR EACH ROW EXECUTE FUNCTION auto_allocate_blood_on_donation();

-- Function: Get available blood for a specific request (considering allocations)
CREATE OR REPLACE FUNCTION get_available_blood_for_request(
    p_request_id UUID,
    p_blood_type blood_type DEFAULT NULL
)
RETURNS TABLE (
    stock_id UUID,
    quantity_available INTEGER,
    fulfillment_id UUID,
    batch_number VARCHAR,
    expiry_date DATE
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ba.blood_stock_id,
        ba.quantity_allocated - ba.quantity_picked_up AS quantity_available,
        ba.fulfillment_request_id,
        bs.batch_number,
        bs.expiry_date
    FROM blood_allocation ba
    JOIN blood_stock bs ON ba.blood_stock_id = bs.id
    WHERE 
        ba.blood_request_id = p_request_id
        AND (p_blood_type IS NULL OR bs.blood_type = p_blood_type)
        AND ba.status IN ('allocated'::allocation_status, 'partial_pickup'::allocation_status)
        AND bs.status = 'available'::stock_status
        AND bs.expiry_date >= CURRENT_DATE
    ORDER BY ba.priority DESC, ba.allocated_at ASC;
END;
$$ LANGUAGE plpgsql;

-- Function: Get pending pickup for a request
CREATE OR REPLACE FUNCTION get_pending_pickup_for_request(p_request_id UUID)
RETURNS TABLE (
    allocation_id UUID,
    quantity_pending INTEGER,
    fulfillment_id UUID,
    batch_number VARCHAR
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ba.id,
        ba.quantity_allocated - ba.quantity_picked_up,
        ba.fulfillment_request_id,
        bs.batch_number
    FROM blood_allocation ba
    JOIN blood_stock bs ON ba.blood_stock_id = bs.id
    WHERE 
        ba.blood_request_id = p_request_id
        AND ba.status IN ('allocated'::allocation_status, 'partial_pickup'::allocation_status)
        AND (ba.quantity_allocated - ba.quantity_picked_up) > 0
    ORDER BY ba.allocated_at ASC;
END;
$$ LANGUAGE plpgsql;

-- Function: Complete pickup and update allocation
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
    END IF;
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Function: Cancel allocation
CREATE OR REPLACE FUNCTION cancel_allocation(
    p_allocation_id UUID,
    p_reason TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
BEGIN
    UPDATE blood_allocation
    SET 
        status = 'cancelled'::allocation_status,
        cancelled_at = NOW(),
        cancellation_reason = p_reason
    WHERE id = p_allocation_id;
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- ========================================
-- MIGRATION COMPLETE
-- ========================================
-- All blood allocation system components have been added
-- Ready to use allocation endpoints in API
