# Task 8: Settings View - Tax Configuration & Electronic Invoicing Tabs

## Summary
Updated the Settings view (`src/components/settings/settings-view.tsx`) from 3 tabs to 4 tabs, adding full tax rate management (Impuestos) and enhancing the Facturación tab with DIAN electronic invoicing configuration.

## Changes Made

### 1. Prisma Schema (`prisma/schema.prisma`)
- Added DIAN resolution fields to the Store model:
  - `invoicePrefix` - Invoice prefix (FE, POS, etc.)
  - `resolutionNumber` - DIAN resolution number
  - `resolutionStartDate/EndDate` - Resolution date range
  - `resolutionStartNumber/EndNumber` - Consecutive number range
  - `invoiceTestMode` - Test/production mode toggle (default: true)

### 2. Stores API (`src/app/api/stores/route.ts`)
- Extended Zod validation schema to accept new DIAN fields
- Updated PUT handler to persist DIAN fields (with proper Date conversion)

### 3. Settings View (`src/components/settings/settings-view.tsx`)
**Complete rewrite with 4 tabs:**

- **Negocio** (unchanged): Business info, currency
- **Personal** (unchanged): User profile data
- **Facturación** (enhanced):
  - Section 1: Datos Tributarios (NIT, legal name, invoice preview - same as before)
  - Section 2: Resolución DIAN (NEW):
    - Test mode toggle with amber warning banner
    - Resolution number, prefix (4-char max), start/end dates, start/end consecutive numbers
    - Info card explaining electronic invoicing preparation
    - Separate save button for DIAN config
- **Impuestos** (NEW tab):
  - Info box about Colombian DIAN tax system
  - Tax rate cards with color-coded category badges, DIAN code badges, default/active indicators
  - Full CRUD: Create, Edit, Delete (with AlertDialog confirmation)
  - Toggle active/inactive per tax rate
  - Create/Edit dialog with all fields: name, DIAN code select, rate type, rate value, applyTo, category, description, isDefault, isActive
  - Empty state with helpful CTA

### 4. Imports Added
- `Percent`, `Info`, `Plus`, `Pencil`, `Trash2`, `Star`, `AlertTriangle`, `ToggleLeft`, `ToggleRight`, `ShieldCheck` from lucide-react
- `Badge`, `Textarea`, `Switch`, `Checkbox`, `Dialog` (full set), `AlertDialog` (full set), `Select` (full set) from shadcn/ui

## Technical Notes
- Tax API routes already existed (`/api/taxes` and `/api/taxes/[id]`) with full CRUD support - no changes needed
- All labels in Spanish per project convention
- Uses shadcn/ui components throughout (no custom implementations)
- Responsive design with `sm:` breakpoints for tab labels
- No new packages installed
- ESLint clean (only pre-existing `.js` file warnings)
