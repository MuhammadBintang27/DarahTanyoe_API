-- ============================================
-- Migration: Add Medical Fields to Blood Requests
-- ============================================
-- Purpose: Add patient identity and doctor information fields
--          for medical procedure compliance
-- Date: 2026-02-19
-- ============================================

-- Add patient identity fields
ALTER TABLE blood_requests
  ADD COLUMN patient_nik VARCHAR(16),
  ADD COLUMN patient_birth_date DATE,
  ADD COLUMN patient_gender VARCHAR(10);

-- Add prescribing doctor fields
ALTER TABLE blood_requests
  ADD COLUMN prescribing_doctor VARCHAR(255),
  ADD COLUMN doctor_license VARCHAR(50);

-- Add constraints for data validation
ALTER TABLE blood_requests
  ADD CONSTRAINT check_patient_nik_length 
    CHECK (patient_nik IS NULL OR (patient_nik ~ '^[0-9]{16}$')),
  ADD CONSTRAINT check_patient_gender 
    CHECK (patient_gender IS NULL OR patient_gender IN ('Laki-laki', 'Perempuan')),
  ADD CONSTRAINT check_birth_date_not_future 
    CHECK (patient_birth_date IS NULL OR patient_birth_date <= CURRENT_DATE);

-- Add comments for documentation
COMMENT ON COLUMN blood_requests.patient_nik IS 'NIK Pasien (Nomor Induk Kependudukan) - 16 digit';
COMMENT ON COLUMN blood_requests.patient_birth_date IS 'Tanggal lahir pasien untuk verifikasi identitas';
COMMENT ON COLUMN blood_requests.patient_gender IS 'Jenis kelamin pasien: Laki-laki atau Perempuan';
COMMENT ON COLUMN blood_requests.prescribing_doctor IS 'Nama dokter penanggung jawab yang meresepkan transfusi';
COMMENT ON COLUMN blood_requests.doctor_license IS 'Nomor SIP/STR dokter (opsional)';

-- Note: Columns are nullable initially to allow existing data
-- For new requests, validation will be handled at application level
-- to ensure these fields are provided
