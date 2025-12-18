# Database Migration Guide

## Langkah-langkah Setup Database

### 1. Buka Supabase Dashboard
1. Login ke [https://supabase.com](https://supabase.com)
2. Pilih project DarahTanyoe Anda
3. Klik menu **SQL Editor** di sidebar kiri

### 2. Jalankan Migration Script

#### Option A: Copy-Paste Manual
1. Buka file `migrations/001_complete_schema.sql`
2. Copy seluruh isi file
3. Paste ke SQL Editor di Supabase
4. Klik tombol **RUN** (atau tekan Ctrl+Enter)
5. Tunggu sampai muncul notifikasi "Success"

#### Option B: Upload File (Jika tersedia)
1. Di SQL Editor, klik tombol **Upload SQL File**
2. Pilih file `migrations/001_complete_schema.sql`
3. Klik **RUN**

### 3. Verifikasi Table Sudah Dibuat

Jalankan query berikut untuk mengecek tabel:

```sql
-- Cek apakah tabel institutions sudah ada
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('institutions', 'users', 'blood_stock', 'blood_requests', 'donations');
```

Seharusnya muncul 5 tabel:
- ✅ institutions
- ✅ users
- ✅ blood_stock
- ✅ blood_requests
- ✅ donations

### 4. Test Sample Data

Query untuk mengecek sample data:

```sql
-- Cek institutions
SELECT id, institution_type, email, institution_name 
FROM institutions;

-- Cek users (donors)
SELECT id, phone_number, full_name, blood_type 
FROM users;

-- Cek blood stock
SELECT id, blood_type, quantity, expiry_date, status 
FROM blood_stock;
```

### 5. Test Login

Gunakan credentials berikut untuk test:

**Hospital:**
- Email: `admin@rstest.com`
- Password: `password123`

**PMI:**
- Email: `admin@pmitest.com`
- Password: `password123`

**Donor (Mobile App):**
- Phone: `628123456789`
- OTP will be sent via WhatsApp

## Troubleshooting

### Error: "relation 'institutions' does not exist"
- Berarti tabel belum dibuat
- Jalankan ulang script migration `001_complete_schema.sql`

### Error: "duplicate key value violates unique constraint"
- Berarti sample data sudah ada
- Ini normal, abaikan error ini

### Error: "type 'institution_type' does not exist"
- Berarti enum belum dibuat
- Pastikan menjalankan seluruh script migration dari awal

### Reset Database (HATI-HATI: Menghapus semua data!)

Jika ingin reset dan mulai dari awal:

```sql
-- Drop all tables
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

-- Drop enums
DROP TYPE IF EXISTS notification_type CASCADE;
DROP TYPE IF EXISTS priority_level CASCADE;
DROP TYPE IF EXISTS campaign_status CASCADE;
DROP TYPE IF EXISTS request_status CASCADE;
DROP TYPE IF EXISTS stock_status CASCADE;
DROP TYPE IF EXISTS pickup_status CASCADE;
DROP TYPE IF EXISTS donation_status CASCADE;
DROP TYPE IF EXISTS institution_type CASCADE;
DROP TYPE IF EXISTS blood_type CASCADE;
```

Lalu jalankan ulang `001_complete_schema.sql`.

## Struktur Tabel Utama

### institutions
- **Login**: email + password (bcrypt)
- **Types**: hospital, pmi
- **Purpose**: RS dan PMI yang menggunakan web portal

### users
- **Login**: phone_number + OTP WhatsApp
- **Purpose**: Pendonor yang menggunakan mobile app
- **Fields**: age, blood_type, last_donation_date

### blood_stock
- Milik institutions (PMI)
- Status: available, reserved, used, expired
- Tracking: batch_number, expiry_date, quantity

### blood_requests
- Dibuat oleh hospital (requester_id)
- Ditujukan ke PMI (partner_id)
- Status: pending → approved → ready → confirmed → completed

### donations
- Dibuat oleh donor (donor_id)
- Diterima oleh institution (institution_id)
- Status: pending → approved → completed

## Next Steps

Setelah database setup:
1. Test login di web (http://localhost:3000/login)
2. Test register institusi baru
3. Test create blood request dari hospital ke PMI
4. Check notifications
5. Monitor stock levels

## Support

Jika ada masalah:
1. Check Supabase logs di Dashboard → Logs
2. Check API logs di terminal
3. Check browser console untuk frontend errors
