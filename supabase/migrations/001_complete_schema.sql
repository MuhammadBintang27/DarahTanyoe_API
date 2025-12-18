-- DarahTanyoe Complete Database Schema
-- Separated: Institutions (RS/PMI) and Users (Donors)

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";

-- ========================================
-- DROP EXISTING TYPES (IF ANY)
-- ========================================

DROP TYPE IF EXISTS notification_type CASCADE;
DROP TYPE IF EXISTS priority_level CASCADE;
DROP TYPE IF EXISTS campaign_status CASCADE;
DROP TYPE IF EXISTS request_status CASCADE;
DROP TYPE IF EXISTS stock_status CASCADE;
DROP TYPE IF EXISTS pickup_status CASCADE;
DROP TYPE IF EXISTS donation_status CASCADE;
DROP TYPE IF EXISTS institution_type CASCADE;
DROP TYPE IF EXISTS blood_type CASCADE;

-- ========================================
-- CREATE ENUMS
-- ========================================

-- Blood Type Enum
CREATE TYPE blood_type AS ENUM (
  'A+', 'A-', 'B+', 'B-', 
  'AB+', 'AB-', 'O+', 'O-'
);

-- Institution Type Enum (RS/PMI only)
CREATE TYPE institution_type AS ENUM ('hospital', 'pmi');

-- Donation Status Enum
CREATE TYPE donation_status AS ENUM ('pending', 'approved', 'rejected', 'completed', 'cancelled');

-- Pickup Status Enum
CREATE TYPE pickup_status AS ENUM ('pending', 'scheduled', 'in_progress', 'completed', 'cancelled');

-- Stock Status Enum
CREATE TYPE stock_status AS ENUM ('available', 'reserved', 'used', 'expired');

-- Request Status Enum
CREATE TYPE request_status AS ENUM (
  'pending',
  'approved',
  'in_fulfillment',
  'rejected',
  'ready',
  'confirmed',
  'completed',
  'cancelled'
);

-- Campaign Status Enum
CREATE TYPE campaign_status AS ENUM ('draft', 'active', 'completed', 'cancelled');

-- Notification Type Enum
CREATE TYPE notification_type AS ENUM ('donation', 'pickup', 'stock', 'campaign', 'request', 'system');

-- Priority Level Enum
CREATE TYPE priority_level AS ENUM ('low', 'medium', 'high', 'critical');

-- ========================================
-- DROP EXISTING TABLES (IF ANY)
-- ========================================

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

-- ========================================
-- CORE TABLES
-- ========================================

-- Users Table (Pendonor only - login via OTP WhatsApp)
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE,
  phone_number VARCHAR(20) UNIQUE NOT NULL,
  full_name VARCHAR(100) NOT NULL,
  address TEXT NOT NULL,
  location GEOGRAPHY(POINT, 4326),
  age INTEGER NOT NULL CHECK (age >= 17 AND age <= 65),
  blood_type blood_type NOT NULL,
  last_donation_date DATE,
  health_notes TEXT,
  total_points INTEGER DEFAULT 0,
  profile_picture TEXT,
  active BOOLEAN DEFAULT true,
  phone_verified BOOLEAN DEFAULT false,
  last_login TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Institutions Table (RS/PMI - login via email+password)
CREATE TABLE institutions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  institution_type institution_type NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  institution_name VARCHAR(255) NOT NULL,
  address TEXT NOT NULL,
  location GEOGRAPHY(POINT, 4326),
  phone_number VARCHAR(20),
  kota VARCHAR(100),
  provinsi VARCHAR(100),
  license_number VARCHAR(100),
  verified BOOLEAN DEFAULT false,
  operating_hours JSONB,
  facilities JSONB,
  capacity INTEGER DEFAULT 0,
  coverage_area JSONB,
  description TEXT,
  website_url TEXT,
  social_media JSONB,
  accreditation JSONB,
  active BOOLEAN DEFAULT true,
  last_login TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- OTP Records Table (for WhatsApp OTP authentication - Donors only)
CREATE TABLE otp_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  phone VARCHAR(20) NOT NULL,
  otp VARCHAR(10) NOT NULL,
  expiry TIMESTAMPTZ NOT NULL,
  verified BOOLEAN DEFAULT false,
  attempts INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ========================================
-- DONATION MANAGEMENT
-- ========================================

