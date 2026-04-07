---
Task ID: QA-FULL
Agent: QA Testing Lead
Task: Full QA audit - find and fix all bugs in POS system

Work Log:
- Read ALL 8 view components (dashboard, pos, products, customers, orders, inventory, accounting, services)
- Read ALL 17 API route files
- Read Prisma schema, lib files (db, auth, utils), Zustand stores
- Cross-referenced every API response shape against frontend consumption

Bugs Found and Fixed:

CRITICAL BUGS (5):
1. **Missing POST /api/orders handler** — POS order creation returned 405. Added complete POST handler with product validation, stock check, order creation, inventory movements, double-entry journal entries, and CREDIT payment handling.

2. **Ledger API entries response format mismatch** — API returned flat array; accounting-view expected `{entries: [...], totals: {debits, credits}}`. Fixed by wrapping response in proper structure.

3. **Ledger API accounts _count vs entryCount** — API returned `_count: {journalEntries}` but frontend expected `entryCount`. Fixed by mapping to explicit field name.

4. **Ledger API missing accountId filter** — Frontend sent `accountId` query param but API ignored it. Added accountId to the where clause.

5. **Dashboard lowStockProducts hardcoded threshold** — Used `currentStock: {lte: 10}` instead of comparing against `minStock`. Fixed with raw SQL query.

PRE-EXISTING BUGS (7):
6. **Zod v4 API: .errors → .issues** — Fixed in 7 API route files
7. **orders/[id] route TS errors** — Fixed Prisma include/select type issues
8. **seed route type inference** — Fixed `createdCustomers` type annotation
9. **Dashboard chart tooltip formatter** — Fixed Recharts generic type mismatch
10. **Products view deleteTarget null safety** — Fixed null check
11. **Dashboard salesByDay type** — Fixed `never[]` inference
12. **Dashboard recentOrders DTO** — Normalized response shape

All bugs fixed. Zero TypeScript errors. Zero ESLint errors.
