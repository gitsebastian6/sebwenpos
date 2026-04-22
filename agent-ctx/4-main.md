---
Task ID: 4
Agent: main
Task: Refactor settings-view monolithic component (3,161 lines) into smaller hooks + sub-components

Summary:
- settings-view.tsx reduced from 3,161 → 76 lines (97.6% reduction)
- 6 new component files created in src/components/settings/
- All business logic preserved, no UI/behavior changes
- Each component is self-contained (reads from useAuthStore, manages own state)
- Lint clean (0 new errors)
- Total: 3,301 lines across 7 files

Files Created:
1. subscription-payment-panel.tsx (1,536 lines) — SubscriptionPaymentPanel + SubscriptionHistoryPanel
2. security-question-card.tsx (251 lines) — SecurityQuestionCard
3. business-settings-tab.tsx (153 lines) — Business tab (store info)
4. personal-settings-tab.tsx (141 lines) — Personal tab (user info + security question)
5. invoice-settings-tab.tsx (507 lines) — Invoice tab (tax data + DIVIPOLA + DIAN resolution)
6. tax-rates-panel.tsx (637 lines) — Taxes tab (CRUD with create/edit dialog)

Files Modified:
- settings-view.tsx — rewritten as slim 76-line tab compositor
