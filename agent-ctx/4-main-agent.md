# Task Summary: Ventify POS - Bug Fixes & Features
## Task ID: 4

### Agent: Main Agent (Tech Lead)

---

## Work Log

### Bug 1: BILLING_PERIODS Mapping Fix (CRITICAL)
- **Problem**: `BILLING_PERIODS` constant in `super-admin-shell.tsx` used wrong values (`'1M'`, `'3M'`, `'6M'`, `'1Y'`) but the backend API at `/api/super-admin/stores/[id]/subscription` expects `billingPeriod` to be one of: `'TRIAL'`, `'MONTHLY'`, `'QUARTERLY'`, `'SEMI_ANNUAL'`, `'ANNUAL'`. This caused Zod validation rejection when trying to change plans.
- **Fix**: Changed `BILLING_PERIODS` constant to use correct API values:
  - `'1M'` → `'MONTHLY'`
  - `'3M'` → `'QUARTERLY'`
  - `'6M'` → `'SEMI_ANNUAL'`
  - `'1Y'` → `'ANNUAL'`
- **Also fixed**: `openChangePlan()` default state from `'1M'` to `'MONTHLY'`
- **Also fixed**: `selectedPeriod` initial state from `'1M'` to `'MONTHLY'`

### Bug 2: Edit Plan Dialog (READ-ONLY → Functional Form)
- **Problem**: The Edit Plan dialog only displayed plan info as read-only text with just a "Close" button. No editing capability.
- **Fix**: Completely rebuilt the dialog into a proper edit form with:
  - Name (text input, required)
  - Description (text input)
  - Price (number input, COP/mes)
  - Sort Order (number input)
  - Max Employees, Max Products, Max Invoices, Max Orders (number inputs, -1 = unlimited)
  - Active/Inactive toggle (Switch component)
  - "Guardar" button that calls PUT `/api/super-admin/plans/[id]`
  - Cancel/Close buttons
  - Loading state with spinner during save
  - Subscriber count display (read-only)
- **Added**: `Switch` import from `@/components/ui/switch`
- **Added**: `planForm` state, `savingPlan` state
- **Added**: `openEditPlan()` function to initialize form from plan data
- **Added**: `handleSavePlan()` function to persist changes via API

### Bug 3: Subscription Expiry Enforcement
**3A: Check-Expired API Endpoint**
- **Created**: `/api/super-admin/subscriptions/check-expired` (POST)
  - Finds all subscriptions where `endDate < now()` and `status IN ('TRIAL', 'ACTIVE')`
  - Updates their status to `'EXPIRED'`
  - Returns count and list of expired subscriptions

**3B: Subscription Cron Service (Mini Service)**
- **Created**: `mini-services/subscription-cron/index.ts` (port 3010)
  - Uses `bun:sqlite` for direct database access
  - Runs automatically every 24 hours via `setInterval`
  - Also runs on startup after 5-second delay
  - Exposes `/check-expired` POST endpoint for manual triggering
  - Exposes `/health` GET endpoint for health checks
  - Logs expired subscription details to console

**3C: Login Blocking for Expired Stores**
- **Updated**: `/api/auth/login/route.ts`
  - Added `subscription` relation to store include query
  - Added check: if store's subscription status is `'EXPIRED'`, return 403 with error message: `"Suscripción expirada. Contacte al administrador."`
  - Includes `subscriptionStatus` in successful login response for frontend awareness
  - SUPER_ADMIN users bypass this check (no store association)

### Additional: Subscription Status in Stores Table
- **Updated**: Stores table in main dashboard
  - Changed "Plan" column header to "Plan / Estado"
  - Now shows both the plan name badge AND the subscription status badge (color-coded)
  - Status badges: TRIAL (amber), ACTIVE (emerald), PAST_DUE (red), CANCELLED (secondary), EXPIRED (red)

### Bonus: Subscription Reactivation
- **Fixed**: `/api/super-admin/stores/[id]/subscription` PUT endpoint
  - When Super Admin changes a plan for an expired/cancelled store, the subscription is now automatically reactivated
  - Previously, the `update` path left `status: undefined` when not explicitly provided, leaving stores stuck in EXPIRED status

---

## Files Modified
1. `src/components/super-admin/super-admin-shell.tsx` — BILLING_PERIODS fix, Edit Plan dialog, subscription status in stores table
2. `src/app/api/auth/login/route.ts` — Subscription status check + blocking
3. `src/app/api/super-admin/stores/[id]/subscription/route.ts` — Auto-reactivation on plan change

## Files Created
4. `src/app/api/super-admin/subscriptions/check-expired/route.ts` — POST endpoint
5. `mini-services/subscription-cron/index.ts` — Cron service
6. `mini-services/subscription-cron/package.json` — Service config

## Test Results
- ✅ All 4 billing periods (MONTHLY, QUARTERLY, SEMI_ANNUAL, ANNUAL) work correctly
- ✅ Old broken values ('1M', '3M', '6M', '1Y') are properly rejected by Zod
- ✅ Edit Plan dialog saves changes via PUT API
- ✅ Check-expired endpoint correctly identifies and marks expired subscriptions
- ✅ Subscription cron service running on port 3010, auto-checks every 24h
- ✅ Login blocks expired stores with clear Spanish error message
- ✅ Subscription reactivation works when Super Admin changes plan
- ✅ 0 ESLint errors in all modified files
- ✅ Store list includes subscription status in response
