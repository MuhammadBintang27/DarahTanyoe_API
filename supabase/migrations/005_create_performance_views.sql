-- ============================================
-- Performance Views: Pre-computed Complex Joins
-- ============================================
-- These views pre-compute expensive joins and aggregations
-- to improve query performance for frequently accessed data.
-- 
-- Created: 2026-02-13
-- ============================================

-- ============================================
-- View 1: Partners with Blood Stock Summary
-- ============================================
-- Replaces manual JavaScript joining in partnerController.getPatnerWithBloodStock
-- Aggregates blood stock by institution and blood type

CREATE OR REPLACE VIEW partners_with_stock_summary AS
SELECT 
  i.id,
  i.institution_name,
  i.institution_type,
  i.address,
  i.phone_number,
  i.email,
  i.active,
  i.location,
  i.created_at,
  i.updated_at,
  COALESCE(
    json_agg(
      json_build_object(
        'blood_type', bs.blood_type,
        'total_quantity', bs.total_quantity,
        'batch_count', bs.batch_count,
        'oldest_expiry', bs.oldest_expiry
      )
      ORDER BY bs.blood_type
    ) FILTER (WHERE bs.blood_type IS NOT NULL),
    '[]'::json
  ) AS blood_stock_summary
FROM institutions i
LEFT JOIN (
  SELECT 
    institution_id,
    blood_type,
    SUM(quantity) as total_quantity,
    COUNT(*) as batch_count,
    MIN(expiry_date) as oldest_expiry
  FROM blood_stock
  WHERE status = 'available'
  GROUP BY institution_id, blood_type
) bs ON i.id = bs.institution_id
WHERE i.active = true
GROUP BY i.id, i.institution_name, i.institution_type, i.address, 
         i.phone_number, i.email, i.active, i.location, i.created_at, i.updated_at;

COMMENT ON VIEW partners_with_stock_summary IS 
  'Pre-computed view of institutions with aggregated blood stock summary. Optimizes partner list queries.';

-- ============================================
-- View 2: Blood Requests with Related Data
-- ============================================
-- Pre-joins requester and partner institution data

CREATE OR REPLACE VIEW blood_requests_detail AS
SELECT 
  br.id,
  br.blood_type,
  br.quantity,
  br.unit_type,
  br.patient_name,
  br.urgency_level,
  br.medical_condition,
  br.status,
  br.requester_id,
  br.partner_id,
  br.created_at,
  br.updated_at,
  br.fulfilled_at,
  br.fulfilled_by,
  -- Requester institution
  json_build_object(
    'id', req_inst.id,
    'name', req_inst.institution_name,
    'type', req_inst.institution_type,
    'address', req_inst.address,
    'phone', req_inst.phone_number
  ) as requester,
  -- Partner (PMI) institution
  json_build_object(
    'id', partner_inst.id,
    'name', partner_inst.institution_name,
    'type', partner_inst.institution_type,
    'address', partner_inst.address,
    'phone', partner_inst.phone_number
  ) as partner,
  -- Allocation summary
  COALESCE(alloc.total_allocated, 0) as total_allocated,
  COALESCE(alloc.total_picked_up, 0) as total_picked_up,
  COALESCE(alloc.allocation_count, 0) as allocation_count
FROM blood_requests br
LEFT JOIN institutions req_inst ON br.requester_id = req_inst.id
LEFT JOIN institutions partner_inst ON br.partner_id = partner_inst.id
LEFT JOIN (
  SELECT 
    blood_request_id,
    SUM(quantity_allocated) as total_allocated,
    SUM(quantity_picked_up) as total_picked_up,
    COUNT(*) as allocation_count
  FROM blood_allocation
  WHERE status NOT IN ('cancelled', 'expired')
  GROUP BY blood_request_id
) alloc ON br.id = alloc.blood_request_id;

COMMENT ON VIEW blood_requests_detail IS 
  'Pre-computed view of blood requests with requester, partner, and allocation summary data';

-- ============================================
-- View 3: Allocation with Stock Details
-- ============================================
-- Pre-joins allocation with blood stock information

CREATE OR REPLACE VIEW allocations_with_stock AS
SELECT 
  ba.id,
  ba.blood_request_id,
  ba.blood_stock_id,
  ba.quantity_allocated,
  ba.quantity_picked_up,
  ba.status,
  ba.allocated_at,
  ba.picked_up_at,
  ba.cancelled_at,
  ba.cancellation_reason,
  -- Blood stock details
  json_build_object(
    'id', bs.id,
    'batch_number', bs.batch_number,
    'blood_type', bs.blood_type,
    'expiry_date', bs.expiry_date,
    'quantity', bs.quantity,
    'status', bs.status,
    'institution_id', bs.institution_id
  ) as blood_stock,
  -- Fulfillment request details
  json_build_object(
    'id', fr.id,
    'patient_name', fr.patient_name,
    'blood_type', fr.blood_type
  ) as fulfillment_request
