# Task 3: Refactor tables-view monolithic component

## Work Record

### Files Created/Modified

| File | Lines | Status |
|------|-------|--------|
| `src/hooks/use-tables-data.ts` | 462 | **NEW** |
| `src/components/tables/table-session-dialog.tsx` | 1,065 | **NEW** |
| `src/components/tables/comanda-panel.tsx` | 925 | **NEW** |
| `src/components/tables/tables-view.tsx` | 663 | **REWRITTEN** (was 2,697) |

### Summary

The monolithic `tables-view.tsx` (2,697 lines) was broken into 4 focused modules:

1. **`use-tables-data.ts`** — Data fetching hook with all shared types, constants, and helpers
2. **`table-session-dialog.tsx`** — 5 self-contained dialog components (OpenSession, CloseSession, AddTable, DeleteTable, Payment)
3. **`comanda-panel.tsx`** — Sheet component for comanda/kitchen order management
4. **`tables-view.tsx`** — Slim orchestrator (663 lines, 75% reduction) that composes everything

### Key Decisions

- **State ownership**: Item selection state (`selectedItemIds`) lifted to parent (tables-view) since it's shared between comanda panel and payment dialog
- **Dialog self-containment**: Each dialog manages its own form state internally (reset on open/close)
- **Types centralized**: All shared types exported from `use-tables-data.ts`
- **No business logic changes**: All behavior preserved exactly as original

### Bug Fix

- Fixed pre-existing TypeScript bug: `store?.resolutionStart` → `store?.resolutionStartNumber` (correct field name)
