-- Migration 003: Add pending_notification status to confirmation_status enum
-- Allows donors to wait for notification after campaign creation
-- Created: 2026-01-21

-- ========================================
-- UPDATE CONFIRMATION STATUS ENUM
-- ========================================

-- Drop dependent constraints first
ALTER TABLE donor_confirmations DROP CONSTRAINT IF EXISTS donor_confirmations_status_check;

-- Drop default value first to avoid cast error
ALTER TABLE donor_confirmations ALTER COLUMN status DROP DEFAULT;

-- Create new enum with the new value
CREATE TYPE confirmation_status_new AS ENUM (
  'pending_notification',  -- ✅ NEW: Created in DB, waiting to send notification
  'pending',               -- Notifikasi sudah dikirim, tunggu response pendonor
  'confirmed',             -- Pendonor confirm, code sudah di-generate
  'code_verified',         -- PMI verify code, pendonor di-verifikasi
  'completed',             -- Donasi selesai
  'rejected',              -- Pendonor reject
  'expired',               -- Code expired
  'failed'                 -- Donasi gagal
);

-- Alter column type
ALTER TABLE donor_confirmations ALTER COLUMN status TYPE confirmation_status_new USING status::text::confirmation_status_new;

-- Drop old enum and rename new one
DROP TYPE confirmation_status;
ALTER TYPE confirmation_status_new RENAME TO confirmation_status;

-- Set default value back
ALTER TABLE donor_confirmations ALTER COLUMN status SET DEFAULT 'pending_notification'::confirmation_status;

-- Add back constraint if needed (Supabase usually handles this)
COMMENT ON TYPE confirmation_status IS 'Status of donor confirmation: pending_notification → pending → confirmed → code_verified → completed/rejected';

COMMIT;
