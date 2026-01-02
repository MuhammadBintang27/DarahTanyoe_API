# 🔔 Notification System Workflow Diagram

## 📊 Complete Notification Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         NOTIFICATION SYSTEM ARCHITECTURE                     │
└─────────────────────────────────────────────────────────────────────────────┘

┌──────────────┐           ┌──────────────┐           ┌──────────────┐
│              │           │              │           │              │
│   Rumah      │           │     PMI      │           │    Donor     │
│   Sakit      │           │   (Mitra)    │           │  (User App)  │
│              │           │              │           │              │
└──────┬───────┘           └──────┬───────┘           └──────┬───────┘
       │                          │                          │
       │                          │                          │
═══════╪══════════════════════════╪══════════════════════════╪═══════════════
       │                          │                          │
       │                          │                          │
┌──────▼─────────────────────────▼──────────────────────────▼───────────┐
│                                                                        │
│                        NOTIFICATION SERVICE                            │
│                    (notificationService.js)                            │
│                                                                        │
│  ┌─────────────────────────────────────────────────────────────┐     │
│  │                    notify() Method                          │     │
│  │                                                              │     │
│  │  Input:                                                      │     │
│  │  - institutionId / userId                                   │     │
│  │  - type (request/donation/pickup/stock/campaign/system)    │     │
│  │  - title                                                     │     │
│  │  - message                                                   │     │
│  │  - priority (low/medium/high/critical)                      │     │
│  │  - metadata, actionUrl, etc.                                │     │
│  │                                                              │     │
│  └──────────────────────┬───────────────────────────────────────┘     │
│                         │                                             │
│         ┌───────────────┼───────────────┐                            │
│         │               │               │                            │
│         ▼               ▼               ▼                            │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐                   │
│  │   Save to   │ │  Send FCM   │ │ Send Email  │                   │
│  │  Database   │ │    Push     │ │ (Priority   │                   │
│  │             │ │             │ │  High/Crit) │                   │
│  └──────┬──────┘ └──────┬──────┘ └──────┬──────┘                   │
│         │               │               │                            │
└─────────┼───────────────┼───────────────┼────────────────────────────┘
          │               │               │
          │               │               │
════════════════════════════════════════════════════════════════════════
          │               │               │
          ▼               ▼               ▼
┌──────────────────────────────────────────────────────────────────────┐
│                      NOTIFICATION CHANNELS                           │
└──────────────────────────────────────────────────────────────────────┘

     ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
     │   Database   │    │     FCM      │    │    Email     │
     │  PostgreSQL  │    │  Cloud Push  │    │   SMTP/SES   │
     └──────┬───────┘    └──────┬───────┘    └──────┬───────┘
            │                   │                   │
            ▼                   ▼                   ▼
     ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
     │ Notification │    │ Push to App  │    │  Send to     │
     │   History    │    │   & Web      │    │   Inbox      │
     │              │    │              │    │              │
     │ • List       │    │ • Android    │    │ • HTML       │
     │ • Unread     │    │ • iOS        │    │ • Plain Text │
     │ • Badge      │    │ • Web        │    │ • With Link  │
     └──────────────┘    └──────────────┘    └──────────────┘

═══════════════════════════════════════════════════════════════════════

## 🔄 WORKFLOW SCENARIOS

