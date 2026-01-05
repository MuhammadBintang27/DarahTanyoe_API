-- Sample Donors with Various Distances from Meulaboh, Aceh Barat
-- Meulaboh Location: 4.1425, 96.1358 (Kota Meulaboh, Aceh Barat)
-- Execute this after running 001_complete_schema.sql and inserting institutions

-- Note: First, ensure there's an institution in Meulaboh
-- You can insert one manually or use this:
-- INSERT INTO institutions (institution_type, email, password, institution_name, address, phone_number, location) 
-- VALUES ('hospital', 'rs.meulaboh@test.com', '$2b$10$...hash...', 'RS Umum Cut Nyak Dhien Meulaboh', 
--         'Jl. T. Ben Mahmud, Meulaboh, Aceh Barat', '065521234', 
--         ST_SetSRID(ST_MakePoint(96.1358, 4.1425), 4326)::geography);

-- ========================================
-- DONORS WITHIN 5KM (Very Close)
-- ========================================

INSERT INTO users (phone_number, full_name, address, location, age, blood_type, active, phone_verified, last_donation_date, total_donations) VALUES
('6285277001001', 'Muhammad Rizki', 'Jl. Imam Bonjol No. 12, Meulaboh', ST_SetSRID(ST_MakePoint(96.1378, 4.1445), 4326)::geography, 28, 'A+', true, true, CURRENT_DATE - INTERVAL '120 days', 5),
('6285277001002', 'Cut Mutia', 'Jl. Teuku Umar No. 45, Meulaboh', ST_SetSRID(ST_MakePoint(96.1342, 4.1408), 4326)::geography, 25, 'O+', true, true, CURRENT_DATE - INTERVAL '95 days', 3),
('6285277001003', 'Teuku Ibrahim', 'Jl. Ahmad Yani No. 23, Suak Ribee', ST_SetSRID(ST_MakePoint(96.1392, 4.1398), 4326)::geography, 32, 'B+', true, true, CURRENT_DATE - INTERVAL '100 days', 7),
('6285277001004', 'Safira Rahma', 'Jl. Merdeka No. 67, Meulaboh Kota', ST_SetSRID(ST_MakePoint(96.1325, 4.1452), 4326)::geography, 27, 'AB+', true, true, NULL, 0),
('6285277001005', 'Daud Syahputra', 'Jl. Cut Nyak Dhien No. 89, Meulaboh', ST_SetSRID(ST_MakePoint(96.1405, 4.1410), 4326)::geography, 30, 'A+', true, true, CURRENT_DATE - INTERVAL '85 days', 4);

-- ========================================
-- DONORS 5-10KM (Moderate Distance)
-- ========================================

INSERT INTO users (phone_number, full_name, address, location, age, blood_type, active, phone_verified, last_donation_date, total_donations) VALUES
('6285277001006', 'Nurul Fadillah', 'Desa Meunasah Blang, Meulaboh', ST_SetSRID(ST_MakePoint(96.1198, 4.1523), 4326)::geography, 26, 'B+', true, true, CURRENT_DATE - INTERVAL '110 days', 6),
('6285277001007', 'Yusuf Habibi', 'Gampong Pante Kuyun, Meulaboh', ST_SetSRID(ST_MakePoint(96.1512, 4.1356), 4326)::geography, 29, 'O+', true, true, CURRENT_DATE - INTERVAL '90 days', 8),
('6285277001008', 'Rahmawati', 'Desa Alue Rambong, Johan Pahlawan', ST_SetSRID(ST_MakePoint(96.1145, 4.1589), 4326)::geography, 24, 'A-', true, true, CURRENT_DATE - INTERVAL '105 days', 2),
('6285277001009', 'Ahmad Fauzi', 'Gampong Suak Seuke, Meulaboh', ST_SetSRID(ST_MakePoint(96.1587, 4.1298), 4326)::geography, 31, 'AB+', true, true, NULL, 0),
('6285277001010', 'Siti Aminah', 'Desa Pante Geulumpang, Meulaboh', ST_SetSRID(ST_MakePoint(96.1089, 4.1512), 4326)::geography, 28, 'O+', true, true, CURRENT_DATE - INTERVAL '115 days', 5);

-- ========================================
-- DONORS 10-15KM (Far but Eligible)
-- ========================================

