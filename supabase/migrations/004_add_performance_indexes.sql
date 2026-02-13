-- ============================================
-- Performance Optimization: Add Composite Indexes
-- ============================================
-- This migration adds composite indexes on frequently queried column combinations
-- to improve query performance across the application.
-- 
-- Expected performance improvements:
-- - 2-10x faster on filtered queries
-- - Reduced database load
-- - Better response times for list endpoints
--
-- Created: 2026-02-13
-- ============================================

-- 1. Blood Requests: Optimize partner/status filtering with timeline sorting
-- Use case: GET /bloodReq/partner/:institutionId with status filters
CREATE INDEX IF NOT EXISTS idx_blood_requests_partner_status_created 
ON blood_requests (partner_id, status, created_at DESC)
WHERE partner_id IS NOT NULL;

-- Additional index for requester-based queries
CREATE INDEX IF NOT EXISTS idx_blood_requests_requester_status_created 
ON blood_requests (requester_id, status, created_at DESC)
WHERE requester_id IS NOT NULL;

-- 2. Blood Stock: Optimize institution/type/status filtering
-- Use case: Stock availability checks, allocation queries
CREATE INDEX IF NOT EXISTS idx_blood_stock_institution_type_status 
ON blood_stock (institution_id, blood_type, status);

-- Additional index for expiry date checks
CREATE INDEX IF NOT EXISTS idx_blood_stock_status_expiry 
ON blood_stock (status, expiry_date)
WHERE status IN ('available', 'reserved');

-- 3. Blood Allocation: Optimize request-based allocation lookups
-- Use case: GET /allocation/request/:id endpoints
CREATE INDEX IF NOT EXISTS idx_blood_allocation_request_status 
ON blood_allocation (blood_request_id, status);

-- Additional index for stock-based lookups
CREATE INDEX IF NOT EXISTS idx_blood_allocation_stock_status 
ON blood_allocation (blood_stock_id, status);

-- 4. Donor Confirmations: Optimize donor status tracking
-- Use case: Donor confirmation workflows, fulfillment tracking
CREATE INDEX IF NOT EXISTS idx_donor_confirmations_donor_status_origin 
ON donor_confirmations (donor_id, status, confirmation_origin);

-- Additional index for fulfillment-based lookups
CREATE INDEX IF NOT EXISTS idx_donor_confirmations_fulfillment_status 
ON donor_confirmations (fulfillment_request_id, status);

-- 5. Notifications: Optimize institution notification queries
-- Use case: GET /notifications/institution/:id with unread filtering
CREATE INDEX IF NOT EXISTS idx_notifications_institution_read_created 
ON notifications (institution_id, is_read, created_at DESC)
WHERE institution_id IS NOT NULL;

-- Additional index for user notifications
CREATE INDEX IF NOT EXISTS idx_notifications_user_read_created 
ON notifications (user_id, is_read, created_at DESC)
WHERE user_id IS NOT NULL;

-- 6. Fulfillment Requests: Optimize PMI and status filtering
-- Use case: GET /fulfillment/ with filters
CREATE INDEX IF NOT EXISTS idx_fulfillment_requests_pmi_status 
ON fulfillment_requests (pmi_id, status, created_at DESC)
WHERE pmi_id IS NOT NULL;

-- 7. Blood Campaigns: Optimize organizer and status filtering
-- Use case: GET /campaigns/ with filters
CREATE INDEX IF NOT EXISTS idx_blood_campaigns_organizer_status 
ON blood_campaigns (organizer_id, status, start_date DESC);

-- 8. Pickup Schedules: Optimize date and status filtering
-- Use case: GET /pickup-schedules/ with filters
CREATE INDEX IF NOT EXISTS idx_pickup_schedules_pmi_status_date 
ON pickup_schedules (pmi_id, status, pickup_date)
WHERE pmi_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pickup_schedules_hospital_status_date 
ON pickup_schedules (hospital_id, status, pickup_date)
WHERE hospital_id IS NOT NULL;

-- 9. Blood Stock History: Optimize institution history queries
-- Use case: Audit trail and history tracking
CREATE INDEX IF NOT EXISTS idx_blood_stock_history_institution_type 
ON blood_stock_history (institution_id, change_type, created_at DESC);

-- ============================================
-- Verification Queries
-- ============================================
-- Run these queries to verify index usage:
--
-- 1. Check all indexes on blood_requests:
--    SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'blood_requests';
--
-- 2. Explain query plan for partners with status filter:
--    EXPLAIN ANALYZE 
--    SELECT * FROM blood_requests 
--    WHERE partner_id = 'some-uuid' AND status = 'pending' 
--    ORDER BY created_at DESC LIMIT 20;
--
-- 3. Check blood_stock index usage:
--    SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'blood_stock';
--
-- ============================================

-- Add comment for documentation
COMMENT ON INDEX idx_blood_requests_partner_status_created IS 
  'Composite index for optimizing partner blood request queries with status filtering and timeline sorting';

COMMENT ON INDEX idx_blood_stock_institution_type_status IS 
  'Composite index for optimizing blood stock availability queries by institution, type, and status';

COMMENT ON INDEX idx_blood_allocation_request_status IS 
  'Composite index for optimizing allocation lookups by blood request and status';

COMMENT ON INDEX idx_donor_confirmations_donor_status_origin IS 
  'Composite index for optimizing donor confirmation tracking queries';

COMMENT ON INDEX idx_notifications_institution_read_created IS 
  'Composite index for optimizing institution notification queries with unread filtering';