### SCENARIO 1: RS Creates Blood Request
───────────────────────────────────────────────────────────────────────

    ┌─────────┐
    │   RS    │ Creates Request
    └────┬────┘
         │
         ▼
    ┌─────────────────────────────────────┐
    │  POST /bloodRequests/create         │
    │                                     │
    │  Body:                              │
    │  {                                  │
    │    requester_id: RS_UUID           │
    │    partner_id: PMI_UUID            │
    │    blood_type: "A+"                │
    │    quantity: 3                     │
    │    urgency_level: "high"           │
    │  }                                  │
    └──────────────┬──────────────────────┘
                   │
                   ▼
    ┌──────────────────────────────────────┐
    │  notificationService.notify()        │
    │                                      │
    │  Parameters:                         │
    │  - institutionId: PMI_UUID          │
    │  - type: "request"                  │
    │  - title: "Permintaan Darah Baru"  │
    │  - message: "RS X butuh 3 kantong" │
    │  - priority: "high"                 │
    │  - sendEmail: true (if critical)   │
    └──────────────┬───────────────────────┘
                   │
        ┌──────────┼──────────┐
        │          │          │
        ▼          ▼          ▼
    ┌────────┐ ┌────────┐ ┌────────┐
    │  Save  │ │  Push  │ │ Email  │
    │   DB   │ │  PMI   │ │  PMI   │
    └────────┘ └────────┘ └────────┘
                   │
                   ▼
    ┌─────────────────────────────────────┐
    │  PMI Dashboard/App                  │
    │                                     │
    │  🔔 [1] Notifikasi Baru            │
    │                                     │
    │  📋 Permintaan Darah Baru          │
    │     RS Harapan membutuhkan          │
    │     3 kantong darah A+              │
    │     [Lihat Detail]                  │
    └─────────────────────────────────────┘

───────────────────────────────────────────────────────────────────────

### SCENARIO 2: PMI Approves Request
───────────────────────────────────────────────────────────────────────

    ┌─────────┐
    │   PMI   │ Approves Request
    └────┬────┘
         │
         ▼
    ┌─────────────────────────────────────┐
    │  PATCH /partners/approve/:requestId │
    │                                     │
    │  1. Update status: "approved"       │
    │  2. Generate unique_code: "BR12345" │
    │  3. Check stock availability        │
    └──────────────┬──────────────────────┘
                   │
                   ▼
    ┌──────────────────────────────────────┐
    │  notificationService.notify()        │
    │                                      │
    │  Parameters:                         │
    │  - institutionId: RS_UUID           │
    │  - type: "request"                  │
    │  - title: "Permintaan Disetujui"   │
    │  - message: "Darah ready, kode..."  │
    │  - priority: "high"                 │
    │  - metadata: { unique_code }        │
    │  - sendEmail: true                  │
    └──────────────┬───────────────────────┘
                   │
        ┌──────────┼──────────┐
        │          │          │
        ▼          ▼          ▼
    ┌────────┐ ┌────────┐ ┌────────┐
    │  Save  │ │  Push  │ │ Email  │
    │   DB   │ │   RS   │ │   RS   │
    └────────┘ └────────┘ └────────┘
                   │
                   ▼
    ┌─────────────────────────────────────┐
    │  RS Dashboard/App                   │
    │                                     │
    │  🔔 [1] Notifikasi Baru            │
    │                                     │
    │  ✅ Permintaan Darah Disetujui     │
    │     Darah A+ telah disetujui PMI    │
    │     Kode Pickup: BR12345            │
    │     [Lihat Detail]                  │
    └─────────────────────────────────────┘

───────────────────────────────────────────────────────────────────────

### SCENARIO 3: PMI Rejects Request
───────────────────────────────────────────────────────────────────────

    ┌─────────┐
    │   PMI   │ Rejects Request + Reason
    └────┬────┘
         │
         ▼
    ┌─────────────────────────────────────┐
    │  PATCH /partners/reject/:requestId  │
    │                                     │
    │  Body:                              │
    │  {                                  │
    │    rejection_reason: "Stok habis"  │
    │  }                                  │
    │                                     │
    │  1. Update status: "rejected"       │
    │  2. Save rejection_reason           │
    └──────────────┬──────────────────────┘
                   │
                   ▼
    ┌──────────────────────────────────────┐
    │  notificationService.notify()        │
    │                                      │
    │  Parameters:                         │
    │  - institutionId: RS_UUID           │
    │  - type: "request"                  │
    │  - title: "Permintaan Ditolak"     │
    │  - message: "Alasan: Stok habis"    │
    │  - priority: "high"                 │
    │  - sendEmail: true                  │
    └──────────────┬───────────────────────┘
                   │
        ┌──────────┼──────────┐
        │          │          │
        ▼          ▼          ▼
    ┌────────┐ ┌────────┐ ┌────────┐
    │  Save  │ │  Push  │ │ Email  │
    │   DB   │ │   RS   │ │   RS   │
    └────────┘ └────────┘ └────────┘
                   │
                   ▼
    ┌─────────────────────────────────────┐
    │  RS Dashboard/App                   │
    │                                     │
    │  🔔 [1] Notifikasi Baru            │
    │                                     │
    │  ❌ Permintaan Darah Ditolak       │
    │     Permintaan darah A+ ditolak     │
    │     Alasan: Stok habis              │
    │     [Lihat Detail]                  │
    └─────────────────────────────────────┘

