-- Add type column to blood_campaigns table
-- This migration adds support for distinguishing between event-based and fulfillment campaigns

-- Check if column exists, if not add it
ALTER TABLE IF EXISTS blood_campaigns
ADD COLUMN IF NOT EXISTS type VARCHAR(20) DEFAULT 'event';

-- Add constraint if it doesn't exist
-- Note: This constraint is already in the original schema, but ensuring it's applied
ALTER TABLE blood_campaigns
ADD CONSTRAINT blood_campaigns_type_check CHECK (type IN ('event', 'fulfillment'));

-- Update existing campaigns to be type='event' (they are all event-based before this migration)
UPDATE blood_campaigns SET type = 'event' WHERE type IS NULL;

-- Add comment to document the column
COMMENT ON COLUMN blood_campaigns.type IS 'Campaign type: event (event-based campaigns) or fulfillment (fulfillment request campaigns)';
