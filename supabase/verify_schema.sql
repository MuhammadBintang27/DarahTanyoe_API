-- Quick verification script
-- Run this to check if tables are created properly

-- 1. Check all tables exist
SELECT 
  table_name,
  CASE 
    WHEN table_name IN ('institutions', 'users', 'blood_stock', 'blood_requests', 'donations') 
    THEN '✅ CORE TABLE'
    ELSE '📋 Support table'
  END as table_type
FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;

-- 2. Check enum types
SELECT 
  typname as enum_name,
  string_agg(enumlabel, ', ' ORDER BY enumsortorder) as enum_values
FROM pg_type t
JOIN pg_enum e ON t.oid = e.enumtypid
WHERE t.typname IN (
  'blood_type', 
  'institution_type', 
  'donation_status', 
  'request_status', 
  'stock_status'
)
GROUP BY typname
ORDER BY typname;

-- 3. Check sample data
SELECT 'Institutions' as table_name, COUNT(*) as record_count FROM institutions
UNION ALL
SELECT 'Users', COUNT(*) FROM users
UNION ALL
SELECT 'Blood Stock', COUNT(*) FROM blood_stock
UNION ALL
SELECT 'Donations', COUNT(*) FROM donations
UNION ALL
SELECT 'Blood Requests', COUNT(*) FROM blood_requests;

-- 4. Check institutions details
SELECT 
  id,
  institution_type,
  email,
  institution_name,
  verified,
  active,
  created_at
FROM institutions
ORDER BY created_at DESC;

-- 5. Check users (donors) details
SELECT 
  id,
  phone_number,
  full_name,
  blood_type,
  age,
  phone_verified,
  active
FROM users
ORDER BY created_at DESC;

-- 6. Check blood stock availability
SELECT 
  blood_type,
  SUM(quantity) as total_quantity,
  COUNT(*) as batch_count,
  MIN(expiry_date) as nearest_expiry
FROM blood_stock
WHERE status = 'available'
  AND expiry_date > CURRENT_DATE
GROUP BY blood_type
ORDER BY blood_type;

-- 7. Check indexes
SELECT 
  schemaname,
  tablename,
  indexname
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('institutions', 'users', 'blood_stock', 'blood_requests')
ORDER BY tablename, indexname;