-- Donations Table
CREATE TABLE donations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  donor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  blood_type blood_type NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_type VARCHAR(20) DEFAULT 'kantong',
  donation_date TIMESTAMPTZ NOT NULL,
  status donation_status DEFAULT 'pending',
  notes TEXT,
  medical_notes TEXT,
  health_screening JSONB,
  pre_donation_vitals JSONB,
  post_donation_vitals JSONB,
  donation_location TEXT,
  approved_by UUID REFERENCES institutions(id),
  approved_at TIMESTAMPTZ,
  rejection_reason TEXT,
  completion_notes TEXT,
  next_eligible_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Blood Stock Table
CREATE TABLE blood_stock (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  donation_id UUID REFERENCES donations(id),
  blood_type blood_type NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity >= 0),
  unit_type VARCHAR(20) DEFAULT 'kantong',
  expiry_date DATE NOT NULL,
  status stock_status DEFAULT 'available',
  batch_number VARCHAR(100) UNIQUE,
  collection_date DATE NOT NULL,
  storage_location VARCHAR(100),
  storage_temperature DECIMAL(4,2),
  temperature_log JSONB,
  quality_check JSONB,
  component_type VARCHAR(50) DEFAULT 'whole_blood',
  crossmatch_data JSONB,
  screening_results JSONB,
  reserved_by UUID REFERENCES institutions(id),
  reserved_at TIMESTAMPTZ,
  reservation_expires TIMESTAMPTZ,
  used_at TIMESTAMPTZ,
  used_for TEXT,
  notes TEXT,
  cost DECIMAL(10,2),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Stock Ledger Table (for blood mutation audit)
CREATE TABLE stock_ledger (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  stock_id UUID NOT NULL REFERENCES blood_stock(id) ON DELETE CASCADE,
  mutation_type VARCHAR(50) NOT NULL,
  quantity INTEGER NOT NULL,
  related_request UUID,
  related_donation UUID REFERENCES donations(id),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ========================================
-- REQUEST MANAGEMENT
-- ========================================

-- Blood Requests Table
CREATE TABLE blood_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  requester_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  partner_id UUID REFERENCES institutions(id),
  patient_name VARCHAR(255) NOT NULL,
  phone_number VARCHAR(20) NOT NULL,
  blood_type blood_type NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_type VARCHAR(20) DEFAULT 'kantong',
  urgency_level priority_level DEFAULT 'medium',
  status request_status DEFAULT 'pending',
  patient_info JSONB,
  medical_condition TEXT,
  hospital_info JSONB,
  pickup_address TEXT,
  pickup_code VARCHAR(20),
  delivery_address TEXT,
  approved_by UUID REFERENCES institutions(id),
  approved_at TIMESTAMPTZ,
  fulfilled_by UUID REFERENCES institutions(id),
  fulfilled_at TIMESTAMPTZ,
  rejection_reason TEXT,
  cancellation_reason TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Pickup Requests Table (for blood collection)
CREATE TABLE pickup_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  request_id UUID REFERENCES blood_requests(id) ON DELETE CASCADE,
  requester_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  blood_type blood_type NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  urgency_level priority_level DEFAULT 'medium',
  pickup_date TIMESTAMPTZ NOT NULL,
  pickup_address TEXT NOT NULL,
  pickup_location GEOGRAPHY(POINT, 4326),
  contact_person VARCHAR(100) NOT NULL,
  contact_phone VARCHAR(20) NOT NULL,
  status pickup_status DEFAULT 'pending',
  driver_id UUID,
  vehicle_info JSONB,
  estimated_arrival TIMESTAMPTZ,
  actual_pickup_time TIMESTAMPTZ,
  completion_notes TEXT,
  delivery_confirmation JSONB,
  medical_emergency BOOLEAN DEFAULT false,
  special_instructions TEXT,
  cancellation_reason TEXT,
  cancelled_by UUID REFERENCES institutions(id),
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ========================================
-- CAMPAIGN MANAGEMENT
-- ========================================

-- Blood Campaigns Table
CREATE TABLE blood_campaigns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organizer_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  campaign_image_url TEXT,
  start_date TIMESTAMPTZ NOT NULL,
  end_date TIMESTAMPTZ NOT NULL,
  target_quantity INTEGER,
  current_quantity INTEGER DEFAULT 0,
  target_donors INTEGER,
  current_donors INTEGER DEFAULT 0,
  location TEXT NOT NULL,
  address TEXT NOT NULL,
  campaign_location GEOGRAPHY(POINT, 4326),
  contact_person VARCHAR(100) NOT NULL,
  contact_phone VARCHAR(20) NOT NULL,
  requirements JSONB,
  incentives JSONB,
  status campaign_status DEFAULT 'draft',
  registration_required BOOLEAN DEFAULT true,
  max_participants INTEGER,
  current_participants INTEGER DEFAULT 0,
  social_sharing JSONB,
  feedback_summary JSONB,
  notes TEXT,
  related_request UUID REFERENCES blood_requests(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Campaign Registrations Table
CREATE TABLE campaign_registrations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id UUID NOT NULL REFERENCES blood_campaigns(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  registration_date TIMESTAMPTZ DEFAULT NOW(),
  attendance_confirmed BOOLEAN DEFAULT false,
  donation_completed BOOLEAN DEFAULT false,
  donation_id UUID REFERENCES donations(id),
  feedback_rating INTEGER CHECK (feedback_rating BETWEEN 1 AND 5),
  feedback_comments TEXT,
  check_in_time TIMESTAMPTZ,
  check_out_time TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(campaign_id, user_id)
);

-- ========================================
-- NOTIFICATION SYSTEM
-- ========================================

-- Notifications Table (for both users and institutions)
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  institution_id UUID REFERENCES institutions(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  type notification_type NOT NULL,
  priority priority_level DEFAULT 'medium',
  related_id UUID,
  related_type VARCHAR(50),
  read_at TIMESTAMPTZ,
  action_url TEXT,
  action_label VARCHAR(100),
  image_url TEXT,
  push_sent BOOLEAN DEFAULT false,
  email_sent BOOLEAN DEFAULT false,
  sms_sent BOOLEAN DEFAULT false,
  expires_at TIMESTAMPTZ,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  CHECK (
    (user_id IS NOT NULL AND institution_id IS NULL) OR
    (user_id IS NULL AND institution_id IS NOT NULL)
  )
);

-- Push Notification Tokens Table
CREATE TABLE push_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  institution_id UUID REFERENCES institutions(id) ON DELETE CASCADE,
  token TEXT NOT NULL,
  platform VARCHAR(20) NOT NULL,
  device_id VARCHAR(255),
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  CHECK (
    (user_id IS NOT NULL AND institution_id IS NULL) OR
    (user_id IS NULL AND institution_id IS NOT NULL)
  ),
  UNIQUE(token)
);

-- ========================================
-- AUTHENTICATION & SESSIONS
-- ========================================

-- Refresh Tokens Table (for both users and institutions)
CREATE TABLE refresh_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  institution_id UUID REFERENCES institutions(id) ON DELETE CASCADE,
  token_hash VARCHAR(255) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked BOOLEAN DEFAULT false,
  device_info JSONB,
  ip_address INET,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  CHECK (
    (user_id IS NOT NULL AND institution_id IS NULL) OR
    (user_id IS NULL AND institution_id IS NOT NULL)
  ),
  UNIQUE(token_hash)
);

