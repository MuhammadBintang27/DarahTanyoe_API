-- Migration 002: Blood Request Fulfillment System
-- Adds tables and scoring algorithm for donor matching and fulfillment tracking
-- Created: 2026-01-05

-- ========================================
-- ADD NEW ENUMS
-- ========================================

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
  'pending',
  'confirmed',
  'rejected',
  'expired',
  'completed',
  'failed'
);

-- ========================================
-- ADD COLUMNS TO USERS TABLE
-- ========================================

-- Campaign statistics (auto-calculated from campaign_registrations)
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS total_campaigns_registered INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_campaigns_completed INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_campaigns_cancelled INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS completion_rate NUMERIC(5,2) GENERATED ALWAYS AS (
    CASE 
        WHEN total_campaigns_registered > 0 
        THEN ROUND((total_campaigns_completed::NUMERIC / total_campaigns_registered * 100), 2)
        ELSE NULL 
    END
) STORED;

-- Donation statistics (will be updated by triggers)
ALTER TABLE users
ADD COLUMN IF NOT EXISTS total_donations INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_rejections INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_rejection_date DATE,
ADD COLUMN IF NOT EXISTS last_rejection_reason TEXT;

-- Response time metrics (for availability scoring)
ALTER TABLE users
ADD COLUMN IF NOT EXISTS avg_response_minutes INTEGER;

-- Preferred donation schedule (optional, for better matching)
ALTER TABLE users
ADD COLUMN IF NOT EXISTS preferred_donation_time VARCHAR(20) CHECK (
    preferred_donation_time IS NULL OR
    preferred_donation_time IN ('morning', 'afternoon', 'evening', 'flexible')
) DEFAULT 'flexible',
ADD COLUMN IF NOT EXISTS availability_days JSONB DEFAULT '["monday","tuesday","wednesday","thursday","friday","saturday","sunday"]'::jsonb;

-- ========================================
-- CREATE FULFILLMENT TABLES
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
  donor_criteria JSONB, -- {blood_type, location, last_donation_days, etc}
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
  fulfillment_request_id UUID NOT NULL REFERENCES fulfillment_requests(id) ON DELETE CASCADE,
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
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(fulfillment_request_id, donor_id)
);

-- ========================================
-- CREATE INDEXES
-- ========================================

-- Users indexes for scoring algorithm
CREATE INDEX IF NOT EXISTS idx_users_completion_rate ON users(completion_rate) WHERE completion_rate IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_total_donations ON users(total_donations);
CREATE INDEX IF NOT EXISTS idx_users_avg_response ON users(avg_response_minutes) WHERE avg_response_minutes IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_last_donation ON users(last_donation_date) WHERE last_donation_date IS NOT NULL;

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

-- ========================================
-- TRIGGERS
-- ========================================

-- Trigger to update fulfillment_requests timestamp
CREATE TRIGGER update_fulfillment_requests_updated_at 
  BEFORE UPDATE ON fulfillment_requests 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Trigger to update donor_confirmations timestamp
CREATE TRIGGER update_donor_confirmations_updated_at 
  BEFORE UPDATE ON donor_confirmations 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

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

DROP TRIGGER IF EXISTS user_campaign_stats_trigger ON campaign_registrations;
CREATE TRIGGER user_campaign_stats_trigger
    AFTER INSERT OR UPDATE OR DELETE ON campaign_registrations
    FOR EACH ROW EXECUTE FUNCTION update_user_campaign_stats();

-- Function to update donation statistics for users
CREATE OR REPLACE FUNCTION update_user_donation_stats()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
        -- Update total donations (only completed)
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
        
        -- Track rejections
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

DROP TRIGGER IF EXISTS user_donation_stats_trigger ON donations;
CREATE TRIGGER user_donation_stats_trigger
    AFTER INSERT OR UPDATE ON donations
    FOR EACH ROW EXECUTE FUNCTION update_user_donation_stats();

-- Function to update fulfillment statistics
CREATE OR REPLACE FUNCTION update_fulfillment_stats()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
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

-- ========================================
-- UNIQUE CODE GENERATION
-- ========================================

-- Function to generate unique donor code
CREATE OR REPLACE FUNCTION generate_donor_code()
RETURNS VARCHAR(12) AS $$
DECLARE
    code VARCHAR(12);
    exists BOOLEAN;
BEGIN
    LOOP
        -- Generate format: DON-YYMMDD-XXXX
        code := 'DON-' || TO_CHAR(NOW(), 'YYMMDD') || '-' || LPAD(FLOOR(RANDOM() * 10000)::TEXT, 4, '0');
        
        -- Check if code exists
        SELECT EXISTS(SELECT 1 FROM donor_confirmations WHERE unique_code = code) INTO exists;
        
        EXIT WHEN NOT exists;
    END LOOP;
    
    RETURN code;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-generate unique code
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
-- SIMPLIFIED SCORING ALGORITHM FUNCTIONS
-- ========================================

