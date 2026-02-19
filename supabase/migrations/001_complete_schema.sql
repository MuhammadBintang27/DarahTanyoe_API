    -- DarahTanyoe Complete Database Schema
    -- Separated: Institutions (RS/PMI) and Users (Donors)

    -- Enable extensions
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
    CREATE EXTENSION IF NOT EXISTS "postgis";

    -- ========================================
    -- DROP EXISTING TYPES (IF ANY)
    -- ========================================

    DROP TYPE IF EXISTS confirmation_status CASCADE;
    DROP TYPE IF EXISTS fulfillment_status CASCADE;
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
    'pickup_scheduled',
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

    -- Fulfillment Status Enum
    CREATE TYPE fulfillment_status AS ENUM (
    'initiated',
    'searching_donors',
    'donors_found',
    'in_progress',
    'partially_fulfilled',
    'fulfilled',
    'failed',
    'cancelled'
    );

    -- Donor Confirmation Status Enum
    CREATE TYPE confirmation_status AS ENUM (
        'pending_notification', -- ✅ NEW: Created in DB, waiting to send notification
    'pending',        -- Menunggu pendonor confirm via notifikasi
    'confirmed',      -- Pendonor confirm, code sudah di-generate
    'code_verified',  -- PMI verify code, pendonor di-verifikasi
    'completed',      -- Donasi selesai
    'rejected',       -- Pendonor reject
    'cancelled',      -- ✅ ADDED: Pendonor cancel/batalkan
    'expired',        -- Code expired
    'failed'          -- Donasi gagal
    );

    -- Donor Confirmation Origin Enum (fulfillment vs donor_biasa)
    CREATE TYPE confirmation_origin AS ENUM ('fulfillment', 'donor_biasa');

    -- ✅ NEW: Blood Allocation Status Enum (Opsi 2)
    CREATE TYPE allocation_status AS ENUM (
        'allocated',      -- Darah sudah dialokasikan untuk request
        'partial_pickup', -- Sebagian sudah diambil, sisa pending
        'picked_up',      -- Semua darah sudah diambil
        'expired',        -- Alokasi expired
        'cancelled'       -- Alokasi dibatalkan
    );

    -- ========================================
    -- DROP EXISTING TABLES (IF ANY)
    -- ========================================

    DROP TABLE IF EXISTS audit_logs CASCADE;
    DROP TABLE IF EXISTS monthly_reports CASCADE;
    DROP TABLE IF EXISTS system_settings CASCADE;
    DROP TABLE IF EXISTS blood_allocation CASCADE;
    DROP TABLE IF EXISTS otp_sessions CASCADE;
    DROP TABLE IF EXISTS refresh_tokens CASCADE;
    DROP TABLE IF EXISTS push_tokens CASCADE;
    DROP TABLE IF EXISTS notifications CASCADE;
    DROP TABLE IF EXISTS donor_confirmations CASCADE;
    DROP TABLE IF EXISTS fulfillment_requests CASCADE;
    DROP TABLE IF EXISTS campaign_registrations CASCADE;
    DROP TABLE IF EXISTS blood_campaigns CASCADE;
    DROP TABLE IF EXISTS pickup_requests CASCADE;
    DROP TABLE IF EXISTS blood_requests CASCADE;
    DROP TABLE IF EXISTS stock_ledger CASCADE;
    DROP TABLE IF EXISTS blood_stock_history CASCADE;
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
    date_of_birth DATE NOT NULL,
    blood_type blood_type NOT NULL,
    last_donation_date DATE,
    health_notes TEXT,
    total_points INTEGER DEFAULT 0,
    profile_picture TEXT,
    active BOOLEAN DEFAULT true,
    phone_verified BOOLEAN DEFAULT false,
    last_login TIMESTAMPTZ,
    
    -- Campaign statistics (auto-updated)
    total_campaigns_registered INTEGER DEFAULT 0,
    total_campaigns_completed INTEGER DEFAULT 0,
    total_campaigns_cancelled INTEGER DEFAULT 0,
    completion_rate NUMERIC(5,2) GENERATED ALWAYS AS (
        CASE 
        WHEN total_campaigns_registered > 0 
        THEN ROUND((total_campaigns_completed::NUMERIC / total_campaigns_registered * 100), 2)
        ELSE NULL 
        END
    ) STORED,
    
    -- Donation statistics (auto-updated)
    total_donations INTEGER DEFAULT 0,
    total_rejections INTEGER DEFAULT 0,
    last_rejection_date DATE,
    last_rejection_reason TEXT,
    
    -- Response time metrics
    avg_response_minutes INTEGER,
    
    -- Preferred donation schedule
    preferred_donation_time VARCHAR(20) CHECK (
        preferred_donation_time IS NULL OR
        preferred_donation_time IN ('morning', 'afternoon', 'evening', 'flexible')
    ) DEFAULT 'flexible',
    availability_days JSONB DEFAULT '["monday","tuesday","wednesday","thursday","friday","saturday","sunday"]'::jsonb,
    
    -- Notification preferences
    notifications_enabled BOOLEAN DEFAULT true,
    
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
    notification_email VARCHAR(255),
    email_notifications BOOLEAN DEFAULT true,
    push_notifications BOOLEAN DEFAULT true,
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

    -- Blood Stock History Table (for tracking all stock changes)
    CREATE TABLE blood_stock_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
    blood_type blood_type NOT NULL,
    change_type VARCHAR(20) NOT NULL CHECK (change_type IN ('add', 'reduce', 'used', 'expired')),
    quantity_change INTEGER NOT NULL CHECK (quantity_change > 0),
    previous_quantity INTEGER NOT NULL DEFAULT 0,
    new_quantity INTEGER NOT NULL DEFAULT 0,
    notes TEXT,
    created_by UUID REFERENCES institutions(id),
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
    patient_nik VARCHAR(16) CHECK (patient_nik IS NULL OR (patient_nik ~ '^[0-9]{16}$')),
    patient_birth_date DATE CHECK (patient_birth_date IS NULL OR patient_birth_date <= CURRENT_DATE),
    patient_gender VARCHAR(10) CHECK (patient_gender IS NULL OR patient_gender IN ('Laki-laki', 'Perempuan')),
    prescribing_doctor VARCHAR(255),
    doctor_license VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- Pickup Schedules Table (for blood collection scheduling)
    CREATE TABLE pickup_schedules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    request_id UUID NOT NULL REFERENCES blood_requests(id) ON DELETE CASCADE,
    pmi_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
    hospital_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
    pickup_date DATE NOT NULL,
    pickup_time TIME NOT NULL,
    pickup_location TEXT NOT NULL,
    unique_code VARCHAR(8) UNIQUE NOT NULL,
    status pickup_status DEFAULT 'scheduled',
    confirmed_at TIMESTAMPTZ,
    confirmed_by UUID REFERENCES institutions(id),
    notes TEXT,
    sample_verified BOOLEAN DEFAULT false,
    sample_verification_notes TEXT,
    sample_test_result VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- ========================================
    -- CAMPAIGN MANAGEMENT
    -- ========================================

    -- Blood Campaigns Table
    -- Unified table for both event-based campaigns and fulfillment campaigns
    CREATE TABLE blood_campaigns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    type VARCHAR(20) CHECK (type IN ('event', 'fulfillment')) DEFAULT 'event',
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
    is_read BOOLEAN DEFAULT false,
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
    -- FULFILLMENT SYSTEM
    -- ========================================

    -- Fulfillment Requests Table
    -- Tracks the fulfillment process for blood requests that cannot be fulfilled from stock
    CREATE TABLE fulfillment_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    blood_request_id UUID NOT NULL REFERENCES blood_requests(id) ON DELETE CASCADE,
    campaign_id UUID REFERENCES blood_campaigns(id) ON DELETE SET NULL,
    pmi_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
    patient_name VARCHAR(255) NOT NULL,
    blood_type blood_type NOT NULL,
    quantity_needed INTEGER NOT NULL CHECK (quantity_needed > 0),
    quantity_collected INTEGER DEFAULT 0 CHECK (quantity_collected >= 0),
    status fulfillment_status DEFAULT 'initiated',
    urgency_level priority_level DEFAULT 'medium',
    target_donors INTEGER,
    confirmed_donors INTEGER DEFAULT 0,
    completed_donors INTEGER DEFAULT 0,
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    search_radius_km INTEGER DEFAULT 20,
    donor_criteria JSONB,
    initiated_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    cancellation_reason TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(blood_request_id)
    );

    -- Donor Confirmations Table
    -- Tracks individual donor responses to fulfillment requests
    CREATE TABLE donor_confirmations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    fulfillment_request_id UUID REFERENCES fulfillment_requests(id) ON DELETE CASCADE,
    campaign_id UUID REFERENCES blood_campaigns(id) ON DELETE CASCADE,
    donor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    unique_code VARCHAR(12) UNIQUE,
    status confirmation_status DEFAULT 'pending',
    confirmed_at TIMESTAMPTZ,
    code_generated_at TIMESTAMPTZ,
    code_expires_at TIMESTAMPTZ,
    code_verified BOOLEAN DEFAULT false,
    code_verified_at TIMESTAMPTZ,
    verified_by UUID REFERENCES institutions(id),
    donation_id UUID REFERENCES donations(id),
    donation_completed_at TIMESTAMPTZ,
    rejection_reason TEXT,
    failure_reason TEXT,
    notified_at TIMESTAMPTZ,
    notification_id UUID REFERENCES notifications(id),
    check_in_time TIMESTAMPTZ,
    check_out_time TIMESTAMPTZ,
    notes TEXT,
    distance_km NUMERIC(10, 2),
    -- Donor Biasa fields
    confirmation_origin confirmation_origin NOT NULL DEFAULT 'fulfillment',
    pmi_id UUID REFERENCES institutions(id),
    scheduled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(fulfillment_request_id, donor_id)
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
    CREATE INDEX idx_users_completion_rate ON users(completion_rate) WHERE completion_rate IS NOT NULL;
    CREATE INDEX idx_users_total_donations ON users(total_donations);
    CREATE INDEX idx_users_avg_response ON users(avg_response_minutes) WHERE avg_response_minutes IS NOT NULL;
    CREATE INDEX idx_users_last_donation ON users(last_donation_date) WHERE last_donation_date IS NOT NULL;
    CREATE INDEX idx_users_location ON users USING GIST(location) WHERE location IS NOT NULL;

    -- Institutions indexes
    CREATE INDEX idx_institutions_email ON institutions(email);
    CREATE INDEX idx_institutions_type ON institutions(institution_type);
    CREATE INDEX idx_institutions_kota ON institutions(kota);
    CREATE INDEX idx_institutions_verified ON institutions(verified);
    CREATE INDEX idx_institutions_active ON institutions(active);
    CREATE INDEX idx_institutions_location ON institutions USING GIST(location) WHERE location IS NOT NULL;

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

    -- Blood stock history indexes
    CREATE INDEX idx_blood_stock_history_institution ON blood_stock_history(institution_id);
    CREATE INDEX idx_blood_stock_history_blood_type ON blood_stock_history(blood_type);
    CREATE INDEX idx_blood_stock_history_created_at ON blood_stock_history(created_at DESC);
    CREATE INDEX idx_blood_stock_history_change_type ON blood_stock_history(change_type);

    -- Blood requests indexes
    CREATE INDEX idx_blood_requests_requester_id ON blood_requests(requester_id);
    CREATE INDEX idx_blood_requests_partner_id ON blood_requests(partner_id);
    CREATE INDEX idx_blood_requests_blood_type ON blood_requests(blood_type);
    CREATE INDEX idx_blood_requests_status ON blood_requests(status);
    CREATE INDEX idx_blood_requests_urgency ON blood_requests(urgency_level);

    -- Pickup schedules indexes
    CREATE INDEX idx_pickup_schedules_request_id ON pickup_schedules(request_id);
    CREATE INDEX idx_pickup_schedules_pmi_id ON pickup_schedules(pmi_id);
    CREATE INDEX idx_pickup_schedules_hospital_id ON pickup_schedules(hospital_id);
    CREATE INDEX idx_pickup_schedules_status ON pickup_schedules(status);
    CREATE INDEX idx_pickup_schedules_unique_code ON pickup_schedules(unique_code);
    CREATE INDEX idx_pickup_schedules_pickup_date ON pickup_schedules(pickup_date);
    CREATE INDEX idx_pickup_schedules_sample_verified ON pickup_schedules(sample_verified) WHERE sample_verified = true;

    -- Campaign indexes
    CREATE INDEX idx_campaigns_organizer_id ON blood_campaigns(organizer_id);
    CREATE INDEX idx_campaigns_status ON blood_campaigns(status);
    CREATE INDEX idx_campaigns_start_date ON blood_campaigns(start_date);
    CREATE INDEX idx_campaigns_end_date ON blood_campaigns(end_date);

    -- Notification indexes
    CREATE INDEX idx_notifications_user_id ON notifications(user_id);
    CREATE INDEX idx_notifications_institution_id ON notifications(institution_id);
    CREATE INDEX idx_notifications_is_read ON notifications(is_read);
    CREATE INDEX idx_notifications_read_at ON notifications(read_at);
    CREATE INDEX idx_notifications_type ON notifications(type);
    CREATE INDEX idx_notifications_priority ON notifications(priority);
    CREATE INDEX idx_notifications_created_at ON notifications(created_at);

    -- Fulfillment requests indexes
    CREATE INDEX idx_fulfillment_requests_blood_request ON fulfillment_requests(blood_request_id);
    CREATE INDEX idx_fulfillment_requests_campaign ON fulfillment_requests(campaign_id);
    CREATE INDEX idx_fulfillment_requests_pmi ON fulfillment_requests(pmi_id);
    CREATE INDEX idx_fulfillment_requests_status ON fulfillment_requests(status);
    CREATE INDEX idx_fulfillment_requests_blood_type ON fulfillment_requests(blood_type);
    CREATE INDEX idx_fulfillment_requests_urgency ON fulfillment_requests(urgency_level);
    CREATE INDEX idx_fulfillment_requests_initiated_at ON fulfillment_requests(initiated_at DESC);

    -- Donor confirmations indexes
    CREATE INDEX idx_donor_confirmations_fulfillment ON donor_confirmations(fulfillment_request_id);
    CREATE INDEX idx_donor_confirmations_campaign ON donor_confirmations(campaign_id);
    CREATE INDEX idx_donor_confirmations_donor ON donor_confirmations(donor_id);
    CREATE INDEX idx_donor_confirmations_status ON donor_confirmations(status);
    CREATE INDEX idx_donor_confirmations_unique_code ON donor_confirmations(unique_code);
    CREATE INDEX idx_donor_confirmations_expires_at ON donor_confirmations(code_expires_at);
    CREATE INDEX idx_donor_confirmations_verified ON donor_confirmations(code_verified);
    CREATE INDEX idx_donor_confirmations_distance ON donor_confirmations(distance_km);
    CREATE INDEX idx_donor_confirmations_origin ON donor_confirmations(confirmation_origin);
    CREATE INDEX idx_donor_confirmations_pmi ON donor_confirmations(pmi_id);
    CREATE INDEX idx_donor_confirmations_status_origin ON donor_confirmations(status, confirmation_origin);

        -- Enforce at most 1 active Janji Donor per donor (for donor_biasa)
        -- Active defined as status in ('confirmed','code_verified')
        CREATE UNIQUE INDEX IF NOT EXISTS uq_active_donor_biasa_per_donor
                ON donor_confirmations(donor_id)
                WHERE confirmation_origin = 'donor_biasa'
                    AND status IN ('confirmed','code_verified');

    -- ========================================
