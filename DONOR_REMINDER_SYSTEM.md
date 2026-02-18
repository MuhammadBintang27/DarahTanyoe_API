# Donor Reminder System

## Overview
Sistem pengingat otomatis via WhatsApp untuk donor yang sudah melewati masa vakum (90 hari sejak donasi terakhir).

## Features
- ✅ Otomatis cek donor yang eligible setiap hari
- ✅ Kirim WhatsApp reminder pada hari ke-90 setelah donasi terakhir
- ✅ Scheduled job via Vercel Cron (9:00 AM WIB)
- ✅ Manual trigger untuk testing/admin use
- ✅ Security: Authorized requests only

## Configuration

### Environment Variables
Tambahkan di `.env`:
```env
# Optional: Secret token for manual cron triggering
CRON_SECRET=your-secret-token-here
```

### Vercel Cron Schedule
Configured in `vercel.json`:
```json
"crons": [
  {
    "path": "/donor-reminder/send",
    "schedule": "0 2 * * *"
  }
]
```
**Schedule**: `0 2 * * *` = 2:00 AM UTC = **9:00 AM WIB** (Jakarta Time)

## Endpoints

### 1. Automated Reminder (Cron Job)
**POST** `/donor-reminder/send`

**Triggered by**: Vercel Cron (daily at 9:00 AM WIB)

**Response**:
```json
{
  "status": "SUCCESS",
  "message": "Reminder berhasil dikirim ke 5 donor",
  "sent_count": 5,
  "failed_count": 0,
  "total_eligible": 5,
  "results": [
    {
      "donor_id": "uuid",
      "donor_name": "John Doe",
      "phone_number": "628123456789",
      "status": "sent"
    }
  ]
}
```

### 2. Manual Reminder (Admin/Testing)
**POST** `/donor-reminder/manual`

**Body**:
```json
{
  "donor_ids": [
    "uuid-donor-1",
    "uuid-donor-2"
  ]
}
```

**Response**:
```json
{
  "status": "SUCCESS",
  "message": "Reminder berhasil dikirim ke 2 dari 2 donor",
  "sent_count": 2,
  "total": 2,
  "results": [...]
}
```

## WhatsApp Message Template

```
Selamat! 🎉

Masa vakum donor Anda telah berakhir pada hari ini.

INFORMASI DONOR:
Nama: [Donor Name]
Golongan Darah: [Blood Type]
Donasi Terakhir: [Last Donation Date]

Saat ini Anda sudah bisa mendonorkan darah kembali! 🩸

Anda akan menerima notifikasi jika ada permintaan darah yang sesuai dengan profil Anda. Atau, Anda bisa langsung membuat janji donor melalui aplikasi DarahTanyoe.

Terima kasih telah menjadi pahlawan tanpa tanda jasa! 💪
```

## Logic Flow

1. **Daily Cron Trigger** (9:00 AM WIB)
   - Vercel Cron hits `/donor-reminder/send`

2. **Get Eligible Donors**
   - Query `donations` table
   - Filter: `status = 'completed'` AND `donation_date` between 89-91 days ago
   - Deduplicate by `donor_id`

3. **Send WhatsApp**
   - Loop through eligible donors
   - Send WhatsApp notification with message template
   - 100ms delay between messages (rate limiting)

4. **Return Results**
   - Success count
   - Failed count
   - Detailed results per donor

## Testing

### Test Manual Trigger (Local)
```bash
curl -X POST http://localhost:4000/donor-reminder/manual \
  -H "Content-Type: application/json" \
  -d '{"donor_ids": ["your-donor-uuid"]}'
```

### Test Cron Endpoint (with auth token)
```bash
curl -X POST https://your-api.vercel.app/donor-reminder/send \
  -H "Authorization: Bearer your-cron-secret"
```

### Simulate 90-day-old Donation (for testing)
```sql
-- Update a donation to be 90 days old
UPDATE donations 
SET donation_date = NOW() - INTERVAL '90 days'
WHERE donor_id = 'your-test-donor-id' 
AND status = 'completed';
```

## Security

### Automated Cron
- Protected by `x-vercel-cron` header (Vercel internal)
- Only Vercel Cron can trigger

### Manual Testing
- Optional: Bearer token authentication
- Set `CRON_SECRET` in environment variables
- Include in request: `Authorization: Bearer {CRON_SECRET}`

## Monitoring

### Check Vercel Logs
1. Go to Vercel Dashboard
2. Select project: `DarahTanyoe_API`
3. Go to **Logs** tab
4. Filter by `/donor-reminder/send`
5. Check daily execution at 9:00 AM WIB

### Expected Log Output
```
🔔 Starting donor reminder job...
✅ Found 3 eligible donors for reminder
✅ Reminder sent to John Doe (628123456789)
✅ Reminder sent to Jane Smith (628987654321)
✅ Reminder sent to Bob Johnson (628111222333)
🔔 Reminder job completed: 3 sent, 0 failed
```

## Troubleshooting

### No donors found
- Check if any donations exist that are exactly 90 days old
- Tolerance: ±1 day (89-91 days)

### WhatsApp not sending
- Check WhatsApp service configuration
- Verify phone numbers format (62xxx)
- Check WhatsApp API logs

### Cron not triggering
- Verify Vercel cron configuration in dashboard
- Check deployment status
- View Vercel logs for cron execution

## Future Enhancements

- [ ] Add notification history table to prevent duplicate reminders
- [ ] Configurable vaccination period (60/90/120 days)
- [ ] Batch processing for large donor pools
- [ ] Admin dashboard for reminder statistics
- [ ] SMS fallback if WhatsApp fails

## File Structure
```
DarahTanyoe_API/
├── src/
│   ├── controllers/
│   │   └── donorReminderController.js  # Main logic
│   ├── routes/
│   │   └── donorReminderRouter.js      # API routes
│   └── server.js                        # Router registration
├── vercel.json                          # Cron configuration
└── DONOR_REMINDER_SYSTEM.md            # This file
```
