# Facebook WhatsApp API Setup Guide

Panduan lengkap untuk mengatur Facebook WhatsApp API untuk OTP dan notifikasi di aplikasi DarahTanyoe.

## Persyaratan

1. **Akun Facebook Developer**
2. **WhatsApp Business Account**
3. **Nomor telepon untuk WhatsApp Business**

## Langkah-langkah Setup

### 1. Buat Facebook App

1. Kunjungi [Facebook Developers](https://developers.facebook.com/)
2. Buat aplikasi baru atau gunakan yang sudah ada
3. Tambahkan produk "WhatsApp" ke aplikasi Anda

### 2. Setup WhatsApp Business API

1. Di dashboard aplikasi, pilih "WhatsApp" → "Setup"
2. Buat WhatsApp Business Account
3. Tambahkan nomor telepon untuk WhatsApp Business
4. Verifikasi nomor telepon melalui SMS

### 3. Dapatkan Credentials

Setelah setup selesai, Anda akan mendapatkan:

- **Phone Number ID**: ID unik untuk nomor WhatsApp Business Anda
- **Access Token**: Token untuk autentikasi API

### 4. Konfigurasi Environment Variables

Update file `.env` dengan credentials yang didapat:

```env
FACEBOOK_MESSAGE_VERSION=v17.0
FACEBOOK_PHONE_NUMBER_ID=your-phone-number-id-here
FACEBOOK_ACCESS_TOKEN=your-access-token-here
```

### 5. Test Koneksi

Gunakan endpoint berikut untuk test:

**OTP Request:**
```bash
POST /api/auth/signin-phone
{
  "phone": "+6281234567890"
}
```

**Kirim Notifikasi:**
```bash
POST /api/auth/send-notification
{
  "phone": "+6281234567890",
  "message": "Pesan notifikasi Anda"
}
```

## Fitur yang Tersedia

### 1. OTP (One-Time Password)
- Otomatis dikirim saat user melakukan sign in dengan nomor telepon
- Berlaku selama 5 menit
- Format: "Kode OTP Anda adalah: 123456. Kode ini berlaku selama 5 menit."

### 2. Notifikasi Umum
- Dapat digunakan untuk berbagai jenis notifikasi
- Mendukung pesan custom
- Bisa digunakan untuk notifikasi donor darah, reminder, dll.

## Troubleshooting

### Error Umum:

1. **"Invalid access token"**
   - Pastikan Access Token benar dan belum expired
   - Regenerate token jika perlu

2. **"Invalid phone number"**
   - Pastikan nomor dalam format internasional (contoh: 6281234567890)
   - Jangan sertakan tanda "+"

3. **"Phone number not verified"**
   - Pastikan nomor telepon sudah diverifikasi di WhatsApp Business

4. **"Rate limit exceeded"**
   - WhatsApp API memiliki batas pengiriman pesan
   - Tunggu beberapa saat sebelum mengirim lagi

## Penggunaan di Kode

### Import Service
```javascript
import { sendWhatsAppOTP, sendWhatsAppNotification } from "../services/whatsappService.js";
```

### Kirim OTP
```javascript
await sendWhatsAppOTP("+6281234567890", "123456");
```

### Kirim Notifikasi
```javascript
await sendWhatsAppNotification("+6281234567890", "Pesan notifikasi Anda");
```

## Keamanan

- Jangan commit credentials ke repository
- Gunakan environment variables untuk menyimpan token
- Regenerate token secara berkala
- Monitor penggunaan API untuk menghindari abuse

## Biaya

WhatsApp Business API memiliki biaya berdasarkan:
- Conversational messaging
- Template messages (untuk marketing)
- Media messages

Lihat [WhatsApp Pricing](https://developers.facebook.com/docs/whatsapp/pricing/) untuk detail lengkap.