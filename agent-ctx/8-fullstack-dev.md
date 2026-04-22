# Task 8 — DIAN Status Poller

## Work Log

- Read existing worklog, soap-client.ts, status route, and Prisma schema
- Examined Invoice model fields: status, dianResponse (JSON with trackId), dianErrorCode, validatedAt, testMode
- Studied existing patterns from `/api/invoices/[id]/status/route.ts` and `subscription-cron` mini-service

### 1. Created Batch Polling API Route
**File**: `src/app/api/invoices/poll-pending/route.ts` (POST)
- Finds all invoices with `status = "PENDING_VALIDATE"` and non-null `dianResponse`
- Optional `?storeId=X` query param for filtering by store
- Limits to 50 invoices per call (`MAX_INVOICES_PER_CALL`)
- Processes invoices with concurrency limit of 5 parallel requests
- For each invoice:
  - Extracts `trackId` from `dianResponse` JSON
  - Calls `getStatus(trackId, config)` with 15s timeout (vs 30s for manual)
  - Updates `dianResponse` with `lastQuery` metadata (including `source: 'cron_poll'`)
  - Status mapping:
    - `10010` / `10012` → `VALIDATED`, sets `validatedAt`
    - `10011` → `REJECTED`, sets `dianErrorCode`
    - `10009` / no code → stays `PENDING_VALIDATE`
- Returns summary: `{ processed, validated, rejected, stillPending, errors, results[] }`
- Uses `export const dynamic = 'force-dynamic'`
- All error messages in Spanish
- Ordered by `createdAt: asc` (oldest first)

### 2. Created Mini-Service for Scheduled Polling
**File**: `mini-services/dian-status-poller/index.ts`
- Runs on port 3011
- Calls `POST /api/invoices/poll-pending` every 5 minutes (300,000ms)
- First poll runs 10 seconds after startup
- HTTP endpoints:
  - `POST /poll` — manual trigger
  - `GET /health` — health check
- Detailed logging:
  - Summary per poll cycle
  - Individual warnings for rejected invoices (⚠)
  - Individual confirmations for validated invoices (✓)
- 120-second timeout for the API call to prevent hanging
- Error handling: timeout detection, connection errors

### 3. Verification
- Lint passes: zero errors in new files (all pre-existing lint errors are in infrastructure .js files)
- API endpoint tested: returns proper JSON with Spanish messages when no pending invoices exist
- Mini-service starts successfully, health check returns `{ status: "ok" }`
- Service running in background on port 3011

## Files Created
1. `src/app/api/invoices/poll-pending/route.ts` — Batch polling API endpoint
2. `mini-services/dian-status-poller/index.ts` — Scheduled cron service
3. `mini-services/dian-status-poller/package.json` — Service manifest

## Stage Summary
- Automatic DIAN status polling fully implemented
- API endpoint processes up to 50 pending invoices per call with 5 concurrent requests
- Mini-service polls every 5 minutes and calls the API endpoint
- Comprehensive logging for rejected and validated invoices
- Manual trigger available via `POST http://localhost:3011/poll`
- No changes to existing code — fully additive implementation