═══════════════════════════════════════════════════════════════════════

## 📱 NOTIFICATION DELIVERY MATRIX

┌──────────────┬─────────┬─────────┬───────┬─────────────────────┐
│   Scenario   │Database │   FCM   │ Email │      Recipient      │
├──────────────┼─────────┼─────────┼───────┼─────────────────────┤
│ Request      │    ✅   │    ✅   │  ⚠️  │ PMI (if critical)   │
│ Created      │         │         │       │                     │
├──────────────┼─────────┼─────────┼───────┼─────────────────────┤
│ Request      │    ✅   │    ✅   │  ✅  │ RS (requester)      │
│ Approved     │         │         │       │                     │
├──────────────┼─────────┼─────────┼───────┼─────────────────────┤
│ Request      │    ✅   │    ✅   │  ✅  │ RS (requester)      │
│ Rejected     │         │         │       │                     │
├──────────────┼─────────┼─────────┼───────┼─────────────────────┤
│ Stock Low    │    ✅   │    ✅   │  ✅  │ PMI Admin           │
│ Alert        │         │         │       │                     │
├──────────────┼─────────┼─────────┼───────┼─────────────────────┤
│ Pickup       │    ✅   │    ✅   │  ❌  │ RS & PMI            │
│ Confirmed    │         │         │       │                     │
└──────────────┴─────────┴─────────┴───────┴─────────────────────┘

Legend:
  ✅ = Always sent
  ⚠️  = Conditional (based on priority)
  ❌ = Not sent

═══════════════════════════════════════════════════════════════════════

## 🎯 PRIORITY LEVELS & ACTIONS

┌───────────┬──────────────────────┬─────────┬────────┬────────┐
│ Priority  │    Use Case          │Database │  Push  │ Email  │
├───────────┼──────────────────────┼─────────┼────────┼────────┤
│ low       │ Info only            │    ✅   │   ✅   │   ❌   │
├───────────┼──────────────────────┼─────────┼────────┼────────┤
│ medium    │ Normal notification  │    ✅   │   ✅   │   ❌   │
├───────────┼──────────────────────┼─────────┼────────┼────────┤
│ high      │ Important action     │    ✅   │   ✅   │   ✅   │
├───────────┼──────────────────────┼─────────┼────────┼────────┤
│ critical  │ Urgent action needed │    ✅   │   ✅   │   ✅   │
└───────────┴──────────────────────┴─────────┴────────┴────────┘

═══════════════════════════════════════════════════════════════════════

## 🔐 TOKEN MANAGEMENT FLOW

### Register Device Token
───────────────────────────────────────────────────────────────────────

    ┌─────────────┐
    │ Web/Mobile  │ App Starts
    │    App      │
    └──────┬──────┘
           │
           ▼
    ┌────────────────────────────┐
    │ Request Notification       │
    │ Permission                 │
    └──────┬─────────────────────┘
           │
           ▼ (granted)
    ┌────────────────────────────┐
    │ Get FCM Token              │
    └──────┬─────────────────────┘
           │
           ▼
    ┌────────────────────────────────────┐
    │ POST /notifications/push-token/    │
    │      register                      │
    │                                    │
    │ Body:                              │
    │ {                                  │
    │   institutionId: "uuid",          │
    │   token: "fcm-token-string",      │
    │   platform: "web|android|ios",    │
    │   device_id: "device-id"          │
    │ }                                  │
    └──────┬─────────────────────────────┘
           │
           ▼
    ┌────────────────────────────┐
    │ Save to push_tokens table  │
    │                            │
    │ • Check if exists          │
    │ • Update or insert         │
    │ • Set active = true        │
    └────────────────────────────┘