-- OTP Sessions Table
CREATE TABLE otp_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  phone_number VARCHAR(20) NOT NULL,
  session_token VARCHAR(255) UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  device_info JSONB,
  ip_address INET,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ========================================
-- REPORTING & ANALYTICS
-- ========================================

-- Monthly Reports Table
CREATE TABLE monthly_reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  report_month INTEGER NOT NULL CHECK (report_month BETWEEN 1 AND 12),
  report_year INTEGER NOT NULL CHECK (report_year >= 2020),
  total_donations INTEGER DEFAULT 0,
  total_quantity INTEGER DEFAULT 0,
  total_requests INTEGER DEFAULT 0,
  total_fulfilled INTEGER DEFAULT 0,
  blood_type_breakdown JSONB,
  campaign_participation INTEGER DEFAULT 0,
  donor_demographics JSONB,
  geographic_data JSONB,
  efficiency_metrics JSONB,
  financial_summary JSONB,
  notes TEXT,
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(institution_id, report_month, report_year)
);

-- System Settings Table
CREATE TABLE system_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  key VARCHAR(100) UNIQUE NOT NULL,
  value JSONB NOT NULL,
  description TEXT,
  category VARCHAR(50) DEFAULT 'general',
  is_public BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Audit Logs Table
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id),
  institution_id UUID REFERENCES institutions(id),
  action VARCHAR(100) NOT NULL,
  table_name VARCHAR(100) NOT NULL,
  record_id UUID,
  old_values JSONB,
  new_values JSONB,
  ip_address INET,
  user_agent TEXT,
  api_endpoint VARCHAR(255),
  http_method VARCHAR(10),
  response_status INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ========================================
-- INDEXES FOR PERFORMANCE
-- ========================================

