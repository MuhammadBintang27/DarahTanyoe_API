-- ========================================
-- DISABLE RLS COMPLETELY - CLEAR ALL POLICIES
-- ========================================
-- This migration removes all existing RLS policies and disables RLS

-- Drop all existing policies
DROP POLICY IF EXISTS "Users can view own profile" ON users;
DROP POLICY IF EXISTS "Users can update own profile" ON users;
DROP POLICY IF EXISTS "Users can signup" ON users;
DROP POLICY IF EXISTS "Institutions can view all active users" ON users;

DROP POLICY IF EXISTS "Institutions can view own profile" ON institutions;
DROP POLICY IF EXISTS "Institutions can update own profile" ON institutions;
DROP POLICY IF EXISTS "Institutions can signup" ON institutions;
DROP POLICY IF EXISTS "Anyone can view verified institutions" ON institutions;

DROP POLICY IF EXISTS "Anyone can create OTP records" ON otp_records;
DROP POLICY IF EXISTS "Allow read OTP for verification" ON otp_records;
DROP POLICY IF EXISTS "OTP can be updated" ON otp_records;

DROP POLICY IF EXISTS "Donors can view own donations" ON donations;
DROP POLICY IF EXISTS "Institutions can view donations" ON donations;
DROP POLICY IF EXISTS "Donors can create donations" ON donations;
DROP POLICY IF EXISTS "Institutions can update donations" ON donations;

DROP POLICY IF EXISTS "Institutions can view own blood stock" ON blood_stock;
DROP POLICY IF EXISTS "Institutions can create blood stock" ON blood_stock;
DROP POLICY IF EXISTS "Institutions can update own blood stock" ON blood_stock;

DROP POLICY IF EXISTS "Institutions can view stock ledger" ON stock_ledger;
DROP POLICY IF EXISTS "System can create ledger entries" ON stock_ledger;

DROP POLICY IF EXISTS "Institutions can view own stock history" ON blood_stock_history;
DROP POLICY IF EXISTS "System can create history entries" ON blood_stock_history;

DROP POLICY IF EXISTS "Institutions can view own requests" ON blood_requests;
DROP POLICY IF EXISTS "Institutions can view shared requests" ON blood_requests;
DROP POLICY IF EXISTS "Institutions can create blood requests" ON blood_requests;
DROP POLICY IF EXISTS "Institutions can update own requests" ON blood_requests;

DROP POLICY IF EXISTS "Institutions can view own campaigns" ON blood_campaigns;
DROP POLICY IF EXISTS "Anyone can view active campaigns" ON blood_campaigns;
DROP POLICY IF EXISTS "Institutions can create campaigns" ON blood_campaigns;
DROP POLICY IF EXISTS "Institutions can update own campaigns" ON blood_campaigns;

DROP POLICY IF EXISTS "Users can view own registrations" ON campaign_registrations;
DROP POLICY IF EXISTS "Organizers can view registrations" ON campaign_registrations;
DROP POLICY IF EXISTS "Users can register for campaigns" ON campaign_registrations;
DROP POLICY IF EXISTS "Users can update own registration" ON campaign_registrations;

DROP POLICY IF EXISTS "Users can view own notifications" ON notifications;
DROP POLICY IF EXISTS "Institutions can view own notifications" ON notifications;
DROP POLICY IF EXISTS "Allow notification creation" ON notifications;
DROP POLICY IF EXISTS "Users can update own notifications" ON notifications;
DROP POLICY IF EXISTS "Institutions can update own notifications" ON notifications;

DROP POLICY IF EXISTS "Users can manage own push tokens" ON push_tokens;
DROP POLICY IF EXISTS "Users can insert push tokens" ON push_tokens;
DROP POLICY IF EXISTS "Users can delete push tokens" ON push_tokens;
DROP POLICY IF EXISTS "Institutions can manage own push tokens" ON push_tokens;
DROP POLICY IF EXISTS "Institutions can insert push tokens" ON push_tokens;
DROP POLICY IF EXISTS "Institutions can delete push tokens" ON push_tokens;

DROP POLICY IF EXISTS "PMI can view own fulfillment requests" ON fulfillment_requests;
DROP POLICY IF EXISTS "PMI can create fulfillment requests" ON fulfillment_requests;
DROP POLICY IF EXISTS "PMI can update fulfillment requests" ON fulfillment_requests;

DROP POLICY IF EXISTS "Donors can view own confirmations" ON donor_confirmations;
DROP POLICY IF EXISTS "Institutions can view confirmations" ON donor_confirmations;
DROP POLICY IF EXISTS "System can create confirmations" ON donor_confirmations;
DROP POLICY IF EXISTS "Donors can update own confirmations" ON donor_confirmations;
DROP POLICY IF EXISTS "PMI can update confirmations" ON donor_confirmations;

DROP POLICY IF EXISTS "Users can view own tokens" ON refresh_tokens;
DROP POLICY IF EXISTS "Institutions can view own tokens" ON refresh_tokens;
DROP POLICY IF EXISTS "Allow token creation" ON refresh_tokens;

DROP POLICY IF EXISTS "Allow OTP session creation" ON otp_sessions;
DROP POLICY IF EXISTS "Allow OTP session viewing" ON otp_sessions;

DROP POLICY IF EXISTS "PMI can view own pickups" ON pickup_schedules;
DROP POLICY IF EXISTS "Hospital can view own pickups" ON pickup_schedules;
DROP POLICY IF EXISTS "PMI can create pickups" ON pickup_schedules;
DROP POLICY IF EXISTS "Institutions can update pickups" ON pickup_schedules;

DROP POLICY IF EXISTS "Anyone can view public settings" ON system_settings;

DROP POLICY IF EXISTS "System can create audit logs" ON audit_logs;

-- Disable RLS on ALL tables
ALTER TABLE users DISABLE ROW LEVEL SECURITY;
ALTER TABLE institutions DISABLE ROW LEVEL SECURITY;
ALTER TABLE otp_records DISABLE ROW LEVEL SECURITY;
ALTER TABLE donations DISABLE ROW LEVEL SECURITY;
ALTER TABLE blood_stock DISABLE ROW LEVEL SECURITY;
ALTER TABLE stock_ledger DISABLE ROW LEVEL SECURITY;
ALTER TABLE blood_stock_history DISABLE ROW LEVEL SECURITY;
ALTER TABLE blood_requests DISABLE ROW LEVEL SECURITY;
ALTER TABLE pickup_schedules DISABLE ROW LEVEL SECURITY;
ALTER TABLE blood_campaigns DISABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_registrations DISABLE ROW LEVEL SECURITY;
ALTER TABLE notifications DISABLE ROW LEVEL SECURITY;
ALTER TABLE push_tokens DISABLE ROW LEVEL SECURITY;
ALTER TABLE fulfillment_requests DISABLE ROW LEVEL SECURITY;
ALTER TABLE donor_confirmations DISABLE ROW LEVEL SECURITY;
ALTER TABLE refresh_tokens DISABLE ROW LEVEL SECURITY;
ALTER TABLE otp_sessions DISABLE ROW LEVEL SECURITY;
ALTER TABLE monthly_reports DISABLE ROW LEVEL SECURITY;
ALTER TABLE system_settings DISABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs DISABLE ROW LEVEL SECURITY;

-- Grant full public access for development
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;

-- Verify all RLS disabled
SELECT table_name, rowsecurity
FROM information_schema.tables
WHERE table_schema = 'public' AND rowsecurity = true;
