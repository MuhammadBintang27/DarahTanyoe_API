-- Add distance_km column to donor_confirmations table
-- This column stores the distance (in km) from the donor to the PMI location
-- Used to display distance information in notifications

ALTER TABLE donor_confirmations
ADD COLUMN distance_km NUMERIC(10, 2);

-- Create index for faster queries on distance
CREATE INDEX IF NOT EXISTS idx_donor_confirmations_distance ON donor_confirmations(distance_km);

-- Add comment for documentation
COMMENT ON COLUMN donor_confirmations.distance_km IS 'Distance in kilometers from donor location to PMI location at time of notification';
