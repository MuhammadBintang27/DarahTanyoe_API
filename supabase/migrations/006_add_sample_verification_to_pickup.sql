-- Migration: Add Sample Verification to Pickup Schedules
-- Purpose: Track blood sample verification during pickup to ensure compatibility
-- Date: 2026-02-19

-- Add sample verification fields to pickup_schedules table
ALTER TABLE pickup_schedules 
  ADD COLUMN IF NOT EXISTS sample_verified BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS sample_verification_notes TEXT,
  ADD COLUMN IF NOT EXISTS sample_test_result VARCHAR(50);

-- Add comment to explain new fields
COMMENT ON COLUMN pickup_schedules.sample_verified IS 'Whether blood sample was verified at pickup';
COMMENT ON COLUMN pickup_schedules.sample_verification_notes IS 'Lab technician notes from sample verification';
COMMENT ON COLUMN pickup_schedules.sample_test_result IS 'Result of cross-match test: compatible, incompatible, or null';

-- Create index for faster queries on verified pickups
CREATE INDEX IF NOT EXISTS idx_pickup_schedules_sample_verified 
  ON pickup_schedules(sample_verified) 
  WHERE sample_verified = true;