-- COMPOSITE INDEXES FOR OPTIMIZATION
-- ========================================
-- Advanced composite indexes for frequently queried column combinations
-- Expected 2-10x faster on filtered queries

-- Blood Requests: Optimize partner/status filtering with timeline sorting
CREATE INDEX IF NOT EXISTS idx_blood_requests_partner_status_created 
ON blood_requests (partner_id, status, created_at DESC)
WHERE partner_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_blood_requests_requester_status_created 
ON blood_requests (requester_id, status, created_at DESC)
WHERE requester_id IS NOT NULL;

-- Blood Stock: Optimize institution/type/status filtering
CREATE INDEX IF NOT EXISTS idx_blood_stock_institution_type_status 
ON blood_stock (institution_id, blood_type, status);

CREATE INDEX IF NOT EXISTS idx_blood_stock_status_expiry 
ON blood_stock (status, expiry_date)
WHERE status IN ('available', 'reserved');

-- Blood Allocation: Optimize request-based allocation lookups
CREATE INDEX IF NOT EXISTS idx_blood_allocation_request_status 
ON blood_allocation (blood_request_id, status);

CREATE INDEX IF NOT EXISTS idx_blood_allocation_stock_status 
ON blood_allocation (blood_stock_id, status);

-- Donor Confirmations: Optimize donor status tracking
CREATE INDEX IF NOT EXISTS idx_donor_confirmations_donor_status_origin 
ON donor_confirmations (donor_id, status, confirmation_origin);

