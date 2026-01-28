-- ========================================
-- Migration 003: Add Donor Points System
-- ========================================
-- This migration adds automatic points system for donors
-- +50 points when a donor confirmation is completed

-- Drop existing trigger and function if they exist
DROP TRIGGER IF EXISTS donor_confirmation_completed_add_points ON donor_confirmations;
DROP FUNCTION IF EXISTS add_donor_points_on_confirmation();

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

-- Create trigger for donor confirmation completion
CREATE TRIGGER donor_confirmation_completed_add_points
    AFTER UPDATE ON donor_confirmations
    FOR EACH ROW EXECUTE FUNCTION add_donor_points_on_confirmation();
