# 🔔 Notification System Documentation

## Overview
Sistem notifikasi DarahTanyoe menggunakan multi-channel approach untuk mengirim notifikasi kepada PMI dan Rumah Sakit:
- **Push Notifications** via Firebase Cloud Messaging (FCM)
- **In-App Notifications** via Database
- **Email Notifications** (untuk prioritas tinggi/critical)

---

## 🎯 Notification Channels

### 1. Push Notification (FCM)
- **Platform**: Android, iOS, Web
- **Real-time**: Ya
- **Persistent**: Tidak (hanya saat device online)
- **Use Case**: Primary notification channel

### 2. Database (In-App)
- **Storage**: PostgreSQL via Supabase
- **Persistent**: Ya (history tersimpan)
- **Use Case**: Notification center, badge count

### 3. Email
- **Trigger**: Priority `high` atau `critical`
- **Use Case**: Backup channel, penting seperti approval/rejection

---

## 📊 Database Schema

### Table: `notifications`
```sql
CREATE TABLE notifications (
  id UUID PRIMARY KEY,
  institution_id UUID REFERENCES institutions(id),
  user_id UUID REFERENCES users(id),
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  type notification_type NOT NULL,
  priority priority_level DEFAULT 'medium',
  related_id UUID,
  related_type VARCHAR(50),
  is_read BOOLEAN DEFAULT FALSE,
  read_at TIMESTAMPTZ,
  action_url TEXT,
  action_label VARCHAR(100),
  push_sent BOOLEAN DEFAULT FALSE,
  email_sent BOOLEAN DEFAULT FALSE,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Table: `push_tokens`
```sql
CREATE TABLE push_tokens (
  id UUID PRIMARY KEY,
  institution_id UUID REFERENCES institutions(id),
  user_id UUID REFERENCES users(id),
  token TEXT NOT NULL UNIQUE,
  platform VARCHAR(20) NOT NULL, -- 'web', 'android', 'ios'
  device_id VARCHAR(255),
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 🔐 Firebase Configuration

### Setup Firebase Admin SDK

1. **Get Service Account Key**:
   - Go to [Firebase Console](https://console.firebase.google.com/)
   - Select your project
   - Settings > Service Accounts
   - Generate New Private Key
   - Download JSON file

2. **Add to .env**:
```env
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_PRIVATE_KEY_ID=your-private-key-id
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-project-id.iam.gserviceaccount.com
FIREBASE_CLIENT_ID=your-client-id
```

---

## 📡 API Endpoints

### Institution Notifications

#### 1. Get Notifications
```http
GET /notifications/institution/:institutionId
Query Parameters:
  - limit: number (default: 50)
  - offset: number (default: 0)
  - unread_only: boolean (default: false)

Response:
{
  "success": true,
  "data": [...notifications],
  "total": 100
}
```

#### 2. Get Unread Count
```http
GET /notifications/institution/:institutionId/unread-count

Response:
{
  "success": true,
  "unread_count": 5
}
```

#### 3. Mark as Read
```http
PATCH /notifications/:notificationId/read

Response:
{
  "success": true,
  "message": "Notification marked as read"
}
```

#### 4. Mark All as Read
```http
PATCH /notifications/institution/:institutionId/mark-all-read

Response:
{
  "success": true,
  "message": "All notifications marked as read"
}
```

#### 5. Register Push Token
```http
POST /notifications/push-token/register
Body:
{
  "institutionId": "uuid",
  "token": "fcm-token-here",
  "platform": "web|android|ios",
  "device_id": "optional-device-id"
}

Response:
{
  "success": true,
  "message": "Push token created",
  "action": "created|updated"
}
```

#### 6. Unregister Push Token
```http
POST /notifications/push-token/unregister
Body:
{
  "token": "fcm-token-here"
}

Response:
{
  "success": true,
  "message": "Push token unregistered"
}
```

#### 7. Test Notification (Development Only)
```http
POST /notifications/test
Body:
{
  "institutionId": "uuid",
  "title": "Test Notification",
  "message": "This is a test message"
}

Response:
{
  "success": true,
  "message": "Test notification sent",
  "result": {...}
}
```

---

## 🚀 Usage Examples

### Backend: Send Notification

```javascript
import notificationService from './services/notificationService.js';

// Single institution
await notificationService.notify({
  institutionId: 'uuid-here',
  type: 'request',
  title: 'Permintaan Darah Baru',
  message: 'RS Harapan membutuhkan 3 kantong darah A+',
  priority: 'high',
  relatedId: 'request-uuid',
  relatedType: 'blood_request',
  metadata: {
    blood_type: 'A+',
    quantity: 3,
  },
  actionUrl: '/blood-requests/uuid',
  actionLabel: 'Lihat Detail',
  sendEmail: true, // Optional
  sendPush: true,  // Default: true
});

// Multiple institutions
await notificationService.notifyMultiple(
  ['uuid-1', 'uuid-2', 'uuid-3'],
  {
    type: 'system',
    title: 'System Maintenance',
    message: 'Scheduled maintenance at 2AM',
    priority: 'medium',
  }
);
```

---

## 🎨 Frontend Integration

### 1. Register FCM Token (Web - Next.js)

```typescript
// lib/firebase.ts
import { initializeApp } from 'firebase/app';
import { getMessaging, getToken, onMessage } from 'firebase/messaging';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
const messaging = getMessaging(app);

// Request permission and get token
export async function requestNotificationPermission() {
  try {
    const permission = await Notification.requestPermission();
    
    if (permission === 'granted') {
      const token = await getToken(messaging, {
        vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY,
      });
      
      // Register token to backend
      await fetch('/api/notifications/push-token/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          institutionId: localStorage.getItem('institutionId'),
          token,
          platform: 'web',
        }),
      });
      
      return token;
    }
  } catch (error) {
    console.error('Error getting FCM token:', error);
  }
}

// Listen for foreground messages
export function onMessageListener() {
  return new Promise((resolve) => {
    onMessage(messaging, (payload) => {
      resolve(payload);
    });
  });
}
```

### 2. Notification Component (React/Next.js)

```typescript
'use client';

import { useEffect, useState } from 'react';
import { Bell } from 'lucide-react';

export default function NotificationBell({ institutionId }: { institutionId: string }) {
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState([]);
  const [isOpen, setIsOpen] = useState(false);

  // Fetch unread count
  useEffect(() => {
    async function fetchUnreadCount() {
      const res = await fetch(`/api/notifications/institution/${institutionId}/unread-count`);
      const data = await res.json();
      setUnreadCount(data.unread_count);
    }
    
    fetchUnreadCount();
    
    // Poll every 30 seconds
    const interval = setInterval(fetchUnreadCount, 30000);
    return () => clearInterval(interval);
  }, [institutionId]);

  // Fetch notifications when opened
  const fetchNotifications = async () => {
    const res = await fetch(`/api/notifications/institution/${institutionId}?limit=10`);
    const data = await res.json();
    setNotifications(data.data);
  };

  const markAllAsRead = async () => {
    await fetch(`/api/notifications/institution/${institutionId}/mark-all-read`, {
      method: 'PATCH',
    });
    setUnreadCount(0);
  };

  return (
    <div className="relative">
      <button
        onClick={() => {
          setIsOpen(!isOpen);
          if (!isOpen) fetchNotifications();
        }}
        className="relative p-2 hover:bg-gray-100 rounded-full"
      >
        <Bell className="w-6 h-6" />
        {unreadCount > 0 && (
          <span className="absolute top-0 right-0 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 bg-white shadow-lg rounded-lg border z-50">
          <div className="flex items-center justify-between p-4 border-b">
            <h3 className="font-semibold">Notifikasi</h3>
            {unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                className="text-sm text-blue-600 hover:underline"
              >
                Tandai semua sudah dibaca
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="p-4 text-center text-gray-500">
                Tidak ada notifikasi
              </div>
            ) : (
              notifications.map((notif) => (
                <div
                  key={notif.id}
                  className={`p-4 border-b hover:bg-gray-50 cursor-pointer ${
                    !notif.is_read ? 'bg-blue-50' : ''
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-1">
                      <h4 className="font-medium text-sm">{notif.title}</h4>
                      <p className="text-sm text-gray-600 mt-1">{notif.message}</p>
                      <span className="text-xs text-gray-400 mt-2 block">
                        {new Date(notif.created_at).toLocaleString('id-ID')}
                      </span>
                    </div>
                    {!notif.is_read && (
                      <div className="w-2 h-2 bg-blue-500 rounded-full mt-1" />
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
```

---

## 📋 Notification Types & Priorities

### Notification Types (ENUM)
- `request` - Blood request related
- `donation` - Donation related
- `pickup` - Pickup schedule related
- `stock` - Stock alert
- `campaign` - Campaign related
- `system` - System messages

### Priority Levels (ENUM)
- `low` - Informational
- `medium` - Normal notification (default)
- `high` - Important (sends email)
- `critical` - Very urgent (sends email + highlighted)

---

## 🔄 Notification Workflow

### 1. RS Creates Blood Request
```
RS → Create Request → API
                      ↓
               [Notification Service]
                      ↓
           ┌──────────┴──────────┐
           ↓                     ↓
    [Save to DB]          [Send FCM Push]
           ↓                     ↓
    PMI Dashboard         PMI Mobile App
    (Bell Icon +1)        (Push Notification)
```

### 2. PMI Approves Request
```
PMI → Approve Request → API
                        ↓
                [Notification Service]
                        ↓
              ┌─────────┴─────────┐
              ↓                   ↓
        [Save to DB]        [Send FCM + Email]
              ↓                   ↓
       RS Dashboard         RS Email Inbox
       (Notification)       (Approval Email)
```

### 3. PMI Rejects Request
```
PMI → Reject Request → API
                       ↓
               [Notification Service]
                       ↓
             ┌─────────┴─────────┐
             ↓                   ↓
       [Save to DB]        [Send FCM + Email]
             ↓                   ↓
      RS Dashboard         RS Email Inbox
      (Notification)       (Rejection Email)
```

---

## ✅ Testing Checklist

- [ ] Install dependencies: `npm install`
- [ ] Configure Firebase credentials in `.env`
- [ ] Run database migration (001_complete_schema.sql)
- [ ] Test push token registration
- [ ] Test notification creation (POST /notifications/test)
- [ ] Verify FCM push delivery
- [ ] Test mark as read functionality
- [ ] Test unread count
- [ ] Test notification list pagination
- [ ] Verify email sending (configure email service)

---

## 🐛 Troubleshooting

### Push Notifications Not Received
1. Check Firebase credentials in `.env`
2. Verify FCM token is registered in `push_tokens` table
3. Check token is `active = true`
4. Test with `/notifications/test` endpoint
5. Check browser/app notification permissions

### Notifications Not Saving to DB
1. Verify database schema is up to date
2. Check Supabase connection
3. Verify `institution_id` or `user_id` exists
4. Check table constraints (one of institution_id or user_id must be set)

### Email Not Sending
1. Email service not yet implemented (placeholder only)
2. Implement with nodemailer, AWS SES, or SendGrid
3. Configure SMTP credentials in `.env`

---

## 🚀 Next Steps

1. **Implement Email Service**
   - Add nodemailer or AWS SES
   - Create email templates
   - Configure SMTP settings

2. **Add Real-time Updates** (Optional)
   - Use Supabase Realtime subscriptions
   - WebSocket for live notification updates

3. **Add Notification Preferences**
   - Let institutions customize notification settings
   - Mute/unmute specific notification types

4. **Add Notification History Export**
   - Download notification history as CSV/PDF

---

## 📚 Resources

- [Firebase Cloud Messaging Docs](https://firebase.google.com/docs/cloud-messaging)
- [Supabase Realtime](https://supabase.com/docs/guides/realtime)
- [Next.js Push Notifications](https://nextjs.org/docs/app/building-your-application/configuring/pwa)
