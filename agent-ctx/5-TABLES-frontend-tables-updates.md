---
Task ID: 5-TABLES
Agent: frontend-tables-updates
Task: Add discounts, per-item notes, and sounds to Tables view

Work Log:
- Read full existing tables-view.tsx (2122 lines) to understand structure
- Read pos-sounds.ts to verify exports: playCartAdd, playSaleSuccess, playAlert, playError
- Read existing Popover component to confirm controlled open/onOpenChange API
- Added import for playAlert, playSaleSuccess, playError from @/lib/pos-sounds
- Added Popover, PopoverContent, PopoverTrigger imports from @/components/ui/popover
- Added Lucide icons: Percent, Tag, MessageSquare, Pencil, X
- Added `notes?: string | null` to ComandaItem interface
- Added discount state: discountType, discountValue, discountReason
- Added notes state: pendingItemNotes, notesPopoverItemId, notesEditText, savingNotes
- Added playAlert() call on successful comanda item add
- Added playSaleSuccess() call on successful payment
- Added playError() call in all API error catch blocks
- Added handleUpdateItemNotes function (PATCH comanda with notes)
- Modified handleAddItem to include pendingItemNotes in payload
- Modified handleOpenPayment to reset discount state
- Modified handleConfirmPayment to compute discount and include in payload
- Added computedDiscount computed value
- Added discount section to payment dialog (toggle, type select, value input, reason, remove)
- Updated total display to use selectedItemsTotal - computedDiscount + tipAmount
- Added notes badge on comanda items that have notes
- Added pencil/message-square popover button for editing per-item notes
- Added pending notes input in add-to-comanda section

Changes: File went from 2122 lines to 2416 lines (294 lines added).
All existing functionality preserved. No ESLint errors introduced.

Stage Summary:
- Tables view now supports discounts when paying for table items
- Comanda items can have per-item notes set before adding or edited after
- Notification sounds play on key actions