CREATE INDEX IF NOT EXISTS idx_donor_confirmations_fulfillment_status 
ON donor_confirmations (fulfillment_request_id, status);

-- Notifications: Optimize institution notification queries
CREATE INDEX IF NOT EXISTS idx_notifications_institution_read_created 
ON notifications (institution_id, is_read, created_at DESC)
WHERE institution_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_user_read_created 
ON notifications (user_id, is_read, created_at DESC)
WHERE user_id IS NOT NULL;

-- Fulfillment Requests: Optimize PMI and status filtering
CREATE INDEX IF NOT EXISTS idx_fulfillment_requests_pmi_status 
ON fulfillment_requests (pmi_id, status, created_at DESC)
WHERE pmi_id IS NOT NULL;

-- Blood Campaigns: Optimize organizer and status filtering
CREATE INDEX IF NOT EXISTS idx_blood_campaigns_organizer_status 
ON blood_campaigns (organizer_id, status, start_date DESC);

-- Pickup Schedules: Optimize date and status filtering
CREATE INDEX IF NOT EXISTS idx_pickup_schedules_pmi_status_date 
ON pickup_schedules (pmi_id, status, pickup_date)
WHERE pmi_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pickup_schedules_hospital_status_date 
ON pickup_schedules (hospital_id, status, pickup_date)
WHERE hospital_id IS NOT NULL;

-- Blood Stock History: Optimize institution history queries
CREATE INDEX IF NOT EXISTS idx_blood_stock_history_institution_type 
ON blood_stock_history (institution_id, change_type, created_at DESC);

-- ========================================
-- COLUMN COMMENTS (Documentation)
-- ========================================

-- Blood Requests: Medical and Patient Identity Fields
COMMENT ON COLUMN blood_requests.patient_nik IS 'NIK Pasien (Nomor Induk Kependudukan) - 16 digit';
COMMENT ON COLUMN blood_requests.patient_birth_date IS 'Tanggal lahir pasien untuk verifikasi identitas';
COMMENT ON COLUMN blood_requests.patient_gender IS 'Jenis kelamin pasien: Laki-laki atau Perempuan';
COMMENT ON COLUMN blood_requests.prescribing_doctor IS 'Nama dokter penanggung jawab yang meresepkan transfusi';
COMMENT ON COLUMN blood_requests.doctor_license IS 'Nomor SIP/STR dokter (opsional)';

