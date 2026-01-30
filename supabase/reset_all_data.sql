-- ========================================
-- RESET ALL DATA - DELETE ONLY (NO DROPS)
-- ========================================
-- PURPOSE: Completely empty all tables while preserving schema
-- WARNING: This will DELETE ALL data - use with caution!
-- DATE: 2026-01-30

-- Disable foreign key checks temporarily for safer bulk delete
SET session_replication_role = 'replica';

-- ========================================
-- DELETE FROM TABLES (In Dependency Order)
-- ========================================

-- 1. Delete from leaf tables (no other tables depend on them)
DELETE FROM stock_ledger;
DELETE FROM blood_stock_history;
DELETE FROM audit_logs;
DELETE FROM otp_records;
DELETE FROM otp_sessions;

-- 2. Delete from tables with FK to multiple sources
DELETE FROM blood_allocation;
DELETE FROM donor_confirmations;
DELETE FROM push_tokens;
DELETE FROM notifications;
DELETE FROM campaign_registrations;
DELETE FROM fulfillment_requests;
DELETE FROM pickup_schedules;
DELETE FROM blood_stock;
DELETE FROM donations;
DELETE FROM blood_requests;
DELETE FROM blood_campaigns;
DELETE FROM monthly_reports;
DELETE FROM refresh_tokens;

-- 3. Delete from core user/institution tables
DELETE FROM users;
DELETE FROM institutions;

-- 4. Delete from system table (optional, usually keep this)
-- DELETE FROM system_settings;  -- Uncomment if you want to also reset system settings

-- Re-enable foreign key checks
SET session_replication_role = 'origin';

-- ========================================
-- VERIFY COUNTS (should all be 0)
-- ========================================
SELECT 'audit_logs' as table_name, COUNT(*) as row_count FROM audit_logs
UNION ALL
SELECT 'blood_allocation', COUNT(*) FROM blood_allocation
UNION ALL
SELECT 'blood_campaigns', COUNT(*) FROM blood_campaigns
UNION ALL
SELECT 'blood_requests', COUNT(*) FROM blood_requests
UNION ALL
SELECT 'blood_stock', COUNT(*) FROM blood_stock
UNION ALL
SELECT 'blood_stock_history', COUNT(*) FROM blood_stock_history
UNION ALL
SELECT 'campaign_registrations', COUNT(*) FROM campaign_registrations
UNION ALL
SELECT 'donor_confirmations', COUNT(*) FROM donor_confirmations
UNION ALL
SELECT 'donations', COUNT(*) FROM donations
UNION ALL
SELECT 'fulfillment_requests', COUNT(*) FROM fulfillment_requests
UNION ALL
SELECT 'institutions', COUNT(*) FROM institutions
UNION ALL
SELECT 'monthly_reports', COUNT(*) FROM monthly_reports
UNION ALL
SELECT 'notifications', COUNT(*) FROM notifications
UNION ALL
SELECT 'otp_records', COUNT(*) FROM otp_records
UNION ALL
SELECT 'otp_sessions', COUNT(*) FROM otp_sessions
UNION ALL
SELECT 'pickup_schedules', COUNT(*) FROM pickup_schedules
UNION ALL
SELECT 'push_tokens', COUNT(*) FROM push_tokens
UNION ALL
SELECT 'refresh_tokens', COUNT(*) FROM refresh_tokens
UNION ALL
SELECT 'stock_ledger', COUNT(*) FROM stock_ledger
UNION ALL
SELECT 'users', COUNT(*) FROM users
ORDER BY table_name;

-- ========================================
-- SUMMARY
-- ========================================
-- All data has been deleted
-- All tables are now empty (0 rows)
-- Schema and structure remain unchanged
-- All foreign keys, indexes, and triggers are intact
-- Ready to insert new data