FROM blood_allocation ba
LEFT JOIN blood_stock bs ON ba.blood_stock_id = bs.id
LEFT JOIN fulfillment_requests fr ON ba.fulfillment_request_id = fr.id;

COMMENT ON VIEW allocations_with_stock IS 
  'Pre-computed view of allocations with blood stock and fulfillment request details';

-- ============================================
-- View 4: Donor Confirmations with User Details
-- ============================================
-- Pre-joins donor confirmations with user information

CREATE OR REPLACE VIEW donor_confirmations_with_users AS
SELECT 
  dc.id,
  dc.fulfillment_request_id,
  dc.donor_id,
  dc.status,
  dc.confirmation_origin,
  dc.confirmed_at,
  dc.code_verified_at,
  dc.created_at,
  -- User/Donor details
  json_build_object(
    'id', u.id,
    'full_name', u.full_name,
    'phone_number', u.phone_number,
    'blood_type', u.blood_type,
    'last_donation_date', u.last_donation_date,
    'total_donations', u.total_donations
  ) as donor
FROM donor_confirmations dc
LEFT JOIN users u ON dc.donor_id = u.id;

COMMENT ON VIEW donor_confirmations_with_users IS 
  'Pre-computed view of donor confirmations with user/donor details';

-- ============================================
-- View 5: Dashboard Summary Data
-- ============================================
-- Pre-computes common dashboard statistics

CREATE OR REPLACE VIEW dashboard_pmi_summary AS
SELECT 
  i.id as institution_id,
  i.institution_name,
  -- Blood stock summary
  json_build_object(
    'total_units', COALESCE(stock_sum.total_units, 0),
    'by_type', COALESCE(stock_sum.by_type, '[]'::json)
  ) as blood_stock,
  -- Request summary
  json_build_object(
    'total_requests', COALESCE(req_sum.total_requests, 0),
    'pending', COALESCE(req_sum.pending, 0),
    'approved', COALESCE(req_sum.approved, 0),
    'completed', COALESCE(req_sum.completed, 0)
  ) as requests,
  -- Recent activity
  json_build_object(
    'total_donations', COALESCE(donor_sum.total_donations, 0),
    'this_month', COALESCE(donor_sum.this_month, 0)
  ) as donations
FROM institutions i
LEFT JOIN (
  SELECT 
    institution_id,
    SUM(total_qty) as total_units,
    json_agg(json_build_object('blood_type', blood_type, 'quantity', total_qty)) as by_type
  FROM (
    SELECT 
      institution_id,
      blood_type,
      SUM(quantity) as total_qty
    FROM blood_stock
    WHERE status = 'available'
    GROUP BY institution_id, blood_type
  ) stock_group
  GROUP BY institution_id
) stock_sum ON i.id = stock_sum.institution_id
LEFT JOIN (
  SELECT 
    partner_id,
    COUNT(*) as total_requests,
    COUNT(*) FILTER (WHERE status = 'pending') as pending,
    COUNT(*) FILTER (WHERE status = 'approved') as approved,
    COUNT(*) FILTER (WHERE status = 'completed') as completed
  FROM blood_requests
  WHERE created_at >= NOW() - INTERVAL '90 days'
  GROUP BY partner_id
) req_sum ON i.id = req_sum.partner_id
LEFT JOIN (
  SELECT 
    bs.institution_id,
    COUNT(*) as total_donations,
    COUNT(*) FILTER (WHERE bs.created_at >= DATE_TRUNC('month', NOW())) as this_month
  FROM blood_stock bs
  WHERE bs.donation_id IS NOT NULL
  GROUP BY bs.institution_id
) donor_sum ON i.id = donor_sum.institution_id
WHERE i.institution_type = 'pmi';

COMMENT ON VIEW dashboard_pmi_summary IS 
  'Pre-computed dashboard summary data for PMI institutions';

-- ============================================
-- Materialized View for Heavy Queries (Optional)
-- ============================================
-- For extremely heavy queries, consider materialized views
-- These need to be refreshed periodically

-- Example: Materialized view for partners (refresh every 10 minutes via cron)
-- CREATE MATERIALIZED VIEW IF NOT EXISTS partners_with_stock_materialized AS
-- SELECT * FROM partners_with_stock_summary;
--
-- CREATE UNIQUE INDEX ON partners_with_stock_materialized (id);
--
-- -- Refresh command (run via cron or manually):
-- -- REFRESH MATERIALIZED VIEW CONCURRENTLY partners_with_stock_materialized;

-- ============================================
-- Grant Permissions
-- ============================================
-- Grant read access to authenticated users

GRANT SELECT ON partners_with_stock_summary TO authenticated;
GRANT SELECT ON blood_requests_detail TO authenticated;
GRANT SELECT ON allocations_with_stock TO authenticated;
GRANT SELECT ON donor_confirmations_with_users TO authenticated;
GRANT SELECT ON dashboard_pmi_summary TO authenticated;