═══════════════════════════════════════════════════════════════════════

## 📊 DATABASE RELATIONSHIPS

┌─────────────────────────────────────────────────────────────────┐
│                     notifications                               │
├─────────────────────────────────────────────────────────────────┤
│ id                 UUID PRIMARY KEY                             │
│ institution_id     UUID → institutions(id)                      │
│ user_id            UUID → users(id)                             │
│ title              VARCHAR(255)                                 │
│ message            TEXT                                         │
│ type               notification_type (ENUM)                     │
│ priority           priority_level (ENUM)                        │
│ related_id         UUID (blood_request.id, etc)                │
│ related_type       VARCHAR(50)                                  │
│ is_read            BOOLEAN                                      │
│ read_at            TIMESTAMPTZ                                  │
│ action_url         TEXT                                         │
│ push_sent          BOOLEAN                                      │
│ email_sent         BOOLEAN                                      │
│ metadata           JSONB                                        │
│ created_at         TIMESTAMPTZ                                  │
└─────────────────────────────────────────────────────────────────┘
                          │
                          │ FK
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                      institutions                               │
├─────────────────────────────────────────────────────────────────┤
│ id                      UUID PRIMARY KEY                        │
│ institution_name        VARCHAR(255)                            │
│ email                   VARCHAR(255)                            │
│ notification_email      VARCHAR(255)                            │
│ email_notifications     BOOLEAN                                 │
│ push_notifications      BOOLEAN                                 │
│ ...                                                             │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                       push_tokens                               │
├─────────────────────────────────────────────────────────────────┤
│ id                 UUID PRIMARY KEY                             │
│ institution_id     UUID → institutions(id)                      │
│ user_id            UUID → users(id)                             │
│ token              TEXT UNIQUE                                  │
│ platform           VARCHAR(20)                                  │
│ device_id          VARCHAR(255)                                 │
│ active             BOOLEAN                                      │
│ created_at         TIMESTAMPTZ                                  │
│ updated_at         TIMESTAMPTZ                                  │
└─────────────────────────────────────────────────────────────────┘

═══════════════════════════════════════════════════════════════════════

## 🎨 Frontend Components Architecture

┌─────────────────────────────────────────────────────────────────┐
│                      Dashboard Layout                           │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Header                                                  │  │
│  │                                                          │  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────────────┐      │  │
│  │  │  Logo    │  │  Menu    │  │  🔔 [3] Profile  │      │  │
│  │  └──────────┘  └──────────┘  └────────┬─────────┘      │  │
│  └─────────────────────────────────────────┼──────────────┘  │
│                                            │                  │
│                                            ▼                  │
│                                 ┌─────────────────────────┐   │
│                                 │ NotificationDropdown    │   │
│                                 │                         │   │
│                                 │ 🔴 Permintaan Baru     │   │
│                                 │    2 menit lalu        │   │
│                                 │                         │   │
│                                 │ ✅ Request Approved    │   │
│                                 │    1 jam lalu          │   │
│                                 │                         │   │
│                                 │ [Tandai sudah dibaca]  │   │
│                                 └─────────────────────────┘   │
│                                                                │
└─────────────────────────────────────────────────────────────────┘

Components:
  • NotificationBell.tsx    - Bell icon with badge
  • NotificationDropdown.tsx - Dropdown list
  • NotificationItem.tsx     - Individual notification
  • useNotifications.ts      - Custom hook
  • notificationService.ts   - API calls

═══════════════════════════════════════════════════════════════════════
