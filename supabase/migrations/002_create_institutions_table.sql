-- Table untuk Pendonor
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  phone_number VARCHAR(20) UNIQUE NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  address TEXT NOT NULL,
  location GEOGRAPHY(POINT, 4326),
  age INTEGER NOT NULL CHECK (age >= 17 AND age <= 65),
  blood_type VARCHAR(3) NOT NULL CHECK (blood_type IN ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-')),
  last_donation_date DATE,
  health_notes TEXT,
  total_points INTEGER DEFAULT 0,
  profile_picture TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table untuk Rumah Sakit & PMI
CREATE TABLE IF NOT EXISTS institutions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_type VARCHAR(20) NOT NULL CHECK (institution_type IN ('hospital', 'pmi')),
  email VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  institution_name VARCHAR(255) NOT NULL,
  address TEXT NOT NULL,
  location GEOGRAPHY(POINT, 4326),
  phone_number VARCHAR(20),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_phone ON users(phone_number);
CREATE INDEX idx_users_blood_type ON users(blood_type);
CREATE INDEX idx_institutions_email ON institutions(email);
CREATE INDEX idx_institutions_type ON institutions(institution_type);

-- Enable RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE institutions ENABLE ROW LEVEL SECURITY;
