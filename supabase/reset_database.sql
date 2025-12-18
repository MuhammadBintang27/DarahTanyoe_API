-- Reset/Cleanup script
-- WARNING: This will delete ALL data and tables!
-- Only use this if you want to start fresh

-- Step 1: Drop all tables (CASCADE will drop dependent objects)
DROP TABLE IF EXISTS audit_logs CASCADE;
DROP TABLE IF EXISTS monthly_reports CASCADE;
DROP TABLE IF EXISTS system_settings CASCADE;
DROP TABLE IF EXISTS otp_sessions CASCADE;
DROP TABLE IF EXISTS refresh_tokens CASCADE;
DROP TABLE IF EXISTS push_tokens CASCADE;
DROP TABLE IF EXISTS notifications CASCADE;
DROP TABLE IF EXISTS campaign_registrations CASCADE;
DROP TABLE IF EXISTS blood_campaigns CASCADE;
DROP TABLE IF EXISTS pickup_requests CASCADE;
DROP TABLE IF EXISTS blood_requests CASCADE;
DROP TABLE IF EXISTS stock_ledger CASCADE;
DROP TABLE IF EXISTS blood_stock CASCADE;
DROP TABLE IF EXISTS donations CASCADE;
DROP TABLE IF EXISTS otp_records CASCADE;
DROP TABLE IF EXISTS institutions CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- Step 2: Drop all custom types/enums
DROP TYPE IF EXISTS notification_type CASCADE;
DROP TYPE IF EXISTS priority_level CASCADE;
DROP TYPE IF EXISTS campaign_status CASCADE;
DROP TYPE IF EXISTS request_status CASCADE;
DROP TYPE IF EXISTS stock_status CASCADE;
DROP TYPE IF EXISTS pickup_status CASCADE;
DROP TYPE IF EXISTS donation_status CASCADE;
DROP TYPE IF EXISTS institution_type CASCADE;
DROP TYPE IF EXISTS blood_type CASCADE;

-- Step 3: Drop functions
DROP FUNCTION IF EXISTS update_campaign_stats() CASCADE;
DROP FUNCTION IF EXISTS log_stock_mutation() CASCADE;
DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;

-- Verification
SELECT 
  'Tables remaining' as check_type,
  COUNT(*) as count
FROM information_schema.tables 
WHERE table_schema = 'public'
UNION ALL
SELECT 
  'Custom types remaining',
  COUNT(*)
FROM pg_type t
WHERE t.typname IN (
  'blood_type', 
  'institution_type', 
  'donation_status', 
  'request_status', 
  'stock_status',
  'pickup_status',
  'campaign_status',
  'priority_level',
  'notification_type'
);

-- After running this script:
-- 1. Both counts should be 0
-- 2. Now you can run 001_complete_schema.sql to create fresh tables
