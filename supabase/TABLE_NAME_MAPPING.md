# 📋 Table & Enum Name Mapping (English → Indonesian)

**Migration File**: `002_rename_schema_to_indonesian.sql`  
**Date**: February 8, 2026  
**Status**: ⚠️ Ready to execute (backup first!)

---

## 📊 Table Names Mapping

| English (Old) | Indonesian (New) | Keterangan |
|---------------|------------------|------------|
| `users` | `pendonor` | Data pendonor dengan OTP auth |
| `institutions` | `institusi` | Data PMI & Rumah Sakit |
| `donations` | `donasi` | Transaksi donasi individual |
| `blood_stock` | `stok_darah` | Persediaan darah di PMI |
| `stock_ledger` | `mutasi_stok` | Buku besar mutasi stok |
| `blood_stock_history` | `riwayat_stok_darah` | History perubahan stok |
| `blood_allocation` | `alokasi_darah` | Alokasi darah untuk request |
| `blood_requests` | `permintaan_darah` | Permintaan darah dari RS |
| `pickup_schedules` | `jadwal_penjemputan` | Jadwal pickup darah |
| `blood_campaigns` | `program_pendonoran_darah` | Program donor event/fulfillment |
| `campaign_registrations` | `pendaftaran_program` | Registrasi pendonor ke program |
| `fulfillment_requests` | `permintaan_pemenuhan` | Proses fulfillment darurat |
| `donor_confirmations` | `konfirmasi_pendonor` | Konfirmasi kesediaan donor |
| `notifications` | `notifikasi` | Sistem notifikasi |
| `otp_records` | `otp_records` | ✅ Tetap (technical term) |
| `otp_sessions` | `otp_sessions` | ✅ Tetap (technical term) |
| `refresh_tokens` | `refresh_tokens` | ✅ Tetap (technical term) |
| `push_tokens` | `push_tokens` | ✅ Tetap (technical term) |
| `monthly_reports` | `laporan_bulanan` | Laporan statistik bulanan |
| `audit_logs` | `log_audit` | Audit trail sistem |
| `system_settings` | `pengaturan_sistem` | Konfigurasi sistem |

---

## 🏷️ Enum Types Mapping

| English (Old) | Indonesian (New) |
|---------------|------------------|
| `blood_type` | `golongan_darah` |
| `institution_type` | `tipe_institusi` |
| `donation_status` | `status_donasi` |
| `pickup_status` | `status_penjemputan` |
| `stock_status` | `status_stok` |
| `request_status` | `status_permintaan` |
| `campaign_status` | `status_program` |
| `notification_type` | `tipe_notifikasi` |
| `priority_level` | `tingkat_prioritas` |
| `fulfillment_status` | `status_pemenuhan` |
| `confirmation_status` | `status_konfirmasi` |
| `allocation_status` | `status_alokasi` |

---

## 🔍 Quick Find & Replace Guide

### Backend API (.js files)

```javascript
// Find & Replace these patterns:

// Tables
.from("users")                    → .from("pendonor")
.from("institutions")             → .from("institusi")
.from("donations")                → .from("donasi")
.from("blood_stock")              → .from("stok_darah")
.from("stock_ledger")             → .from("mutasi_stok")
.from("blood_stock_history")      → .from("riwayat_stok_darah")
.from("blood_allocation")         → .from("alokasi_darah")
.from("blood_requests")           → .from("permintaan_darah")