-- Pickup Schedules: Sample Verification Fields
COMMENT ON COLUMN pickup_schedules.sample_verified IS 'Whether blood sample was verified at pickup';
COMMENT ON COLUMN pickup_schedules.sample_verification_notes IS 'Lab technician notes from sample verification';
COMMENT ON COLUMN pickup_schedules.sample_test_result IS 'Result of cross-match test: compatible, incompatible, or null';

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
    CREATE TRIGGER update_pickup_schedules_updated_at BEFORE UPDATE ON pickup_schedules FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    CREATE TRIGGER update_blood_campaigns_updated_at BEFORE UPDATE ON blood_campaigns FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    CREATE TRIGGER update_fulfillment_requests_updated_at BEFORE UPDATE ON fulfillment_requests FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    CREATE TRIGGER update_donor_confirmations_updated_at BEFORE UPDATE ON donor_confirmations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

    -- Function to log stock mutations on INSERT (donation masuk)
    CREATE OR REPLACE FUNCTION log_stock_mutation_on_insert()
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
    FOR EACH ROW EXECUTE FUNCTION log_stock_mutation_on_insert();

    -- Function to log stock mutations on UPDATE (status changes)
    -- Trigger ini akan catch saat status berubah ke 'used' atau 'expired'
    CREATE OR REPLACE FUNCTION log_stock_mutation_on_update()
    RETURNS TRIGGER AS $$
    BEGIN
        -- Log saat status berubah ke 'used'
        IF NEW.status = 'used'::stock_status AND OLD.status != 'used'::stock_status THEN
            INSERT INTO stock_ledger (
                stock_id, mutation_type, quantity, notes
            ) VALUES (
                NEW.id,
                'PENGGUNAAN_STOK',
                NEW.quantity,
                'Auto ledger: status berubah ke used. Untuk: ' || COALESCE(NEW.used_for, 'tidak ada keterangan')
            );
        END IF;

        -- Log saat status berubah ke 'expired'
        IF NEW.status = 'expired'::stock_status AND OLD.status != 'expired'::stock_status THEN
            INSERT INTO stock_ledger (
                stock_id, mutation_type, quantity, notes
            ) VALUES (
                NEW.id,
                'KADALUARSA',
                NEW.quantity,
                'Auto ledger: stok kadaluarsa pada ' || COALESCE(TO_CHAR(CURRENT_DATE, 'YYYY-MM-DD'), 'tidak ada tanggal')
            );
        END IF;

        -- Log saat quantity berubah (untuk tracking partial usage)
        IF NEW.quantity < OLD.quantity THEN
            INSERT INTO stock_ledger (
                stock_id, mutation_type, quantity, notes
            ) VALUES (
                NEW.id,
                'PENGURANGAN_QUANTITY',
                OLD.quantity - NEW.quantity,
                'Auto ledger: quantity berkurang dari ' || OLD.quantity || ' menjadi ' || NEW.quantity
            );
        END IF;

        RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    CREATE TRIGGER blood_stock_update_ledger
    AFTER UPDATE ON blood_stock
    FOR EACH ROW EXECUTE FUNCTION log_stock_mutation_on_update();

    -- ========================================
    -- BLOOD ALLOCATION FUNCTIONS (NEW)
    -- ========================================

    -- NOTE: auto_allocate_blood_on_donation() function and trigger removed
    -- Allocation is now created directly in fulfillmentController.js completeDonation() function
    -- This ensures proper sequencing: donation → blood_stock → allocation
    -- See: supabase/migrations/002_add_blood_allocation_system.sql for allocation support functions

    -- Function: Get available blood for a specific request (considering allocations)
    CREATE OR REPLACE FUNCTION get_available_blood_for_request(
        p_request_id UUID,
        p_blood_type blood_type
    )
    RETURNS TABLE (
        stock_id UUID,
        quantity_available INTEGER,
        fulfillment_id UUID,
        batch_number VARCHAR,
        expiry_date DATE
    ) AS $$
    BEGIN
        RETURN QUERY
        SELECT 
            ba.blood_stock_id,
            ba.quantity_allocated - ba.quantity_picked_up AS quantity_available,
            ba.fulfillment_request_id,
            bs.batch_number,
            bs.expiry_date
        FROM blood_allocation ba
        JOIN blood_stock bs ON ba.blood_stock_id = bs.id
        WHERE 
            ba.blood_request_id = p_request_id
            AND bs.blood_type = p_blood_type
            AND ba.status IN ('allocated'::allocation_status, 'partial_pickup'::allocation_status)
            AND bs.status = 'available'::stock_status
            AND bs.expiry_date >= CURRENT_DATE
        ORDER BY ba.priority DESC, ba.allocated_at ASC;
    END;
    $$ LANGUAGE plpgsql;

    -- Function: Get pending pickup for a request
    CREATE OR REPLACE FUNCTION get_pending_pickup_for_request(p_request_id UUID)
    RETURNS TABLE (
        allocation_id UUID,
        quantity_pending INTEGER,
        fulfillment_id UUID,
        batch_number VARCHAR
    ) AS $$
    BEGIN
        RETURN QUERY
        SELECT 
            ba.id,
            ba.quantity_allocated - ba.quantity_picked_up,
            ba.fulfillment_request_id,
            bs.batch_number
        FROM blood_allocation ba
        JOIN blood_stock bs ON ba.blood_stock_id = bs.id
        WHERE 
            ba.blood_request_id = p_request_id
            AND ba.status IN ('allocated'::allocation_status, 'partial_pickup'::allocation_status)
            AND (ba.quantity_allocated - ba.quantity_picked_up) > 0
        ORDER BY ba.allocated_at ASC;
    END;
    $$ LANGUAGE plpgsql;

    -- Function: Complete pickup and update allocation
    CREATE OR REPLACE FUNCTION complete_allocation_pickup(
        p_allocation_id UUID,
        p_quantity_picked_up INTEGER
    )
    RETURNS BOOLEAN AS $$
    DECLARE
        current_allocation RECORD;
        new_status allocation_status;
    BEGIN
        -- Get current allocation
        SELECT * INTO current_allocation
        FROM blood_allocation
        WHERE id = p_allocation_id;
        
        IF current_allocation IS NULL THEN
            RAISE EXCEPTION 'Allocation not found: %', p_allocation_id;
        END IF;
        
        -- Validate quantity
        IF p_quantity_picked_up > (current_allocation.quantity_allocated - current_allocation.quantity_picked_up) THEN
            RAISE EXCEPTION 'Quantity picked up exceeds available: % > %', 
                p_quantity_picked_up, 
                (current_allocation.quantity_allocated - current_allocation.quantity_picked_up);
        END IF;
        
        -- Determine new status
        IF (current_allocation.quantity_picked_up + p_quantity_picked_up) >= current_allocation.quantity_allocated THEN
            new_status := 'picked_up'::allocation_status;
        ELSE
            new_status := 'partial_pickup'::allocation_status;
        END IF;
        
        -- Update allocation
        UPDATE blood_allocation
        SET 
            quantity_picked_up = quantity_picked_up + p_quantity_picked_up,
            status = new_status,
            picked_up_at = CASE 
                WHEN new_status = 'picked_up'::allocation_status THEN NOW()
                ELSE picked_up_at
            END
        WHERE id = p_allocation_id;
        
        -- Update blood stock status if fully picked up
        IF new_status = 'picked_up'::allocation_status THEN
            UPDATE blood_stock
            SET status = 'used'::stock_status, used_at = NOW()
            WHERE id = current_allocation.blood_stock_id;
        END IF;
        
        RETURN TRUE;
    END;
    $$ LANGUAGE plpgsql;

    -- Function: Cancel allocation
    CREATE OR REPLACE FUNCTION cancel_allocation(
        p_allocation_id UUID,
        p_reason TEXT DEFAULT NULL
    )
    RETURNS BOOLEAN AS $$
    BEGIN
        UPDATE blood_allocation
        SET 
            status = 'cancelled'::allocation_status,
            cancelled_at = NOW(),
            cancellation_reason = p_reason
        WHERE id = p_allocation_id;
        
        RETURN TRUE;
    END;
    $$ LANGUAGE plpgsql;

    -- ========================================
    -- DONOR POINTS SYSTEM
    -- ========================================

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
    -- DONOR POINTS SYSTEM
    -- ========================================
    
    -- Function to add points when donor confirmation is completed
    CREATE OR REPLACE FUNCTION add_donor_points_on_confirmation()
    RETURNS TRIGGER AS $$
    BEGIN
        -- Add 50 points when donor confirmation status changes to 'completed'
        IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN
            UPDATE users 
            SET total_points = total_points + 50
            WHERE id = NEW.donor_id;
            
            -- Log the points addition
            RAISE NOTICE 'Points added to donor %: +50 points (confirmation %)', NEW.donor_id, NEW.id;
        END IF;
        
        RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    CREATE TRIGGER donor_confirmation_completed_add_points
        AFTER UPDATE ON donor_confirmations
        FOR EACH ROW EXECUTE FUNCTION add_donor_points_on_confirmation();

    -- ========================================
    -- FULFILLMENT SYSTEM TRIGGERS & FUNCTIONS
    -- ========================================

    -- Function to update campaign statistics for users
    CREATE OR REPLACE FUNCTION update_user_campaign_stats()
    RETURNS TRIGGER AS $$
    BEGIN
        IF TG_OP = 'INSERT' THEN
            UPDATE users 
            SET total_campaigns_registered = total_campaigns_registered + 1
            WHERE id = NEW.user_id;
            
            IF NEW.donation_completed THEN
                UPDATE users 
                SET total_campaigns_completed = total_campaigns_completed + 1
                WHERE id = NEW.user_id;
            END IF;
            
            RETURN NEW;
        END IF;
        
        IF TG_OP = 'UPDATE' THEN
            IF OLD.donation_completed != NEW.donation_completed THEN
                IF NEW.donation_completed THEN
                    UPDATE users 
                    SET total_campaigns_completed = total_campaigns_completed + 1
                    WHERE id = NEW.user_id;
                ELSE
                    UPDATE users 
                    SET total_campaigns_completed = GREATEST(total_campaigns_completed - 1, 0)
                    WHERE id = NEW.user_id;
                END IF;
            END IF;
            
            IF OLD.attendance_confirmed = true AND NEW.attendance_confirmed = false THEN
                UPDATE users 
                SET total_campaigns_cancelled = total_campaigns_cancelled + 1
                WHERE id = NEW.user_id;
            END IF;
            
            RETURN NEW;
        END IF;
        
        IF TG_OP = 'DELETE' THEN
            UPDATE users 
            SET total_campaigns_registered = GREATEST(total_campaigns_registered - 1, 0)
            WHERE id = OLD.user_id;
            
            IF OLD.donation_completed THEN
                UPDATE users 
                SET total_campaigns_completed = GREATEST(total_campaigns_completed - 1, 0)
                WHERE id = OLD.user_id;
            END IF;
            
            RETURN OLD;
        END IF;
        
        RETURN NULL;
    END;
    $$ LANGUAGE plpgsql;

    CREATE TRIGGER user_campaign_stats_trigger
        AFTER INSERT OR UPDATE OR DELETE ON campaign_registrations
        FOR EACH ROW EXECUTE FUNCTION update_user_campaign_stats();

    -- Function to update donation statistics for users
    CREATE OR REPLACE FUNCTION update_user_donation_stats()
    RETURNS TRIGGER AS $$
    BEGIN
        IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
            IF NEW.status = 'completed' THEN
                UPDATE users 
                SET 
                    total_donations = (
                        SELECT COUNT(*) FROM donations 
                        WHERE donor_id = NEW.donor_id AND status = 'completed'
                    ),
                    last_donation_date = NEW.donation_date::DATE
                WHERE id = NEW.donor_id;
            END IF;
            
            IF NEW.status = 'rejected' AND (OLD.status IS NULL OR OLD.status != 'rejected') THEN
                UPDATE users 
                SET 
                    total_rejections = total_rejections + 1,
                    last_rejection_date = CURRENT_DATE,
                    last_rejection_reason = NEW.rejection_reason
                WHERE id = NEW.donor_id;
            END IF;
            
            RETURN NEW;
        END IF;
        
        RETURN NULL;
    END;
    $$ LANGUAGE plpgsql;

    CREATE TRIGGER user_donation_stats_trigger
        AFTER INSERT OR UPDATE ON donations
        FOR EACH ROW EXECUTE FUNCTION update_user_donation_stats();

    -- Function to update fulfillment statistics
    CREATE OR REPLACE FUNCTION update_fulfillment_stats()
    RETURNS TRIGGER AS $$
    BEGIN
        IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
            -- Skip updates for donor_biasa or when fulfillment_request_id is NULL
            IF NEW.fulfillment_request_id IS NULL THEN
                RETURN NEW;
            END IF;
            UPDATE fulfillment_requests 
            SET 
                confirmed_donors = (
                    SELECT COUNT(*) 
                    FROM donor_confirmations 
                    WHERE fulfillment_request_id = NEW.fulfillment_request_id 
                    AND status = 'confirmed'
                ),
                completed_donors = (
                    SELECT COUNT(*) 
                    FROM donor_confirmations 
                    WHERE fulfillment_request_id = NEW.fulfillment_request_id 
                    AND status = 'completed'
                ),
                quantity_collected = (
                    SELECT COALESCE(SUM(d.quantity), 0)
                    FROM donor_confirmations dc
                    JOIN donations d ON dc.donation_id = d.id
                    WHERE dc.fulfillment_request_id = NEW.fulfillment_request_id
                    AND d.status = 'completed'
                )
            WHERE id = NEW.fulfillment_request_id;
            
            RETURN NEW;
        END IF;
        
        RETURN NULL;
    END;
    $$ LANGUAGE plpgsql;

    CREATE TRIGGER fulfillment_stats_trigger
        AFTER INSERT OR UPDATE ON donor_confirmations
        FOR EACH ROW EXECUTE FUNCTION update_fulfillment_stats();

    -- Function to generate unique donor code
    CREATE OR REPLACE FUNCTION generate_donor_code()
    RETURNS VARCHAR(12) AS $$
    DECLARE
        code VARCHAR(12);
        exists BOOLEAN;
        random_suffix VARCHAR(2);
    BEGIN
        LOOP
            -- Format: DN + YYMMDDHH + RR (12 chars: 2+8+2)
            -- RR = random 2-digit number (00-99) for uniqueness within same hour
            random_suffix := LPAD(FLOOR(RANDOM() * 100)::TEXT, 2, '0');
            code := 'DN' || TO_CHAR(NOW(), 'YYMMDDHH24') || random_suffix;
            SELECT EXISTS(SELECT 1 FROM donor_confirmations WHERE unique_code = code) INTO exists;
            EXIT WHEN NOT exists;
        END LOOP;
        
        RETURN code;
    END;
    $$ LANGUAGE plpgsql;

    -- Trigger to auto-generate unique code when donor confirms
    CREATE OR REPLACE FUNCTION set_donor_confirmation_code()
    RETURNS TRIGGER AS $$
    BEGIN
        -- Generate code hanya saat status berubah menjadi 'confirmed'
        IF NEW.status = 'confirmed' AND (OLD.status IS NULL OR OLD.status != 'confirmed') THEN
            IF NEW.unique_code IS NULL OR NEW.unique_code = '' THEN
                NEW.unique_code := generate_donor_code();
            END IF;
            
            IF NEW.code_generated_at IS NULL THEN
                NEW.code_generated_at := NOW();
            END IF;
            
            IF NEW.code_expires_at IS NULL THEN
                NEW.code_expires_at := NOW() + INTERVAL '7 days';
            END IF;
            
            NEW.confirmed_at := NOW();
        END IF;
        
        RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    CREATE TRIGGER set_donor_code_trigger
        BEFORE UPDATE ON donor_confirmations
        FOR EACH ROW EXECUTE FUNCTION set_donor_confirmation_code();

    -- ========================================
    -- DONOR SCORING ALGORITHM FUNCTIONS
    -- ========================================

    -- Distance Score (50% weight)
    CREATE OR REPLACE FUNCTION calculate_distance_score(
        distance_km NUMERIC,
        max_radius_km INTEGER DEFAULT 20
    )
    RETURNS NUMERIC AS $$
    BEGIN
        IF distance_km > max_radius_km THEN
            RETURN 0;
        END IF;
        
        RETURN ROUND(100 - ((distance_km / max_radius_km) * 100), 2);
    END;
    $$ LANGUAGE plpgsql IMMUTABLE;

    -- History Score (35% weight)
    CREATE OR REPLACE FUNCTION calculate_history_score(
        total_donations INTEGER,
        last_donation_date DATE,
        total_rejections INTEGER
    )
    RETURNS NUMERIC AS $$
    DECLARE
        frequency_score NUMERIC;
        recency_score NUMERIC;
        rejection_penalty NUMERIC;
        days_since_last NUMERIC;
    BEGIN
        frequency_score := LEAST(total_donations * 10, 50);
        
        IF last_donation_date IS NULL THEN
            recency_score := 20;
        ELSE
            days_since_last := CURRENT_DATE - last_donation_date;
            
            IF days_since_last < 90 THEN
                recency_score := 0;
            ELSIF days_since_last BETWEEN 90 AND 180 THEN
                recency_score := 40;
            ELSIF days_since_last BETWEEN 181 AND 365 THEN
                recency_score := 30;
            ELSE
                recency_score := 20;
            END IF;
        END IF;
        
        rejection_penalty := LEAST(total_rejections * 5, 10);
        
        RETURN ROUND(GREATEST(frequency_score + recency_score - rejection_penalty, 0), 2);
    END;
    $$ LANGUAGE plpgsql IMMUTABLE;

    -- Utility: Compute distance between a specific user (donor) and a PMI
    -- Returns distance in kilometers (rounded to 2 decimals), or NULL if location missing
    CREATE OR REPLACE FUNCTION compute_user_pmi_distance(
        p_user_id UUID,
        p_pmi_id UUID
    )
    RETURNS NUMERIC AS $$
    DECLARE
        u_loc GEOGRAPHY;
        i_loc GEOGRAPHY;
        dist_km NUMERIC;
    BEGIN
        SELECT location INTO u_loc FROM users WHERE id = p_user_id;
        SELECT location INTO i_loc FROM institutions WHERE id = p_pmi_id;
        IF u_loc IS NULL OR i_loc IS NULL THEN
            RETURN NULL;
        END IF;
        dist_km := ROUND(CAST(ST_Distance(u_loc, i_loc) / 1000 AS NUMERIC), 2);
        RETURN dist_km;
    END;
    $$ LANGUAGE plpgsql STABLE;

    -- Commitment Score (15% weight)
    CREATE OR REPLACE FUNCTION calculate_commitment_score(
        total_registered INTEGER,
        total_completed INTEGER,
        total_cancelled INTEGER
    )
    RETURNS NUMERIC AS $$
    DECLARE
        completion_score NUMERIC;
        cancellation_penalty NUMERIC;
    BEGIN
        IF total_registered = 0 THEN
            RETURN 50;
        END IF;
        
        completion_score := (total_completed::NUMERIC / total_registered) * 80;
        cancellation_penalty := LEAST(total_cancelled * 5, 20);
        
        RETURN ROUND(GREATEST(completion_score - cancellation_penalty, 0), 2);
    END;
    $$ LANGUAGE plpgsql IMMUTABLE;

    -- Main Donor Matching Algorithm
    CREATE OR REPLACE FUNCTION find_eligible_donors_simplified(
        p_blood_type blood_type,
        p_pmi_location GEOGRAPHY,
        p_radius_km INTEGER DEFAULT 20,
        p_urgency_level priority_level DEFAULT 'medium',
        p_min_score NUMERIC DEFAULT 40.0,
        p_limit INTEGER DEFAULT 100
    )
    RETURNS TABLE (
        donor_id UUID,
        full_name VARCHAR,
        phone_number VARCHAR,
        blood_type blood_type,
        age INTEGER,
        distance_km NUMERIC,
        distance_score NUMERIC,
        history_score NUMERIC,
        commitment_score NUMERIC,
        weighted_distance NUMERIC,
        weighted_history NUMERIC,
        weighted_commitment NUMERIC,
        final_score NUMERIC,
        recommendation_rank INTEGER,
        eligible BOOLEAN,
        last_donation_date DATE,
        total_donations INTEGER,
        completion_rate NUMERIC,
        priority_flag BOOLEAN
    ) AS $$
    DECLARE
        weight_distance CONSTANT NUMERIC := 0.50;
        weight_history CONSTANT NUMERIC := 0.35;
        weight_commitment CONSTANT NUMERIC := 0.15;
    BEGIN
        RETURN QUERY
        WITH donor_data AS (
            SELECT 
                u.id,
                u.full_name,
                u.phone_number,
                u.blood_type,
                EXTRACT(YEAR FROM AGE(CURRENT_DATE, u.date_of_birth))::INTEGER AS age,
                u.last_donation_date,
                u.total_donations,
                u.total_rejections,
                u.total_campaigns_registered,
                u.total_campaigns_completed,
                u.total_campaigns_cancelled,
                u.completion_rate,
                ROUND(CAST(ST_Distance(u.location, p_pmi_location) / 1000 AS NUMERIC), 2) AS dist_km
            FROM users u
            WHERE 
                u.blood_type = p_blood_type
                AND u.active = true
                AND u.phone_verified = true
                AND u.location IS NOT NULL
                AND ST_DWithin(u.location, p_pmi_location, p_radius_km * 1000)
                -- ✅ Check notifications enabled
                AND u.notifications_enabled = true
                -- Check 90-day post-donation period
                AND (
                    u.last_donation_date IS NULL 
                    OR u.last_donation_date < (CURRENT_DATE - INTERVAL '90 days')
                )
        ),
        scored_donors AS (
            SELECT 
                dd.*,
                calculate_distance_score(dd.dist_km, p_radius_km) AS dist_score,
                calculate_history_score(
                    COALESCE(dd.total_donations, 0),
                    dd.last_donation_date,
                    COALESCE(dd.total_rejections, 0)
                ) AS hist_score,
                calculate_commitment_score(
                    COALESCE(dd.total_campaigns_registered, 0),
                    COALESCE(dd.total_campaigns_completed, 0),
                    COALESCE(dd.total_campaigns_cancelled, 0)
                ) AS commit_score
            FROM donor_data dd
        ),
        weighted_donors AS (
            SELECT 
                sd.*,
                (sd.dist_score * weight_distance) AS w_distance,
                (sd.hist_score * weight_history) AS w_history,
                (sd.commit_score * weight_commitment) AS w_commitment,
                ROUND(
                    (sd.dist_score * weight_distance) +
                    (sd.hist_score * weight_history) +
                    (sd.commit_score * weight_commitment),
                    2
                ) AS total_score,
                CASE 
                    WHEN p_urgency_level = 'critical' AND sd.dist_km <= 5 AND sd.total_donations >= 3 THEN true
                    WHEN p_urgency_level = 'high' AND sd.dist_km <= 10 AND sd.total_donations >= 2 THEN true
                    ELSE false
                END AS is_priority
            FROM scored_donors sd
        )
        SELECT 
            wd.id,
            wd.full_name,
            wd.phone_number,
            wd.blood_type,
            wd.age,
            wd.dist_km,
            wd.dist_score,
            wd.hist_score,
            wd.commit_score,
            wd.w_distance,
            wd.w_history,
            wd.w_commitment,
            wd.total_score,
            ROW_NUMBER() OVER (ORDER BY wd.is_priority DESC, wd.total_score DESC, wd.dist_km ASC)::INTEGER,
            true AS eligible,
            wd.last_donation_date,
            COALESCE(wd.total_donations, 0)::INTEGER,
            wd.completion_rate,
            wd.is_priority
        FROM weighted_donors wd
        WHERE wd.total_score >= p_min_score
        ORDER BY wd.is_priority DESC, wd.total_score DESC, wd.dist_km ASC
        LIMIT p_limit;
    END;
    $$ LANGUAGE plpgsql;

    -- Analytics View
    CREATE OR REPLACE VIEW donor_score_analytics AS
    SELECT 
        u.blood_type,
        COUNT(*) AS total_donors,
        ROUND(AVG(
            (calculate_distance_score(5, 20) * 0.50) +
            (calculate_history_score(u.total_donations, u.last_donation_date, u.total_rejections) * 0.35) +
            (calculate_commitment_score(u.total_campaigns_registered, u.total_campaigns_completed, u.total_campaigns_cancelled) * 0.15)
        ), 2) AS avg_score,
        COUNT(CASE WHEN u.total_donations >= 5 THEN 1 END) AS experienced_donors,
        COUNT(CASE WHEN u.completion_rate >= 80 THEN 1 END) AS reliable_donors,
        COUNT(CASE WHEN u.last_donation_date < CURRENT_DATE - INTERVAL '90 days' OR u.last_donation_date IS NULL THEN 1 END) AS eligible_donors
    FROM users u
    WHERE u.active = true AND u.phone_verified = true
    GROUP BY u.blood_type;

    -- ========================================
    -- PERFORMANCE VIEWS
    -- ========================================
    -- Pre-computed views for complex joins and aggregations

    -- View 1: Partners with Blood Stock Summary
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

    -- View 2: Blood Requests with Related Data
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
      json_build_object(
        'id', req_inst.id,
        'name', req_inst.institution_name,
        'type', req_inst.institution_type,
        'address', req_inst.address,
        'phone', req_inst.phone_number
      ) as requester,
      json_build_object(
        'id', partner_inst.id,
        'name', partner_inst.institution_name,
        'type', partner_inst.institution_type,
        'address', partner_inst.address,
        'phone', partner_inst.phone_number
      ) as partner,
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

    -- View 3: Allocation with Stock Details
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
      json_build_object(
        'id', bs.id,
        'batch_number', bs.batch_number,
        'blood_type', bs.blood_type,
        'expiry_date', bs.expiry_date,
        'quantity', bs.quantity,
        'status', bs.status,
        'institution_id', bs.institution_id
      ) as blood_stock,
      json_build_object(
        'id', fr.id,
        'patient_name', fr.patient_name,
        'blood_type', fr.blood_type
      ) as fulfillment_request
    FROM blood_allocation ba
    LEFT JOIN blood_stock bs ON ba.blood_stock_id = bs.id
    LEFT JOIN fulfillment_requests fr ON ba.fulfillment_request_id = fr.id;

    -- View 4: Donor Confirmations with User Details
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

    -- View 5: Dashboard Summary Data
    CREATE OR REPLACE VIEW dashboard_pmi_summary AS
    SELECT 
      i.id as institution_id,
      i.institution_name,
      json_build_object(
        'total_units', COALESCE(stock_sum.total_units, 0),
        'by_type', COALESCE(stock_sum.by_type, '[]'::json)
      ) as blood_stock,
      json_build_object(
        'total_requests', COALESCE(req_sum.total_requests, 0),
        'pending', COALESCE(req_sum.pending, 0),
        'approved', COALESCE(req_sum.approved, 0),
        'completed', COALESCE(req_sum.completed, 0)
      ) as requests,
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

    -- Grant permissions for views
    GRANT SELECT ON partners_with_stock_summary TO authenticated;
    GRANT SELECT ON blood_requests_detail TO authenticated;
    GRANT SELECT ON allocations_with_stock TO authenticated;
    GRANT SELECT ON donor_confirmations_with_users TO authenticated;
    GRANT SELECT ON dashboard_pmi_summary TO authenticated;

    -- Comments for documentation
    COMMENT ON TABLE fulfillment_requests IS 'Tracks blood request fulfillment through donor campaigns';
    COMMENT ON TABLE donor_confirmations IS 'Tracks individual donor confirmations and verifications';
    COMMENT ON FUNCTION calculate_distance_score IS 'Scores based on proximity to PMI (0-100). Weight: 50%';
    COMMENT ON FUNCTION calculate_history_score IS 'Scores based on donation frequency, recency, and rejections (0-100). Weight: 35%';
    COMMENT ON FUNCTION calculate_commitment_score IS 'Scores based on campaign completion rate (0-100). Weight: 15%';
    COMMENT ON FUNCTION find_eligible_donors_simplified IS 'Main algorithm: finds and ranks donors by distance (50%), history (35%), and commitment (15%)';
    COMMENT ON VIEW donor_score_analytics IS 'Analytics view for donor scoring distribution by blood type';

    -- ========================================
    -- BLOOD ALLOCATION SYSTEM (moved to bottom)
    -- ========================================

    -- Blood Allocation Table (NEW)
    -- Tracks darah allocation dari fulfillment ke blood requests 
    -- Memastikan darah dari fulfillment A hanya dipakai untuk request A
    CREATE TABLE blood_allocation (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- References
    blood_request_id UUID NOT NULL REFERENCES blood_requests(id) ON DELETE CASCADE,
    fulfillment_request_id UUID REFERENCES fulfillment_requests(id) ON DELETE SET NULL,
    blood_stock_id UUID NOT NULL REFERENCES blood_stock(id) ON DELETE CASCADE,
    
    -- Allocation tracking
    quantity_allocated INTEGER NOT NULL CHECK (quantity_allocated > 0),
    quantity_picked_up INTEGER DEFAULT 0 CHECK (quantity_picked_up >= 0),
    status allocation_status DEFAULT 'allocated',
    
    -- Priority & notes
    priority INTEGER DEFAULT 0,
    notes TEXT,
    
    -- Timestamps
    allocated_at TIMESTAMPTZ DEFAULT NOW(),
    pickup_scheduled_at TIMESTAMPTZ,
    picked_up_at TIMESTAMPTZ,
    expired_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    cancellation_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Constraints
    CHECK (quantity_picked_up <= quantity_allocated),
    CHECK (
        (fulfillment_request_id IS NOT NULL) OR 
        (fulfillment_request_id IS NULL)  -- Allow general allocation without fulfillment
    )
    );

    -- Blood allocation indexes
    CREATE INDEX idx_blood_allocation_request ON blood_allocation(blood_request_id);
    CREATE INDEX idx_blood_allocation_fulfillment ON blood_allocation(fulfillment_request_id);
    CREATE INDEX idx_blood_allocation_stock ON blood_allocation(blood_stock_id);
    CREATE INDEX idx_blood_allocation_status ON blood_allocation(status);
    CREATE INDEX idx_blood_allocation_allocated_at ON blood_allocation(allocated_at DESC);
    CREATE INDEX idx_blood_allocation_picked_up_at ON blood_allocation(picked_up_at DESC);

    -- Blood allocation trigger
    CREATE TRIGGER update_blood_allocation_updated_at BEFORE UPDATE ON blood_allocation FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

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
    -- INITIALIZE USER STATISTICS
    -- ========================================

    -- Update campaign statistics for existing users
    UPDATE users u
    SET 
        total_campaigns_registered = (
            SELECT COUNT(*) FROM campaign_registrations WHERE user_id = u.id
        ),
        total_campaigns_completed = (
            SELECT COUNT(*) FROM campaign_registrations 
            WHERE user_id = u.id AND donation_completed = true
        ),
        total_campaigns_cancelled = (
            SELECT COUNT(*) FROM campaign_registrations 
            WHERE user_id = u.id AND attendance_confirmed = false
        );

    -- Update donation statistics
    UPDATE users u
    SET 
        total_donations = (
            SELECT COUNT(*) FROM donations 
            WHERE donor_id = u.id AND status = 'completed'
        ),
        total_rejections = (
            SELECT COUNT(*) FROM donations 
            WHERE donor_id = u.id AND status = 'rejected'
        ),
        last_rejection_date = (
            SELECT MAX(donation_date)::DATE FROM donations 
            WHERE donor_id = u.id AND status = 'rejected'
        ),
        last_rejection_reason = (
            SELECT rejection_reason FROM donations 
            WHERE donor_id = u.id AND status = 'rejected'
            ORDER BY donation_date DESC LIMIT 1
        );

    -- ========================================
    -- ROW LEVEL SECURITY (RLS) POLICIES
    -- ========================================

    -- RLS DISABLED FOR DEVELOPMENT - Comment out if needed for production
    -- All tables are publicly accessible via authenticated role

    -- Uncomment below section for production RLS setup:
    /*
    -- Enable RLS on all tables
    ALTER TABLE users ENABLE ROW LEVEL SECURITY;
    ALTER TABLE institutions ENABLE ROW LEVEL SECURITY;
    ALTER TABLE otp_records ENABLE ROW LEVEL SECURITY;
    ALTER TABLE donations ENABLE ROW LEVEL SECURITY;
    ALTER TABLE blood_stock ENABLE ROW LEVEL SECURITY;
    ALTER TABLE stock_ledger ENABLE ROW LEVEL SECURITY;
    ALTER TABLE blood_stock_history ENABLE ROW LEVEL SECURITY;
    ALTER TABLE blood_requests ENABLE ROW LEVEL SECURITY;
    ALTER TABLE pickup_schedules ENABLE ROW LEVEL SECURITY;
    ALTER TABLE blood_campaigns ENABLE ROW LEVEL SECURITY;
    ALTER TABLE campaign_registrations ENABLE ROW LEVEL SECURITY;
    ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
    ALTER TABLE push_tokens ENABLE ROW LEVEL SECURITY;
    ALTER TABLE fulfillment_requests ENABLE ROW LEVEL SECURITY;
    ALTER TABLE donor_confirmations ENABLE ROW LEVEL SECURITY;
    ALTER TABLE refresh_tokens ENABLE ROW LEVEL SECURITY;
    ALTER TABLE otp_sessions ENABLE ROW LEVEL SECURITY;
    ALTER TABLE monthly_reports ENABLE ROW LEVEL SECURITY;
    ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;
    ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

    -- CREATE POLICIES HERE...
    */

    -- Grant permissions for development
    -- GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
    -- GRANT ALL ON ALL TABLES IN SCHEMA public TO anon;
    -- GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
    -- GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon;
    -- GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;
    -- GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon;
