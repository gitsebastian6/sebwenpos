'use client'

/**
 * useProductScanner
 * ─────────────────
 * One hook to add barcode scanning to any product picker. It wires BOTH input
 * paths the app supports:
 *
 *   1. USB / Bluetooth barcode gun  → always-on keyboard listener
 *      (via useBarcodeScanner, shared global stack).
 *   2. Phone / laptop camera        → <ScanButton> + <BarcodeScannerDialog>
 *      (via useBarcodeScannerDialog), returned as `scannerUi`.
 *
 * A scan is resolved once, centrally:
 *   - exact barcode/SKU match on a single product/presentation → `onExactMatch`
 *   - no match / ambiguous                                     → `onText`
 *
 * Drop `scannerUi` next to the search <Input>; call sites decide what an exact
 * match does (add to cart, select a row, create a line…).
 */

import { useCallback, useEffect } from 'react'
import { useBarcodeScanner } from '@/hooks/use-barcode-scanner'
import { useBarcodeScannerDialog } from '@/components/shared/barcode-scanner-dialog'
import { resolveScannedCode, type ScannableProduct, type ScanMatch } from '@/lib/product-search'

interface UseProductScannerOptions<P extends ScannableProduct> {
  /** Catalog to resolve scans against. */
  products: P[]
  /** Scanned code maps to exactly one product/presentation. */
  onExactMatch: (match: ScanMatch<P>, code: string) => void
  /** No match or ambiguous — typically `setSearch(code)`. */
  onText: (code: string) => void
  /**
   * Keep the always-on keyboard/USB listener active. Set to the parent
   * dialog/sheet `open` flag so a closed surface never grabs scans. Defaults
   * to true for page-level pickers.
   */
  keyboardEnabled?: boolean
  /** Label for the camera button / dialog. */
  label?: string
  /** Camera button style — see <ScanButton>. */
  size?: 'default' | 'compact'
}

export function useProductScanner<P extends ScannableProduct>({
  products,
  onExactMatch,
  onText,
  keyboardEnabled = true,
  label,
  size,
}: UseProductScannerOptions<P>) {
  const handleScan = useCallback(
    (code: string) => {
      const trimmed = code.trim()
      if (!trimmed) return
      const { exact } = resolveScannedCode(products, trimmed)
      if (exact) onExactMatch(exact, trimmed)
      else onText(trimmed)
    },
    [products, onExactMatch, onText]
  )

  useBarcodeScanner({ onScan: handleScan, enabled: keyboardEnabled })
  const { scannerUi, scanButton, scannerDialog, openScanner, closeScanner, open } =
    useBarcodeScannerDialog(handleScan, { label, size })

  // The camera overlay is portaled to <body>, so it no longer disappears just
  // because its parent dialog/sheet unmounted. When the host surface closes
  // (keyboardEnabled → false), force the camera shut too — otherwise it stays
  // stuck open and reappears on the next open.
  useEffect(() => {
    if (!keyboardEnabled && open) closeScanner()
  }, [keyboardEnabled, open, closeScanner])

  return { scannerUi, scanButton, scannerDialog, openScanner, closeScanner, scannerOpen: open }
}
