-- ========================================
-- MIGRATION: Update Stock Ledger Triggers
-- ========================================
-- Purpose: Replace old log_stock_mutation() with new comprehensive triggers
-- Adds automatic logging for all stock mutations (insert, update, delete)
-- Date: 2026-01-30
-- Status: Incremental Update (tidak drop semua schema)

-- ========================================
-- STEP 1: Drop Old Trigger & Function
-- ========================================

DROP TRIGGER IF EXISTS blood_stock_insert_ledger ON blood_stock;
DROP FUNCTION IF EXISTS log_stock_mutation();

-- ========================================
-- STEP 2: Create New Functions
-- ========================================

-- Function to log stock mutations on INSERT (donation masuk)
CREATE OR REPLACE FUNCTION log_stock_mutation_on_insert()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO stock_ledger (
        stock_id, mutation_type, quantity, related_donation, notes
    ) VALUES (
        NEW.id,
        'MASUK_DONASI',
        NEW.quantity,
        NEW.donation_id,
        'Auto ledger: stok masuk dari donasi'
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to log stock mutations on UPDATE (status changes)
-- Trigger ini akan catch saat status berubah ke 'used' atau 'expired'
CREATE OR REPLACE FUNCTION log_stock_mutation_on_update()
RETURNS TRIGGER AS $$
BEGIN
    -- Log saat status berubah ke 'used'
    IF NEW.status = 'used'::stock_status AND OLD.status != 'used'::stock_status THEN
        INSERT INTO stock_ledger (
            stock_id, mutation_type, quantity, notes
        ) VALUES (
            NEW.id,
            'PENGGUNAAN_STOK',
            NEW.quantity,
            'Auto ledger: status berubah ke used. Untuk: ' || COALESCE(NEW.used_for, 'tidak ada keterangan')
        );
    END IF;

    -- Log saat status berubah ke 'expired'
    IF NEW.status = 'expired'::stock_status AND OLD.status != 'expired'::stock_status THEN
        INSERT INTO stock_ledger (
            stock_id, mutation_type, quantity, notes
        ) VALUES (
            NEW.id,
            'KADALUARSA',
            NEW.quantity,
            'Auto ledger: stok kadaluarsa pada ' || COALESCE(TO_CHAR(CURRENT_DATE, 'YYYY-MM-DD'), 'tidak ada tanggal')
        );
    END IF;

    -- Log saat quantity berubah (untuk tracking partial usage)
    IF NEW.quantity < OLD.quantity THEN
        INSERT INTO stock_ledger (
            stock_id, mutation_type, quantity, notes
        ) VALUES (
            NEW.id,
            'PENGURANGAN_QUANTITY',
            OLD.quantity - NEW.quantity,
            'Auto ledger: quantity berkurang dari ' || OLD.quantity || ' menjadi ' || NEW.quantity
        );
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ========================================
-- STEP 3: Create New Triggers
-- ========================================

CREATE TRIGGER blood_stock_insert_ledger
AFTER INSERT ON blood_stock
FOR EACH ROW EXECUTE FUNCTION log_stock_mutation_on_insert();

CREATE TRIGGER blood_stock_update_ledger
AFTER UPDATE ON blood_stock
FOR EACH ROW EXECUTE FUNCTION log_stock_mutation_on_update();

-- ========================================
-- STEP 5: Verify Functions & Triggers
-- ========================================

-- Verify functions created
SELECT 
    routine_name, 
    routine_type,
    created
FROM information_schema.routines 
WHERE routine_name IN ('log_stock_mutation_on_insert', 'log_stock_mutation_on_update')
ORDER BY routine_name;

-- Verify triggers created
SELECT 
    trigger_name,
    event_manipulation,
    event_object_table,
    action_statement
FROM information_schema.triggers
WHERE trigger_name IN (
    'blood_stock_insert_ledger', 
    'blood_stock_update_ledger'
)
ORDER BY trigger_name;

-- ========================================
-- SUMMARY
-- ========================================
-- ✅ Old function log_stock_mutation() removed
-- ✅ New function log_stock_mutation_on_insert() created
-- ✅ New function log_stock_mutation_on_update() created
-- ✅ Trigger blood_stock_insert_ledger recreated
-- ✅ Trigger blood_stock_update_ledger created
--
-- Automatic logging via TRIGGER (stock_ledger only):
--    - Donasi masuk (INSERT) → 'MASUK_DONASI'
--    - Status → 'used' (UPDATE) → 'PENGGUNAAN_STOK'
--    - Status → 'expired' (UPDATE) → 'KADALUARSA'
--    - Quantity berkurang (UPDATE) → 'PENGURANGAN_QUANTITY'
--
-- Manual logging via CODE (blood_stock_history):
--    - Akan di-INSERT manual dari controllers untuk consistency
--    - Same approach dengan donasi masuk yang sudah berjalan