INSERT INTO users (phone_number, full_name, address, location, age, blood_type, active, phone_verified, last_donation_date, total_donations) VALUES
('6285277001011', 'Fahmi Ramadhan', 'Gampong Krueng Kala, Meulaboh', ST_SetSRID(ST_MakePoint(96.0987, 4.1687), 4326)::geography, 33, 'B+', true, true, CURRENT_DATE - INTERVAL '130 days', 3),
('6285277001012', 'Mariana', 'Desa Ujong Tanoh, Johan Pahlawan', ST_SetSRID(ST_MakePoint(96.0845, 4.1545), 4326)::geography, 27, 'A+', true, true, CURRENT_DATE - INTERVAL '95 days', 4),
('6285277001013', 'Saiful Bahri', 'Gampong Keutapang, Meulaboh', ST_SetSRID(ST_MakePoint(96.1698, 4.1198), 4326)::geography, 30, 'O-', true, true, CURRENT_DATE - INTERVAL '120 days', 6),
('6285277001014', 'Rina Marlina', 'Desa Gampong Baro, Johan Pahlawan', ST_SetSRID(ST_MakePoint(96.1012, 4.1789), 4326)::geography, 25, 'A+', true, true, NULL, 0),
('6285277001015', 'Irfan Maulana', 'Gampong Suak Timah, Meulaboh', ST_SetSRID(ST_MakePoint(96.1756, 4.1312), 4326)::geography, 29, 'B-', true, true, CURRENT_DATE - INTERVAL '100 days', 7);

-- ========================================
-- DONORS 15-20KM (Edge of Search Radius)
-- ========================================

INSERT INTO users (phone_number, full_name, address, location, age, blood_type, active, phone_verified, last_donation_date, total_donations) VALUES
('6285277001016', 'Zulfikar', 'Desa Kuala Bhee, Meulaboh', ST_SetSRID(ST_MakePoint(96.0698, 4.1598), 4326)::geography, 32, 'O+', true, true, CURRENT_DATE - INTERVAL '140 days', 2),
('6285277001017', 'Hanna Safitri', 'Gampong Pasi Jambu, Johan Pahlawan', ST_SetSRID(ST_MakePoint(96.0745, 4.1712), 4326)::geography, 26, 'AB-', true, true, CURRENT_DATE - INTERVAL '110 days', 5),
('6285277001018', 'Ridwan Abdullah', 'Desa Alue Ie Mameh, Meulaboh', ST_SetSRID(ST_MakePoint(96.1845, 4.1089), 4326)::geography, 28, 'A+', true, true, CURRENT_DATE - INTERVAL '125 days', 4),
('6285277001019', 'Dewi Sartika', 'Gampong Meunasah Blang Krueng', ST_SetSRID(ST_MakePoint(96.0612, 4.1689), 4326)::geography, 24, 'B+', true, true, NULL, 0),
('6285277001020', 'Heru Gunawan', 'Desa Lhok Kruet, Johan Pahlawan', ST_SetSRID(ST_MakePoint(96.1898, 4.1245), 4326)::geography, 31, 'O+', true, true, CURRENT_DATE - INTERVAL '105 days', 8);

-- ========================================
-- DONORS > 20KM (Out of Range - For Testing)
-- ========================================

INSERT INTO users (phone_number, full_name, address, location, age, blood_type, active, phone_verified, last_donation_date, total_donations) VALUES
('6285277001021', 'Azhari', 'Desa Pante Ceureumen, Sungai Mas', ST_SetSRID(ST_MakePoint(96.0345, 4.2012), 4326)::geography, 34, 'A+', true, true, CURRENT_DATE - INTERVAL '100 days', 5),
('6285277001022', 'Fitria Ningsih', 'Gampong Babah Krueng, Woyla', ST_SetSRID(ST_MakePoint(96.2156, 4.0989), 4326)::geography, 27, 'B+', true, true, CURRENT_DATE - INTERVAL '90 days', 3),
('6285277001023', 'Muhammad Yusuf', 'Desa Lhok Banie, Samatiga', ST_SetSRID(ST_MakePoint(96.0198, 4.2198), 4326)::geography, 29, 'O+', true, true, NULL, 0),
('6285277001024', 'Salmah', 'Gampong Pante Ara, Woyla Barat', ST_SetSRID(ST_MakePoint(96.2298, 4.0812), 4326)::geography, 25, 'AB+', true, true, CURRENT_DATE - INTERVAL '120 days', 4),
('6285277001025', 'Ibrahim Hasan', 'Desa Kuala Baro, Woyla Timur', ST_SetSRID(ST_MakePoint(96.2412, 4.1156), 4326)::geography, 30, 'A-', true, true, CURRENT_DATE - INTERVAL '105 days', 6);

-- ========================================
-- RECENTLY DONATED (Not Eligible - < 8 weeks)
-- ========================================

INSERT INTO users (phone_number, full_name, address, location, age, blood_type, active, phone_verified, last_donation_date, total_donations) VALUES
('6285277001026', 'Hasanah', 'Jl. Teuku Umar No. 34, Meulaboh', ST_SetSRID(ST_MakePoint(96.1368, 4.1418), 4326)::geography, 26, 'O+', true, true, CURRENT_DATE - INTERVAL '30 days', 10),
('6285277001027', 'Faisal Rahman', 'Jl. Ahmad Yani No. 56, Meulaboh', ST_SetSRID(ST_MakePoint(96.1382, 4.1435), 4326)::geography, 33, 'A+', true, true, CURRENT_DATE - INTERVAL '45 days', 12),
('6285277001028', 'Nurhayati', 'Jl. Merdeka No. 78, Meulaboh', ST_SetSRID(ST_MakePoint(96.1335, 4.1442), 4326)::geography, 28, 'B+', true, true, CURRENT_DATE - INTERVAL '20 days', 8);