-- Distance Score (50% weight)
-- Linear decay: 100 points at 0km, 0 points at max_radius
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
-- Based on donation frequency, recency, and rejection history
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
    -- Frequency score (0-50 points)
    -- More donations = higher score
    frequency_score := LEAST(total_donations * 10, 50);
    
    -- Recency score (0-40 points)
    IF last_donation_date IS NULL THEN
        recency_score := 20; -- neutral for new donors
    ELSE
        days_since_last := EXTRACT(DAY FROM (CURRENT_DATE - last_donation_date));
        
        IF days_since_last < 90 THEN
            recency_score := 0; -- not eligible yet
        ELSIF days_since_last BETWEEN 90 AND 180 THEN
            recency_score := 40; -- optimal window
        ELSIF days_since_last BETWEEN 181 AND 365 THEN
            recency_score := 30; -- still good
        ELSE
            recency_score := 20; -- long time ago
        END IF;
    END IF;
    
    -- Rejection penalty (0 to -10 points)
    rejection_penalty := LEAST(total_rejections * 5, 10);
    
    RETURN ROUND(GREATEST(frequency_score + recency_score - rejection_penalty, 0), 2);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Commitment Score (15% weight)
-- Based on campaign completion rate
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
        RETURN 50; -- neutral for new donors
    END IF;
    
    -- Completion rate (0-80 points)
    completion_score := (total_completed::NUMERIC / total_registered) * 80;
    
    -- Cancellation penalty (0 to -20 points)
    cancellation_penalty := LEAST(total_cancelled * 5, 20);
    
    RETURN ROUND(GREATEST(completion_score - cancellation_penalty, 0), 2);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ========================================
-- MAIN DONOR MATCHING ALGORITHM
-- ========================================

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
    
    -- Individual scores (0-100 each)
    distance_score NUMERIC,
    history_score NUMERIC,
    commitment_score NUMERIC,
    
    -- Weighted scores
    weighted_distance NUMERIC,
    weighted_history NUMERIC,
    weighted_commitment NUMERIC,
    
    -- Final score (0-100)
    final_score NUMERIC,
    recommendation_rank INTEGER,
    
    -- Metadata
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
            u.age,
            u.last_donation_date,
            u.total_donations,
            u.total_rejections,
            u.total_campaigns_registered,
            u.total_campaigns_completed,
            u.total_campaigns_cancelled,
            u.completion_rate,
            
            -- Calculate distance
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
            
            -- Calculate individual scores
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
            
            -- Apply weights
            (sd.dist_score * weight_distance) AS w_distance,
            (sd.hist_score * weight_history) AS w_history,
            (sd.commit_score * weight_commitment) AS w_commitment,
            
            -- Calculate final score
            ROUND(
                (sd.dist_score * weight_distance) +
                (sd.hist_score * weight_history) +
                (sd.commit_score * weight_commitment),
                2
            ) AS total_score,
            
            -- Priority flag for urgent cases
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

-- ========================================
-- ANALYTICS VIEW
-- ========================================

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
-- INITIALIZE EXISTING DATA
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
-- COMMENTS FOR DOCUMENTATION
-- ========================================

COMMENT ON TABLE fulfillment_requests IS 'Tracks blood request fulfillment through donor campaigns';
COMMENT ON TABLE donor_confirmations IS 'Tracks individual donor confirmations and verifications';

COMMENT ON COLUMN users.total_campaigns_registered IS 'Auto-updated by trigger when user registers for campaign';
COMMENT ON COLUMN users.total_campaigns_completed IS 'Auto-updated when donation is completed';
COMMENT ON COLUMN users.completion_rate IS 'Auto-calculated: (completed / registered) * 100';
COMMENT ON COLUMN users.total_donations IS 'Auto-updated when donation status changes to completed';
COMMENT ON COLUMN users.total_rejections IS 'Auto-updated when donation is rejected';

COMMENT ON FUNCTION calculate_distance_score IS 'Scores based on proximity to PMI (0-100). Weight: 50%';
COMMENT ON FUNCTION calculate_history_score IS 'Scores based on donation frequency, recency, and rejections (0-100). Weight: 35%';
COMMENT ON FUNCTION calculate_commitment_score IS 'Scores based on campaign completion rate (0-100). Weight: 15%';
COMMENT ON FUNCTION find_eligible_donors_simplified IS 'Main algorithm: finds and ranks donors by distance (50%), history (35%), and commitment (15%)';
COMMENT ON VIEW donor_score_analytics IS 'Analytics view for donor scoring distribution by blood type';
