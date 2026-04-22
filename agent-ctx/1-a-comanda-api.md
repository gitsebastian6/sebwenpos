# Task 1-a: Extend comanda API

## Agent: API Developer

## Changes Made

### File: `src/app/api/tables/sessions/[id]/comanda/route.ts`

#### 1. POST - Smart merge for duplicate products
- Before creating a new ComandaItem, the API now checks if a PENDING item already exists with:
  - Same `productId` (or `serviceId`)
  - Same `notes` (both null or both matching exactly)
- If found: increments `quantity`, recalculates `total = quantity * unitPrice`
- If not found: creates a new item (original behavior)
- Response: `{ mergedCount, createdCount, results: [{ merged: true/false, itemId }] }`

#### 2. PATCH - Extended with quantity and notes support
- Updated `updateComandaItemsSchema` with optional `quantity` (int, min 1) and `notes` (string, max 200)
- Added `.refine()` ensuring at least one of `status`, `quantity`, or `notes` is provided
- When `quantity` is provided:
  - Validates items are PENDING or SERVED (rejects PAID/CANCELLED)
  - Updates `quantity` and recalculates `total = quantity * unitPrice` per item
- When both `status` and `quantity` are provided, both are updated together
- Bulk update for status/notes-only changes; per-item update when quantity is involved (to read unitPrice)

#### 3. DELETE - New method to remove comanda items
- Accepts `{ itemIds: number[] }` in request body
- Validates session exists and is OPEN
- Only allows deleting PENDING items (rejects SERVED, PAID, CANCELLED)
- Returns `{ deleted: number }`

### Lint Check
- All 16 lint errors are pre-existing in infrastructure files (mini-services, start-server.js, etc.)
- Zero new lint errors introduced