-- ========================================
-- HIGH COMMITMENT RATE (Campaign Active Users)
-- ========================================

UPDATE users 
SET 
  total_campaigns_registered = 10,
  total_campaigns_completed = 9,
  total_campaigns_cancelled = 0
WHERE phone_number IN ('6285277001003', '6285277001007', '6285277001020');

-- ========================================
-- LOW COMMITMENT RATE (Many Cancellations)
-- ========================================

UPDATE users 
SET 
  total_campaigns_registered = 8,
  total_campaigns_completed = 2,
  total_campaigns_cancelled = 5
WHERE phone_number IN ('6285277001004', '6285277001009', '6285277001014');

-- ========================================
-- FREQUENT DONORS (High History Score)
-- ========================================

UPDATE users 
SET 
  total_donations = 15,
  last_donation_date = CURRENT_DATE - INTERVAL '100 days'
WHERE phone_number IN ('6285277001003', '6285277001010', '6285277001027');

-- ========================================
-- REJECTED DONORS (Penalty)
-- ========================================

UPDATE users 
SET 
  total_rejections = 3,
  last_rejection_date = CURRENT_DATE - INTERVAL '60 days',
  last_rejection_reason = 'Tekanan darah rendah'
WHERE phone_number IN ('6285277001008', '6285277001013');

-- ========================================
-- VERIFY DATA FOR MEULABOH
-- ========================================

-- Count by distance ranges (Update institution email if different)
SELECT 
  CASE 
    WHEN distance_km <= 5 THEN '0-5 km'
    WHEN distance_km <= 10 THEN '5-10 km'
    WHEN distance_km <= 15 THEN '10-15 km'
    WHEN distance_km <= 20 THEN '15-20 km'
    ELSE '> 20 km'
  END AS distance_range,
  COUNT(*) AS donor_count
FROM (
  SELECT 
    u.full_name,
    ROUND((ST_Distance(u.location, i.location) / 1000)::numeric, 2) AS distance_km
  FROM users u
  CROSS JOIN institutions i
  WHERE i.email = 'rs.meulaboh@test.com' -- Update this to match your Meulaboh institution
    AND u.location IS NOT NULL
    AND u.phone_number LIKE '628527700%'
) subquery
GROUP BY distance_range
ORDER BY distance_range;

-- Show all Meulaboh donors with distances and eligibility
SELECT 
  u.full_name,
  u.phone_number,
  u.blood_type,
  u.address,
  ROUND((ST_Distance(u.location, i.location) / 1000)::numeric, 2) AS distance_km,
  u.total_donations,
  u.last_donation_date,
  CASE 
    WHEN u.last_donation_date IS NULL OR u.last_donation_date < CURRENT_DATE - INTERVAL '56 days' 
    THEN 'Eligible'
    ELSE 'Not Eligible (Recent Donation)'
  END AS eligibility_status
FROM users u
CROSS JOIN institutions i
WHERE i.email = 'rs.meulaboh@test.com' -- Update this to match your Meulaboh institution
  AND u.location IS NOT NULL
  AND u.phone_number LIKE '628527700%'
ORDER BY distance_km;

-- Note: Scoring function commented out - implement find_eligible_donors_simplified() first
-- Test scoring function for O+ donors in Meulaboh
-- SELECT 
--   donor_id,
--   full_name,
--   blood_type,
--   distance_km,
--   total_donations,
--   completion_rate,
--   distance_score,
--   history_score,
--   commitment_score,
--   total_score,
--   priority_flag
-- FROM find_eligible_donors_simplified(
--   'O+'::blood_type,
--   (SELECT id FROM institutions WHERE email = 'rs.meulaboh@test.com'),
--   (SELECT location FROM institutions WHERE email = 'rs.meulaboh@test.com'),
--   20, -- 20km radius
--   50  -- limit 50 donors
-- )
-- ORDER BY total_score DESC;

-- Summary stats
SELECT 
  'Total Meulaboh Donors' AS metric,
  COUNT(*) AS value
FROM users 
WHERE phone_number LIKE '628527700%'
UNION ALL
SELECT 
  'Eligible Donors (>56 days)' AS metric,
  COUNT(*) AS value
FROM users 
WHERE phone_number LIKE '628527700%'
  AND (last_donation_date IS NULL OR last_donation_date < CURRENT_DATE - INTERVAL '56 days')
UNION ALL
SELECT 
  'Within 10km' AS metric,
  COUNT(*) AS value
FROM (
  SELECT ROUND((ST_Distance(u.location, i.location) / 1000)::numeric, 2) AS distance_km
  FROM users u
  CROSS JOIN institutions i
  WHERE i.email = 'rs.meulaboh@test.com'
    AND u.phone_number LIKE '628527700%'
) subquery
WHERE distance_km <= 10;
