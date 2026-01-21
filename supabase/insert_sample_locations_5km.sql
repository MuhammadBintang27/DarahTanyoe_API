-- Sample locations ~5 km apart for testing near USK (Syiah Kuala University)
-- Actual USK location: 5.569069, 95.367856 (Jalan Teuku Nyak Arief, Rukoh, Banda Aceh)
-- Using approximate coordinates for nearby areas

-- Run this FIRST to create hospital locations
-- Then run this file for blood donors

-- Location 1: Base location near USK (Rumah Sakit Banda Aceh)
INSERT INTO institutions (
  institution_type,
  email,
  password,
  institution_name,
  address,
  kota,
  provinsi,
  phone_number,
  location,
  verified,
  active
) VALUES (
  'hospital'::institution_type,
  'rumahsakit.bandaaceh1@test.com',
  '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy',
  'Rumah Sakit Banda Aceh Central',
  'Jalan Teuku Nyak Arief, Rukoh, Banda Aceh',
  'Banda Aceh',
  'Aceh',
  '081234567890',
  ST_GeomFromText('POINT(95.367856 5.569069)', 4326),
  true,
  true
)
ON CONFLICT (email) DO NOTHING;

-- Location 2: ~5 km north from base
-- Adding ~0.045 degrees to latitude
INSERT INTO institutions (
  institution_type,
  email,
  password,
  institution_name,
  address,
  kota,
  provinsi,
  phone_number,
  location,
  verified,
  active
) VALUES (
  'hospital'::institution_type,
  'rumahsakit.bandaaceh2@test.com',
  '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy',
  'Rumah Sakit Banda Aceh Utara',
  'Jalan Cot Kala, Banda Aceh',
  'Banda Aceh',
  'Aceh',
  '081234567891',
  ST_GeomFromText('POINT(95.367856 5.614069)', 4326),
  true,
  true
)
ON CONFLICT (email) DO NOTHING;

-- Location 3: ~5 km southeast from base
-- Adding ~0.032 degrees to latitude and ~0.032 degrees to longitude
INSERT INTO institutions (
  institution_type,
  email,
  password,
  institution_name,
  address,
  kota,
  provinsi,
  phone_number,
  location,
  verified,
  active
) VALUES (
  'hospital'::institution_type,
  'rumahsakit.bandaaceh3@test.com',
  '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy',
  'Rumah Sakit Banda Aceh Timur',
  'Jalan Tgk Daud Beureueh, Banda Aceh',
  'Banda Aceh',
  'Aceh',
  '081234567892',
  ST_GeomFromText('POINT(95.399856 5.537069)', 4326),
  true,
  true
)
ON CONFLICT (email) DO NOTHING;

-- Also add PMI Banda Aceh as partner/organizer for campaigns
INSERT INTO institutions (
  institution_type,
  email,
  password,
  institution_name,
  address,
  kota,
  provinsi,
  phone_number,
  location,
  verified,
  active
) VALUES (
  'pmi'::institution_type,
  'pmi.bandaaceh@test.com',
  '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy',
  'PMI Banda Aceh (Syiah Kuala)',
  'Jalan Teuku Nyak Arief, Rukoh, Banda Aceh',
  'Banda Aceh',
  'Aceh',
  '081234567893',
  ST_GeomFromText('POINT(95.367856 5.569069)', 4326),
  true,
  true
)
ON CONFLICT (email) DO NOTHING;

-- Verify the locations (query to check distance)
SELECT 
  i1.institution_name as location_1,
  i2.institution_name as location_2,
  ROUND(ST_Distance(i1.location::geography, i2.location::geography) / 1000, 2) as distance_km
FROM institutions i1
CROSS JOIN institutions i2
WHERE i1.email = 'rumahsakit.bandaaceh1@test.com' 
  AND i2.email = 'rumahsakit.bandaaceh2@test.com';

-- Verify donors near PMI
SELECT 
  u.full_name,
  u.phone_number,
  u.blood_type,
  ROUND((ST_Distance(u.location, i.location) / 1000)::numeric, 2) AS distance_from_pmi_km
FROM users u
CROSS JOIN institutions i
WHERE i.email = 'pmi.bandaaceh@test.com'
  AND u.phone_number LIKE '628527700%'
ORDER BY distance_from_pmi_km;

-- ========================================
-- SAMPLE BLOOD DONORS for Meulaboh Hospitals
-- ========================================

