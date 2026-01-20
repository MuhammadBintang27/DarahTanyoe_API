-- Sample Donors with Various Distances from PMI DKI Jakarta
-- PMI Location: -6.2327, 106.8105 (Jl. Gatot Subroto No. 96)
-- Execute this after running 001_complete_schema.sql

-- ========================================
-- DONORS WITHIN 5KM (Very Close)
-- ========================================

INSERT INTO users (phone_number, full_name, address, location, date_of_birth, blood_type, active, phone_verified, last_donation_date, total_donations) VALUES
('6281234567801', 'Ahmad Pratama', 'Jl. Senopati No. 45, Jakarta Selatan', ST_SetSRID(ST_MakePoint(106.8142, -6.2285), 4326)::geography, '1996-01-15', 'A+', true, true, CURRENT_DATE - INTERVAL '120 days', 5),
('6281234567802', 'Budi Santoso', 'Jl. Wijaya I No. 23, Kebayoran Baru', ST_SetSRID(ST_MakePoint(106.7954, -6.2403), 4326)::geography, '1992-03-20', 'B+', true, true, CURRENT_DATE - INTERVAL '90 days', 8),
('6281234567803', 'Citra Dewi', 'Jl. Panglima Polim No. 67, Jakarta Selatan', ST_SetSRID(ST_MakePoint(106.7998, -6.2508), 4326)::geography, '1999-07-10', 'O+', true, true, CURRENT_DATE - INTERVAL '100 days', 3),
('6281234567804', 'Doni Kurniawan', 'Jl. Trunojoyo No. 12, Kebayoran Baru', ST_SetSRID(ST_MakePoint(106.7926, -6.2470), 4326)::geography, '1994-11-05', 'AB+', true, true, NULL, 0),
('6281234567805', 'Eka Putri', 'Jl. Pattimura No. 89, Kebayoran Baru', ST_SetSRID(ST_MakePoint(106.7980, -6.2450), 4326)::geography, '1997-09-25', 'A+', true, true, CURRENT_DATE - INTERVAL '95 days', 4);

-- ========================================
-- DONORS 5-10KM (Moderate Distance)
-- ========================================

INSERT INTO users (phone_number, full_name, address, location, date_of_birth, blood_type, active, phone_verified, last_donation_date, total_donations) VALUES
('6281234567806', 'Fajar Hidayat', 'Jl. Casablanca No. 88, Tebet', ST_SetSRID(ST_MakePoint(106.8429, -6.2249), 4326)::geography, '1995-05-12', 'B+', true, true, CURRENT_DATE - INTERVAL '110 days', 6),
('6281234567807', 'Gita Maharani', 'Jl. Mampang Prapatan Raya No. 45', ST_SetSRID(ST_MakePoint(106.8298, -6.2601), 4326)::geography, '1998-12-18', 'O+', true, true, CURRENT_DATE - INTERVAL '85 days', 7),
('6281234567808', 'Hendra Wijaya', 'Jl. Kuningan Barat No. 30', ST_SetSRID(ST_MakePoint(106.8207, -6.2287), 4326)::geography, '1993-08-30', 'A-', true, true, CURRENT_DATE - INTERVAL '120 days', 2),
('6281234567809', 'Indah Sari', 'Jl. Sisingamangaraja No. 56', ST_SetSRID(ST_MakePoint(106.7995, -6.2680), 4326)::geography, '2000-04-22', 'AB+', true, true, NULL, 0),
('6281234567810', 'Joko Susilo', 'Jl. TB Simatupang No. 123, Cilandak', ST_SetSRID(ST_MakePoint(106.7876, -6.2982), 4326)::geography, '1989-06-14', 'O+', true, true, CURRENT_DATE - INTERVAL '100 days', 9);

-- ========================================
-- DONORS 10-15KM (Far but Eligible)
-- ========================================