-- Users indexes
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_phone ON users(phone_number);
CREATE INDEX idx_users_active ON users(active);
CREATE INDEX idx_users_blood_type ON users(blood_type);
CREATE INDEX idx_users_created_at ON users(created_at);

-- Institutions indexes
CREATE INDEX idx_institutions_email ON institutions(email);
CREATE INDEX idx_institutions_type ON institutions(institution_type);
CREATE INDEX idx_institutions_kota ON institutions(kota);
CREATE INDEX idx_institutions_verified ON institutions(verified);
CREATE INDEX idx_institutions_active ON institutions(active);

-- Donations indexes
CREATE INDEX idx_donations_donor_id ON donations(donor_id);
CREATE INDEX idx_donations_institution_id ON donations(institution_id);
CREATE INDEX idx_donations_blood_type ON donations(blood_type);
CREATE INDEX idx_donations_status ON donations(status);
CREATE INDEX idx_donations_donation_date ON donations(donation_date);

-- Blood stock indexes
CREATE INDEX idx_blood_stock_institution_id ON blood_stock(institution_id);
CREATE INDEX idx_blood_stock_blood_type ON blood_stock(blood_type);
CREATE INDEX idx_blood_stock_status ON blood_stock(status);
CREATE INDEX idx_blood_stock_expiry_date ON blood_stock(expiry_date);
CREATE INDEX idx_blood_stock_batch_number ON blood_stock(batch_number);

-- Blood requests indexes
CREATE INDEX idx_blood_requests_requester_id ON blood_requests(requester_id);
CREATE INDEX idx_blood_requests_partner_id ON blood_requests(partner_id);
CREATE INDEX idx_blood_requests_blood_type ON blood_requests(blood_type);
CREATE INDEX idx_blood_requests_status ON blood_requests(status);
CREATE INDEX idx_blood_requests_urgency ON blood_requests(urgency_level);

-- Campaign indexes
CREATE INDEX idx_campaigns_organizer_id ON blood_campaigns(organizer_id);
CREATE INDEX idx_campaigns_status ON blood_campaigns(status);
CREATE INDEX idx_campaigns_start_date ON blood_campaigns(start_date);
CREATE INDEX idx_campaigns_end_date ON blood_campaigns(end_date);

-- Notification indexes
CREATE INDEX idx_notifications_user_id ON notifications(user_id);
CREATE INDEX idx_notifications_institution_id ON notifications(institution_id);
CREATE INDEX idx_notifications_read_at ON notifications(read_at);
CREATE INDEX idx_notifications_type ON notifications(type);
CREATE INDEX idx_notifications_created_at ON notifications(created_at);

