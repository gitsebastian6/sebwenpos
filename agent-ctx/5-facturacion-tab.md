---
Task ID: 5
Agent: main-orchestrator
Task: Rebuild "Facturación" (Invoice) tab with hybrid electronic invoicing configuration

Work Log:
- Read full worklog.md for project context (Colombian POS system, DIAN integration, electronic invoicing)
- Read existing settings-view.tsx (1617 lines) with 4 tabs: Negocio, Personal, Facturación, IVA
- Read prisma/schema.prisma to verify Store model fields (electronicInvoicingEnabled, connectionMode, pteApiUrl, pteApiKey, etc.)
- Verified existing API: /api/settings/electronic-invoicing/route.ts (GET endpoint with readiness checklist, resolution stats, cert details)
- Verified stores API PUT handler supports: electronicInvoicingEnabled, connectionMode, pteApiUrl, pteApiKey
- Wrote complete rebuilt settings-view.tsx (~1600 lines) with:

**New State Variables:**
- electronicInvoicingEnabled, connectionMode, pteApiUrl, pteApiKey
- invoicingStatus, loadingInvoicingStatus, savingMasterConfig, savingConnectionMode

**New Handler Functions:**
- fetchInvoicingStatus() — GET /api/settings/electronic-invoicing?storeId=${store.id}
- handleToggleElectronicInvoicing() — PUT toggle with store update
- handleSaveConnectionMode() — PUT with connectionMode, pteApiUrl, pteApiKey

**Rebuilt Facturación Tab (7 sections):**
1. Section 0: MASTER TOGGLE — Prominent card with big Switch, status badges (PRUEBAS/PRODUCCIÓN)
2. Section 1: SETUP PROGRESS DASHBOARD — Progress bar with 5 steps (check/x icons), resolution usage stats mini bar, status summary
3. Section 2: CONNECTION MODE SELECTOR — 3 clickable cards (Directo/PTE/Híbrido) with ShieldCheck/Building2/RefreshCw icons, contextual PTE fields
4. Section 3: DATOS TRIBUTARIOS — Same as before (Razón Social, NIT, preview)
5. Section 4: RESOLUCIÓN DIAN — Enhanced with resolution usage stats, format example (FE-00000001)
6. Section 5: CERTIFICADO DIGITAL — Same as before (upload, info, removal)
7. Section 6: SOFTWARE DIAN / PTE — Enhanced: Software ID+PIN always shown, PTE NIT shown conditionally, contextual info card

**Preserved Sections (unchanged):**
- All imports, constants, state variables, handler functions for store/user/certificate/taxes
- Negocio tab (identical)
- Personal tab (identical)
- IVA tab + tax dialog (identical)

**New Icons Used:** Zap, GitBranch, RefreshCw (added to lucide-react imports)

**Lint Result:** 0 errors in settings-view.tsx. Only pre-existing errors in infrastructure files (daemon.js, keepalive.cjs, mini-services).

Stage Summary:
- Complete rebuild of Facturación tab with 7 ordered sections
- Master toggle controls visibility of all other invoice sections
- Setup progress dashboard pulls real data from /api/settings/electronic-invoicing
- Connection mode selector with 3 modes (DIRECT/PTE/HYBRID) with contextual fields
- All existing functionality preserved (Negocio, Personal, IVA tabs unchanged)
- File compiles with zero lint errors