INSERT INTO users (phone_number, full_name, address, location, date_of_birth, blood_type, active, phone_verified, last_donation_date, total_donations) VALUES
('6281234567811', 'Kartika Putri', 'Jl. Pancoran No. 67, Jakarta Selatan', ST_SetSRID(ST_MakePoint(106.8498, -6.2532), 4326)::geography, '1996-02-28', 'B+', true, true, CURRENT_DATE - INTERVAL '130 days', 3),
('6281234567812', 'Luthfi Rahman', 'Jl. Ragunan No. 45, Pasar Minggu', ST_SetSRID(ST_MakePoint(106.8212, -6.2989), 4326)::geography, '1991-10-11', 'A+', true, true, CURRENT_DATE - INTERVAL '90 days', 5),
('6281234567813', 'Maya Anjani', 'Jl. Fatmawati No. 78, Cilandak', ST_SetSRID(ST_MakePoint(106.7941, -6.2842), 4326)::geography, '1998-01-05', 'O-', true, true, CURRENT_DATE - INTERVAL '105 days', 4),
('6281234567814', 'Nanda Permana', 'Jl. Radio Dalam No. 12', ST_SetSRID(ST_MakePoint(106.7894, -6.2612), 4326)::geography, '1995-07-19', 'A+', true, true, NULL, 0),
('6281234567815', 'Olivia Tan', 'Jl. Warung Buncit No. 34', ST_SetSRID(ST_MakePoint(106.8356, -6.2735), 4326)::geography, 27, 'B-', true, true, CURRENT_DATE - INTERVAL '115 days', 6);

-- ========================================
-- DONORS 15-20KM (Edge of Search Radius)
-- ========================================

INSERT INTO users (phone_number, full_name, address, location, date_of_birth, blood_type, active, phone_verified, last_donation_date, total_donations) VALUES
('6281234567816', 'Putra Mahendra', 'Jl. Pasar Minggu Raya No. 89', ST_SetSRID(ST_MakePoint(106.8445, -6.2898), 4326)::geography, '1994-09-03', 'O+', true, true, CURRENT_DATE - INTERVAL '140 days', 2),
('6281234567817', 'Qori Handayani', 'Jl. Cipete Raya No. 56', ST_SetSRID(ST_MakePoint(106.7865, -6.2789), 4326)::geography, '1999-11-27', 'AB-', true, true, CURRENT_DATE - INTERVAL '95 days', 7),
('6281234567818', 'Reza Kurniawan', 'Jl. Ampera Raya No. 123, Pejaten', ST_SetSRID(ST_MakePoint(106.8512, -6.2612), 4326)::geography, '1992-12-15', 'A+', true, true, CURRENT_DATE - INTERVAL '110 days', 4),
('6281234567819', 'Siska Amelia', 'Jl. Condet No. 45, Jakarta Timur', ST_SetSRID(ST_MakePoint(106.8689, -6.2823), 4326)::geography, '1996-06-08', 'B+', true, true, NULL, 0),
('6281234567820', 'Toni Gunawan', 'Jl. Kemang Raya No. 67', ST_SetSRID(ST_MakePoint(106.8156, -6.2645), 4326)::geography, '1993-04-21', 'O+', true, true, CURRENT_DATE - INTERVAL '125 days', 8);

-- ========================================
-- DONORS > 20KM (Out of Range - For Testing)
-- ========================================

INSERT INTO users (phone_number, full_name, address, location, date_of_birth, blood_type, active, phone_verified, last_donation_date, total_donations) VALUES
('6281234567821', 'Umar Fauzi', 'Jl. Cibubur No. 123, Jakarta Timur', ST_SetSRID(ST_MakePoint(106.8934, -6.3543), 4326)::geography, '1990-07-22', 'A+', true, true, CURRENT_DATE - INTERVAL '100 days', 5),
('6281234567822', 'Vina Melati', 'Jl. Depok Raya No. 45, Depok', ST_SetSRID(ST_MakePoint(106.7987, -6.4012), 4326)::geography, '1998-08-09', 'B+', true, true, CURRENT_DATE - INTERVAL '90 days', 3),
('6281234567823', 'Wahyu Hidayat', 'Jl. Pondok Indah No. 67', ST_SetSRID(ST_MakePoint(106.7845, -6.2654), 4326)::geography, '1995-12-01', 'O+', true, true, NULL, 0),
('6281234567824', 'Xenia Putri', 'Jl. Jagakarsa No. 89, Jakarta Selatan', ST_SetSRID(ST_MakePoint(106.8234, -6.3412), 4326)::geography, '1997-05-16', 'AB+', true, true, CURRENT_DATE - INTERVAL '120 days', 4),
('6281234567825', 'Yudi Santoso', 'Jl. Lebak Bulus No. 34', ST_SetSRID(ST_MakePoint(106.7678, -6.2923), 4326)::geography, '1994-10-25', 'A-', true, true, CURRENT_DATE - INTERVAL '105 days', 6);

