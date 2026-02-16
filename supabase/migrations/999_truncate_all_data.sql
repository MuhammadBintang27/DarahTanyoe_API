-- Truncate All Data (Keep Schema)
-- Script untuk mengosongkan semua data tapi tetap menjaga struktur tabel
-- WARNING: Semua data akan HILANG PERMANEN!

-- Disable triggers temporarily untuk menghindari cascade issues
SET session_replication_role = replica;

-- ========================================
-- TRUNCATE ALL TABLES
-- ========================================
-- Urutan dari child tables ke parent tables untuk menghindari FK constraint errors

-- Truncate audit and logs first
TRUNCATE TABLE audit_logs RESTART IDENTITY CASCADE;

-- Truncate reporting tables
TRUNCATE TABLE monthly_reports RESTART IDENTITY CASCADE;

-- Truncate session tables
TRUNCATE TABLE refresh_tokens RESTART IDENTITY CASCADE;
TRUNCATE TABLE otp_sessions RESTART IDENTITY CASCADE;
TRUNCATE TABLE otp_records RESTART IDENTITY CASCADE;

-- Truncate notification system
TRUNCATE TABLE push_tokens RESTART IDENTITY CASCADE;
TRUNCATE TABLE notifications RESTART IDENTITY CASCADE;

-- Truncate fulfillment system
TRUNCATE TABLE donor_confirmations RESTART IDENTITY CASCADE;
TRUNCATE TABLE fulfillment_requests RESTART IDENTITY CASCADE;

-- Truncate campaign system
TRUNCATE TABLE campaign_registrations RESTART IDENTITY CASCADE;
TRUNCATE TABLE blood_campaigns RESTART IDENTITY CASCADE;

-- Truncate pickup system
TRUNCATE TABLE pickup_schedules RESTART IDENTITY CASCADE;

-- Truncate request system
TRUNCATE TABLE blood_requests RESTART IDENTITY CASCADE;

-- Truncate stock system
TRUNCATE TABLE stock_ledger RESTART IDENTITY CASCADE;
TRUNCATE TABLE blood_stock_history RESTART IDENTITY CASCADE;
TRUNCATE TABLE blood_stock RESTART IDENTITY CASCADE;

-- Truncate donation system
TRUNCATE TABLE donations RESTART IDENTITY CASCADE;

-- Truncate core tables
TRUNCATE TABLE institutions RESTART IDENTITY CASCADE;
TRUNCATE TABLE users RESTART IDENTITY CASCADE;

-- Truncate system settings (optional - comment out jika mau keep settings)
TRUNCATE TABLE system_settings RESTART IDENTITY CASCADE;

-- Re-enable triggers
SET session_replication_role = DEFAULT;

-- ========================================
-- VERIFICATION
-- ========================================

-- Show record counts (should all be 0)
SELECT 'users' as table_name, COUNT(*) as count FROM users
UNION ALL
SELECT 'institutions', COUNT(*) FROM institutions
UNION ALL
SELECT 'donations', COUNT(*) FROM donations
UNION ALL
SELECT 'blood_stock', COUNT(*) FROM blood_stock
UNION ALL
SELECT 'blood_requests', COUNT(*) FROM blood_requests
UNION ALL
SELECT 'blood_campaigns', COUNT(*) FROM blood_campaigns
UNION ALL
SELECT 'notifications', COUNT(*) FROM notifications
UNION ALL
SELECT 'fulfillment_requests', COUNT(*) FROM fulfillment_requests
UNION ALL
SELECT 'donor_confirmations', COUNT(*) FROM donor_confirmations;

-- Success message
SELECT 'Database cleaned successfully. All data removed, schema intact.' as status;
