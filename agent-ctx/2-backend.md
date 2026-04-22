# Task 2-backend — Work Record

## What Was Done

### Step 1: SystemSetting Prisma Model
- Added `SystemSetting` model to `prisma/schema.prisma` (id, key unique, value, updatedAt)
- Maps to `system_settings` table
- Ran `bun run db:push` — synced successfully

### Step 2: MessageBird Service Library
- Created `src/lib/messagebird.ts` with:
  - In-memory OTP store (5-min TTL, auto-cleanup)
  - `generateOTP()` — 6-digit crypto.randomInt
  - `normalizePhone()` — Colombian phone normalization
  - `getMessageBirdConfig()` / `isWhatsAppOTPEnabled()` — config from DB
  - `sendOTPViaWhatsApp()` — MessageBird Conversations API integration
  - `verifyOTP()` — code validation with expiry check

### Step 3: OTP API Routes
- `POST /api/auth/send-otp` — send OTP to user by cedula
- `POST /api/auth/verify-otp` — verify OTP + reset password
- `GET /api/auth/otp-status` — check if WhatsApp OTP is enabled

### Step 4: Super Admin System Config API
- `GET /api/super-admin/system-config` — read MessageBird config
- `PUT /api/super-admin/system-config` — update MessageBird config (SUPER_ADMIN only)

### Step 5: Auth Helpers Update
- Added 3 routes to PUBLIC_PATHS in `src/lib/auth-helpers.ts`

### Step 6: Lint
- `bun run lint` — 0 errors