-- DONORS WITHIN 5KM (Very Close to USK/PMI Banda Aceh)
INSERT INTO users (phone_number, full_name, address, location, date_of_birth, blood_type, active, phone_verified, last_donation_date, total_donations) VALUES
('6285277001001', 'Muhammad Rizki', 'Jl. Kuala, Banda Aceh', ST_SetSRID(ST_MakePoint(95.367856, 5.579069), 4326)::geography, '1996-02-14', 'A+', true, true, CURRENT_DATE - INTERVAL '120 days', 5),
('6285277001002', 'Cut Mutia', 'Jl. Kampus, Banda Aceh', ST_SetSRID(ST_MakePoint(95.357856, 5.569069), 4326)::geography, '1999-06-20', 'O+', true, true, CURRENT_DATE - INTERVAL '95 days', 3),
('6285277001003', 'Teuku Ibrahim', 'Jl. Khayalan, Banda Aceh', ST_SetSRID(ST_MakePoint(95.377856, 5.569069), 4326)::geography, '1992-10-08', 'B+', true, true, CURRENT_DATE - INTERVAL '100 days', 7),
('6285277001004', 'Safira Rahma', 'Jl. Sisingamangaraja, Banda Aceh', ST_SetSRID(ST_MakePoint(95.367856, 5.559069), 4326)::geography, '1997-04-11', 'AB+', true, true, NULL, 0),
('6285277001005', 'Daud Syahputra', 'Kompleks USK, Banda Aceh', ST_SetSRID(ST_MakePoint(95.377856, 5.579069), 4326)::geography, '1994-12-03', 'B-', true, true, CURRENT_DATE - INTERVAL '85 days', 4)
ON CONFLICT (phone_number) DO NOTHING;

-- DONORS 5-10KM (Moderate Distance)
INSERT INTO users (phone_number, full_name, address, location, date_of_birth, blood_type, active, phone_verified, last_donation_date, total_donations) VALUES
('6285277001006', 'Nurul Fadillah', 'Jl. Teuku Umar, Banda Aceh', ST_SetSRID(ST_MakePoint(95.337856, 5.599069), 4326)::geography, '1998-08-25', 'B+', true, true, CURRENT_DATE - INTERVAL '110 days', 6),
('6285277001007', 'Yusuf Habibi', 'Jl. Cot Kala, Banda Aceh', ST_SetSRID(ST_MakePoint(95.397856, 5.539069), 4326)::geography, '1995-01-19', 'O+', true, true, CURRENT_DATE - INTERVAL '90 days', 8),
('6285277001008', 'Rahmawati', 'Gampong Sukaramai, Banda Aceh', ST_SetSRID(ST_MakePoint(95.337856, 5.539069), 4326)::geography, '2000-03-07', 'A-', true, true, CURRENT_DATE - INTERVAL '105 days', 2),
('6285277001009', 'Ahmad Fauzi', 'Jl. Pelabuhan, Banda Aceh', ST_SetSRID(ST_MakePoint(95.397856, 5.599069), 4326)::geography, '1991-05-15', 'AB+', true, true, NULL, 0),
('6285277001010', 'Siti Aminah', 'Jl. Gajah Mada, Banda Aceh', ST_SetSRID(ST_MakePoint(95.327856, 5.569069), 4326)::geography, '1998-07-22', 'O+', true, true, CURRENT_DATE - INTERVAL '115 days', 5)
ON CONFLICT (phone_number) DO NOTHING;

-- DONORS 10-15KM (Far but Eligible)
INSERT INTO users (phone_number, full_name, address, location, date_of_birth, blood_type, active, phone_verified, last_donation_date, total_donations) VALUES
('6285277001011', 'Fahmi Ramadhan', 'Jl. Beringin, Aceh Besar', ST_SetSRID(ST_MakePoint(95.307856, 5.619069), 4326)::geography, '1990-11-30', 'B+', true, true, CURRENT_DATE - INTERVAL '130 days', 3),
('6285277001012', 'Mariana', 'Gampong Jawa, Aceh Besar', ST_SetSRID(ST_MakePoint(95.307856, 5.519069), 4326)::geography, '1997-09-18', 'A+', true, true, CURRENT_DATE - INTERVAL '95 days', 4),
('6285277001013', 'Saiful Bahri', 'Jl. Meranti, Aceh Besar', ST_SetSRID(ST_MakePoint(95.427856, 5.519069), 4326)::geography, '1994-04-25', 'O-', true, true, CURRENT_DATE - INTERVAL '120 days', 6),
('6285277001014', 'Rina Marlina', 'Gampong Cot Tri, Aceh Besar', ST_SetSRID(ST_MakePoint(95.307856, 5.619069), 4326)::geography, '1999-08-10', 'A+', true, true, NULL, 0),
('6285277001015', 'Irfan Maulana', 'Jl. Bener, Aceh Besar', ST_SetSRID(ST_MakePoint(95.427856, 5.599069), 4326)::geography, '1995-03-28', 'B-', true, true, CURRENT_DATE - INTERVAL '100 days', 7)
ON CONFLICT (phone_number) DO NOTHING;

-- Verify donors were created
SELECT COUNT(*) as total_donors FROM users WHERE phone_number LIKE '628527700%';