-- ========================================
-- RECENTLY DONATED (Not Eligible - < 8 weeks)
-- ========================================

INSERT INTO users (phone_number, full_name, address, location, date_of_birth, blood_type, active, phone_verified, last_donation_date, total_donations) VALUES
('6281234567826', 'Zahra Amira', 'Jl. Senopati No. 12, Jakarta Selatan', ST_SetSRID(ST_MakePoint(106.8132, -6.2295), 4326)::geography, '1999-01-30', 'O+', true, true, CURRENT_DATE - INTERVAL '30 days', 10),
('6281234567827', 'Agus Setiawan', 'Jl. Wijaya II No. 34', ST_SetSRID(ST_MakePoint(106.7964, -6.2413), 4326)::geography, '1991-09-17', 'A+', true, true, CURRENT_DATE - INTERVAL '45 days', 12),
('6281234567828', 'Bella Safitri', 'Jl. Panglima Polim No. 56', ST_SetSRID(ST_MakePoint(106.8008, -6.2518), 4326)::geography, '1996-11-12', 'B+', true, true, CURRENT_DATE - INTERVAL '20 days', 8);

-- ========================================
-- HIGH COMMITMENT RATE (Campaign Active Users)
-- ========================================

UPDATE users 
SET 
  total_campaigns_registered = 10,
  total_campaigns_completed = 9,
  total_campaigns_cancelled = 0
WHERE phone_number IN ('6281234567802', '6281234567807', '6281234567820');

-- ========================================
-- LOW COMMITMENT RATE (Many Cancellations)
-- ========================================

UPDATE users 
SET 
  total_campaigns_registered = 8,
  total_campaigns_completed = 2,
  total_campaigns_cancelled = 5
WHERE phone_number IN ('6281234567804', '6281234567809', '6281234567814');

-- ========================================
-- FREQUENT DONORS (High History Score)
-- ========================================

UPDATE users 
SET 
  total_donations = 15,
  last_donation_date = CURRENT_DATE - INTERVAL '100 days'
WHERE phone_number IN ('6281234567802', '6281234567810', '6281234567827');

-- ========================================
-- REJECTED DONORS (Penalty)
-- ========================================

UPDATE users 
SET 
  total_rejections = 3,
  last_rejection_date = CURRENT_DATE - INTERVAL '60 days',
  last_rejection_reason = 'Tekanan darah tinggi'
WHERE phone_number IN ('6281234567808', '6281234567813');

-- ========================================
-- VERIFY DATA
-- ========================================

-- Count by distance ranges
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
  WHERE i.email = 'admin@pmitest.com' 
    AND u.location IS NOT NULL
) subquery
GROUP BY distance_range
ORDER BY distance_range;

-- Show all donors with distances and eligibility
SELECT 
  u.full_name,
  u.phone_number,
  u.blood_type,
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
WHERE i.email = 'admin@pmitest.com' 
  AND u.location IS NOT NULL
ORDER BY distance_km;

-- Test scoring function for O+ donors
SELECT 
  donor_id,
  full_name,
  blood_type,
  distance_km,
  total_donations,
  completion_rate,
  distance_score,
  history_score,
  commitment_score,
  total_score,
  priority_flag
FROM find_eligible_donors_simplified(
  'O+'::blood_type,
  (SELECT id FROM institutions WHERE email = 'admin@pmitest.com'),
  (SELECT location FROM institutions WHERE email = 'admin@pmitest.com'),
  20, -- 20km radius
  50  -- limit 50 donors
)
ORDER BY total_score DESC;