-- ========================================
-- TRIGGERS FOR AUTOMATION
-- ========================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Add triggers to tables with updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_institutions_updated_at BEFORE UPDATE ON institutions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_donations_updated_at BEFORE UPDATE ON donations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_blood_stock_updated_at BEFORE UPDATE ON blood_stock FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_blood_requests_updated_at BEFORE UPDATE ON blood_requests FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_pickup_requests_updated_at BEFORE UPDATE ON pickup_requests FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_blood_campaigns_updated_at BEFORE UPDATE ON blood_campaigns FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to log stock mutations
CREATE OR REPLACE FUNCTION log_stock_mutation()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO stock_ledger (
    stock_id, mutation_type, quantity, related_donation, notes
  ) VALUES (
    NEW.id,
    'MASUK_DONASI',
    NEW.quantity,
    NEW.donation_id,
    'Auto ledger: stok masuk dari donasi'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER blood_stock_insert_ledger
  AFTER INSERT ON blood_stock
  FOR EACH ROW EXECUTE FUNCTION log_stock_mutation();

-- Function to update campaign statistics
CREATE OR REPLACE FUNCTION update_campaign_stats()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE blood_campaigns 
        SET current_participants = current_participants + 1
        WHERE id = NEW.campaign_id;
        
        IF NEW.donation_completed THEN
            UPDATE blood_campaigns 
            SET current_donors = current_donors + 1
            WHERE id = NEW.campaign_id;
        END IF;
        
        RETURN NEW;
    END IF;
    
    IF TG_OP = 'UPDATE' THEN
        IF OLD.donation_completed != NEW.donation_completed THEN
            IF NEW.donation_completed THEN
                UPDATE blood_campaigns 
                SET current_donors = current_donors + 1
                WHERE id = NEW.campaign_id;
            ELSE
                UPDATE blood_campaigns 
                SET current_donors = current_donors - 1
                WHERE id = NEW.campaign_id;
            END IF;
        END IF;
        
        RETURN NEW;
    END IF;
    
    IF TG_OP = 'DELETE' THEN
        UPDATE blood_campaigns 
        SET current_participants = current_participants - 1
        WHERE id = OLD.campaign_id;
        
        IF OLD.donation_completed THEN
            UPDATE blood_campaigns 
            SET current_donors = current_donors - 1
            WHERE id = OLD.campaign_id;
        END IF;
        
        RETURN OLD;
    END IF;
    
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER campaign_stats_trigger
    AFTER INSERT OR UPDATE OR DELETE ON campaign_registrations
    FOR EACH ROW EXECUTE FUNCTION update_campaign_stats();

-- ========================================
-- INITIAL SYSTEM SETTINGS
-- ========================================

INSERT INTO system_settings (key, value, description, category, is_public) VALUES
('app_name', '"DarahTanyoe"', 'Application name', 'general', true),
('app_version', '"1.0.0"', 'Application version', 'general', true),
('maintenance_mode', 'false', 'Enable maintenance mode', 'general', false),
('blood_expiry_days', '35', 'Default blood expiry period in days', 'blood_management', false),
('reservation_expiry_hours', '24', 'Blood reservation expiry in hours', 'blood_management', false),
('notification_retention_days', '30', 'Keep notifications for N days', 'notifications', false),
('max_donation_per_month', '1', 'Maximum donations per donor per month', 'donations', false),
('min_donor_age', '17', 'Minimum age for blood donation', 'donations', true),
('max_donor_age', '65', 'Maximum age for blood donation', 'donations', true),
('contact_email', '"support@darahtanyoe.com"', 'Contact email address', 'contact', true),
('contact_phone', '"+6281234567890"', 'Contact phone number', 'contact', true)
ON CONFLICT (key) DO NOTHING;

-- ========================================
-- SAMPLE DATA FOR TESTING
-- ========================================

-- Insert sample institution (password: password123)
-- Hashed with bcrypt: $2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/FwGK2pXn9HF3Bv8mq
INSERT INTO institutions (
  institution_type, email, password, institution_name, 
  address, kota, provinsi, phone_number, verified, active
) VALUES (
  'hospital', 
  'admin@rstest.com', 
  '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/FwGK2pXn9HF3Bv8mq',
  'RS Test Jakarta',
  'Jl. Test No. 123, Jakarta Pusat',
  'Jakarta',
  'DKI Jakarta',
  '081234567890',
  true,
  true
) ON CONFLICT (email) DO NOTHING;

-- Insert sample PMI
INSERT INTO institutions (
  institution_type, email, password, institution_name, 
  address, kota, provinsi, phone_number, verified, active
) VALUES (
  'pmi', 
  'admin@pmitest.com', 
  '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/FwGK2pXn9HF3Bv8mq',
  'PMI DKI Jakarta',
  'Jl. Gatot Subroto No. 96, Jakarta Selatan',
  'Jakarta',
  'DKI Jakarta',
  '081234567891',
  true,
  true
) ON CONFLICT (email) DO NOTHING;

-- Insert sample donor
INSERT INTO users (
  email, phone_number, full_name, address, age, blood_type, 
  active, phone_verified
) VALUES (
  'donor@test.com',
  '628123456789',
  'Donor Test',
  'Jl. Donor Test No. 1, Jakarta',
  25,
  'O+',
  true,
  true
) ON CONFLICT (phone_number) DO NOTHING;

-- Insert sample blood stock
INSERT INTO blood_stock (
  institution_id, blood_type, quantity, unit_type, expiry_date, 
  batch_number, collection_date, component_type
) VALUES 
(
  (SELECT id FROM institutions WHERE email = 'admin@pmitest.com'),
  'O+', 10, 'kantong', CURRENT_DATE + INTERVAL '30 days',
  'BATCH-001-' || TO_CHAR(NOW(), 'YYYYMMDD'), CURRENT_DATE, 'whole_blood'
),
(
  (SELECT id FROM institutions WHERE email = 'admin@pmitest.com'),
  'A+', 5, 'kantong', CURRENT_DATE + INTERVAL '25 days',
  'BATCH-002-' || TO_CHAR(NOW(), 'YYYYMMDD'), CURRENT_DATE, 'whole_blood'
) ON CONFLICT (batch_number) DO NOTHING;

-- Grant permissions (adjust as needed)
-- GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
-- GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
