-- ========================================
-- CLEANUP: Remove Old blood_stock_history Trigger
-- ========================================
-- Purpose: Remove auto trigger untuk blood_stock_history
-- Ganti dengan manual code untuk consistency
-- Date: 2026-01-30

-- ========================================
-- STEP 1: Drop Old Trigger & Function
-- ========================================

DROP TRIGGER IF EXISTS blood_stock_update_history ON blood_stock;
DROP FUNCTION IF EXISTS update_blood_stock_history_on_update();

-- ========================================
-- VERIFY
-- ========================================

-- Verify trigger dropped
SELECT 
    trigger_name,
    event_object_table
FROM information_schema.triggers
WHERE trigger_name = 'blood_stock_update_history';
-- Should return: No rows

-- Check remaining triggers on blood_stock
SELECT 
    trigger_name,
    event_manipulation,
    event_object_table
FROM information_schema.triggers
WHERE event_object_table = 'blood_stock'
ORDER BY trigger_name;

-- ========================================
-- SUMMARY
-- ========================================
-- ✅ Trigger blood_stock_update_history DROPPED
-- ✅ Function update_blood_stock_history_on_update() DROPPED
-- ✅ Remaining: blood_stock_insert_ledger, blood_stock_update_ledger (untuk stock_ledger)
-- ✅ blood_stock_history sekarang di-handle via code (manual INSERT)
