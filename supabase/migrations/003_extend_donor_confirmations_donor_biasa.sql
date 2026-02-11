-- Migration: Extend donor_confirmations to support Donor Biasa (Janji Donor)
-- Safe, additive changes: new enum, columns, indexes; relax NOT NULL on fulfillment_request_id

-- Create enum for confirmation origin if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_type WHERE typname = 'confirmation_origin'
    ) THEN
        CREATE TYPE confirmation_origin AS ENUM ('fulfillment', 'donor_biasa');
    END IF;
END$$;

-- Allow donor confirmations without fulfillment request (for Donor Biasa)
ALTER TABLE donor_confirmations
    ALTER COLUMN fulfillment_request_id DROP NOT NULL;

-- Add origin marker column (defaults to 'fulfillment' for existing rows)
ALTER TABLE donor_confirmations
    ADD COLUMN IF NOT EXISTS confirmation_origin confirmation_origin NOT NULL DEFAULT 'fulfillment';

-- Add PMI assignment for Donor Biasa flow
ALTER TABLE donor_confirmations
    ADD COLUMN IF NOT EXISTS pmi_id UUID REFERENCES institutions(id);

-- Optional appointment time for Janji Donor
ALTER TABLE donor_confirmations
    ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ;

-- Indexes for efficient listing and filtering in PMI UI
CREATE INDEX IF NOT EXISTS idx_donor_confirmations_origin
    ON donor_confirmations(confirmation_origin);

CREATE INDEX IF NOT EXISTS idx_donor_confirmations_pmi
    ON donor_confirmations(pmi_id);

CREATE INDEX IF NOT EXISTS idx_donor_confirmations_status_origin
    ON donor_confirmations(status, confirmation_origin);

-- NOTE: Fulfillment stats trigger currently updates counters based on donor_confirmations.
-- If its function assumes non-null fulfillment_request_id, we will add a guard in a separate migration
-- after verifying the original logic, to skip rows where confirmation_origin='donor_biasa'.
