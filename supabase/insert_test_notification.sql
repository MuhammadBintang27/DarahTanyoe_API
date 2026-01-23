-- Insert test notifications for a specific user
-- Replace 'USER_ID_HERE' with actual user ID from your users table

INSERT INTO notifications (
  user_id,
  title,
  message,
  type,
  priority,
  is_read,
  push_sent,
  email_sent,
  sms_sent,
  created_at
) VALUES
(
  '6e56e35b-0bc6-4a8a-81b6-6d5ff103e256'::uuid,
  'Permintaan Darah Baru',
  'Ada permintaan darah baru di dekat lokasi Anda',
  'request',
  'high',
  false,
  true,
  false,
  false,
  NOW()
),
(
  '6e56e35b-0bc6-4a8a-81b6-6d5ff103e256'::uuid,
  'Kampanye Donor Darah',
  'Kampanye donor darah baru sedang berlangsung',
  'campaign',
  'medium',
  false,
  true,
  false,
  false,
  NOW() - INTERVAL '1 day'
),
(
  '6e56e35b-0bc6-4a8a-81b6-6d5ff103e256'::uuid,
  'Status Donasi Anda',
  'Terima kasih sudah mendonor. Anda bisa mendonor kembali dalam 56 hari',
  'donation',
  'medium',
  true,
  true,
  true,
  false,
  NOW() - INTERVAL '3 days'
);

-- Check inserted data
SELECT * FROM notifications WHERE user_id = '6e56e35b-0bc6-4a8a-81b6-6d5ff103e256'::uuid ORDER BY created_at DESC;
