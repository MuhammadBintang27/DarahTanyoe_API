-- Insert sample institutions for testing
-- Password for all test accounts: password123
-- Hashed with bcrypt

-- Insert Test Hospital
INSERT INTO institutions (
  institution_type, 
  email, 
  password, 
  institution_name, 
  address, 
  kota, 
  provinsi, 
  phone_number, 
  verified, 
  active
) VALUES (
  'hospital'::institution_type, 
  'admin@rstest.com', 
  '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy',  -- password123
  'RS Test Jakarta',
  'Jl. Test No. 123, Jakarta Pusat',
  'Jakarta',
  'DKI Jakarta',
  '081234567890',
  true,
  true
) 
ON CONFLICT (email) 
DO UPDATE SET
  password = EXCLUDED.password,
  updated_at = NOW();

-- Insert Test PMI
INSERT INTO institutions (
  institution_type, 
  email, 
  password, 
  institution_name, 
  address, 
  kota, 
  provinsi, 
  phone_number, 
  verified, 
  active
) VALUES (
  'pmi'::institution_type, 
  'admin@pmitest.com', 
  '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy',  -- password123
  'PMI DKI Jakarta',
  'Jl. Gatot Subroto No. 96, Jakarta Selatan',
  'Jakarta',
  'DKI Jakarta',
  '081234567891',
  true,
  true
)
ON CONFLICT (email) 
DO UPDATE SET
  password = EXCLUDED.password,
  updated_at = NOW();

-- Insert sample donor
INSERT INTO users (
  email, 
  phone_number, 
  full_name, 
  address, 
  age, 
  blood_type, 
  active, 
  phone_verified
) VALUES (
  'donor@test.com',
  '628123456789',
  'Donor Test',
  'Jl. Donor Test No. 1, Jakarta',
  25,
  'O+'::blood_type,
  true,
  true
)
ON CONFLICT (phone_number) 
DO UPDATE SET
  full_name = EXCLUDED.full_name,
  updated_at = NOW();

-- Insert sample blood stock (only after PMI exists)
INSERT INTO blood_stock (
  institution_id, 
  blood_type, 
  quantity, 
  unit_type, 
  expiry_date, 
  batch_number, 
  collection_date, 
  component_type,
  status
) VALUES 
(
  (SELECT id FROM institutions WHERE email = 'admin@pmitest.com'),
  'O+'::blood_type, 
  10, 
  'kantong', 
  CURRENT_DATE + INTERVAL '30 days',
  'BATCH-O-001-' || TO_CHAR(NOW(), 'YYYYMMDD'), 
  CURRENT_DATE, 
  'whole_blood',
  'available'::stock_status
),
(
  (SELECT id FROM institutions WHERE email = 'admin@pmitest.com'),
  'A+'::blood_type, 
  5, 
  'kantong', 
  CURRENT_DATE + INTERVAL '25 days',
  'BATCH-A-002-' || TO_CHAR(NOW(), 'YYYYMMDD'), 
  CURRENT_DATE, 
  'whole_blood',
  'available'::stock_status
),
(
  (SELECT id FROM institutions WHERE email = 'admin@pmitest.com'),
  'B+'::blood_type, 
  8, 
  'kantong', 
  CURRENT_DATE + INTERVAL '28 days',
  'BATCH-B-003-' || TO_CHAR(NOW(), 'YYYYMMDD'), 
  CURRENT_DATE, 
  'whole_blood',
  'available'::stock_status
),
(
  (SELECT id FROM institutions WHERE email = 'admin@pmitest.com'),
  'AB+'::blood_type, 
  3, 
  'kantong', 
  CURRENT_DATE + INTERVAL '20 days',
  'BATCH-AB-004-' || TO_CHAR(NOW(), 'YYYYMMDD'), 
  CURRENT_DATE, 
  'whole_blood',
  'available'::stock_status
)
ON CONFLICT (batch_number) DO NOTHING;

-- Verification query
SELECT 
  'Institutions' as table_name, 
  COUNT(*) as count,
  string_agg(email, ', ') as emails
FROM institutions
UNION ALL
SELECT 
  'Users (Donors)', 
  COUNT(*),
  string_agg(phone_number, ', ')
FROM users
UNION ALL
SELECT 
  'Blood Stock', 
  COUNT(*),
  string_agg(blood_type::text || ': ' || quantity::text, ', ')
FROM blood_stock;

-- Show inserted institutions
SELECT 
  institution_type,
  email,
  institution_name,
  kota,
  verified,
  active
FROM institutions
ORDER BY institution_type, institution_name;

-- Show blood stock summary
SELECT 
  blood_type,
  SUM(quantity) as total_quantity,
  COUNT(*) as batches,
  MIN(expiry_date) as nearest_expiry
FROM blood_stock
WHERE status = 'available'
GROUP BY blood_type
ORDER BY blood_type;
