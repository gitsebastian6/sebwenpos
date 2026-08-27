'use client'

/**
 * Barcode scanner UI — reusable across the app.
 * ─────────────────────────────────────────────
 * <ScanButton />          → camera icon + "Escanear" label, drop next to any product search input.
 * <BarcodeScannerDialog/> → full-screen overlay with live camera view.
 *
 * Deliberately NOT a Radix Dialog: it is designed to open on top of other
 * dialogs (quotation/purchase forms) without nested focus-trap or z-index
 * conflicts. It uses a plain fixed overlay with a very high z-index.
 */

import { Camera, X } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useCameraScanner, type CameraScannerState } from '@/hooks/use-camera-scanner'

// ─── ScanButton ──────────────────────────────────────────────────────────────

export function ScanButton({
  onClick,
  label = 'Escanear',
  size = 'default',
}: {
  onClick: () => void
  label?: string
  /** 'default' = icon + text below; 'compact' = small inline button */
  size?: 'default' | 'compact'
}) {
  if (size === 'compact') {
    return (
      <button
        type="button"
        aria-label={label}
        onClick={onClick}
        className="inline-flex items-center justify-center h-8 w-8 rounded-md border border-input bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
      >
        <Camera className="h-3.5 w-3.5" />
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center justify-center gap-0.5 h-11 w-14 shrink-0 rounded-lg border border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 active:scale-95 transition-all"
      aria-label={`Abrir cámara para ${label}`}
    >
      <Camera className="h-5 w-5" />
      <span className="text-[10px] font-medium leading-none">Escanear</span>
    </button>
  )
}

// ─── Error/state messages ────────────────────────────────────────────────────

const STATE_MESSAGES: Record<Exclude<CameraScannerState, 'idle' | 'scanning'>, { title: string; hint: string }> = {
  starting: { title: 'Abriendo cámara...', hint: 'Permite el acceso si el navegador lo solicita.' },
  'permission-denied': {
    title: 'Permiso de cámara denegado',
    hint: 'Toca el ícono 🔒 o ⓘ junto a la dirección en tu navegador, habilita la cámara y vuelve a intentar.',
  },
  'not-secure': {
    title: 'Conexión no segura',
    hint: 'La cámara solo funciona sobre HTTPS. Abre la app con la dirección https:// de tu negocio.',
  },
  'no-camera': { title: 'No se encontró cámara', hint: 'Este dispositivo no tiene una cámara disponible.' },
  'camera-busy': {
    title: 'Cámara ocupada',
    hint: 'Otra aplicación está usando la cámara. Ciérrala e intenta de nuevo.',
  },
  unsupported: { title: 'Navegador no compatible', hint: 'Actualiza tu navegador para poder escanear códigos.' },
  error: { title: 'Error al iniciar el escáner', hint: 'Algo falló al abrir la cámara. Intenta de nuevo.' },
}

// ─── BarcodeScannerDialog ────────────────────────────────────────────────────

export function BarcodeScannerDialog({
  open,
  onClose,
  onScan,
}: {
  open: boolean
  onClose: () => void
  onScan: (code: string) => void
}) {
  const [flash, setFlash] = useState<'success' | null>(null)
  const handleDetected = useCallback(
    (code: string) => {
      setFlash('success')
      onScan(code)
      // Brief visual confirmation before closing
      setTimeout(() => {
        setFlash(null)
        onClose()
      }, 350)
    },
    [onScan, onClose]
  )

  const { state, videoRef } = useCameraScanner({ active: open, onScan: handleDetected })

  // Close on Escape
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const message = state in STATE_MESSAGES ? STATE_MESSAGES[state as keyof typeof STATE_MESSAGES] : null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Escáner de código de barras"
      className="fixed inset-0 z-[9999] flex flex-col bg-black/95 backdrop-blur-sm"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <p className="text-sm font-medium text-white/90">Apunta la cámara al código de barras</p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar escáner"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Viewport */}
      <div className="relative flex-1 min-h-0 mx-auto w-full max-w-lg px-4 pb-4">
        <div className="relative h-full w-full overflow-hidden rounded-xl bg-black">
          <video
            ref={videoRef}
            muted
            autoPlay
            playsInline
            className={`h-full w-full object-cover transition-opacity duration-300 ${
              state === 'scanning' ? 'opacity-100' : 'opacity-30'
            }`}
          />

          {/* Frame guide + scanline animation */}
          {state === 'scanning' && (
            <>
              <style>{`
                @keyframes barcode-scanline { 0%,100% { top: calc(50% - 4.6rem); } 50% { top: calc(50% + 4.6rem); } }
              `}</style>
              <div
                className={`pointer-events-none absolute left-1/2 top-1/2 h-40 w-[75%] -translate-x-1/2 -translate-y-1/2 rounded-xl border-2 transition-colors ${
                  flash ? 'border-emerald-400' : 'border-white/70'
                }`}
              />
              <div
                className="pointer-events-none absolute left-[15%] right-[15%] h-0.5 bg-emerald-400/80 shadow-[0_0_12px_rgba(52,211,153,0.9)]"
                style={{ animation: 'barcode-scanline 1.8s ease-in-out infinite', top: 'calc(50% - 4.6rem)' }}
              />
            </>
          )}

          {/* State overlay */}
          {message && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-8 text-center">
              <span className="text-3xl">📷</span>
              <p className="text-base font-semibold text-white">{message.title}</p>
              <p className="text-sm text-white/70">{message.hint}</p>
            </div>
          )}

          {/* Starting spinner */}
          {state === 'starting' && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            </div>
          )}

          {/* Success flash */}
          {flash && (
            <div className="absolute inset-0 flex items-center justify-center bg-emerald-500/25">
              <span className="rounded-full bg-emerald-500 px-4 py-2 text-sm font-semibold text-white shadow-lg">
                ✓ Código leído
              </span>
            </div>
          )}
        </div>

        <p className="mt-3 text-center text-xs text-white/50">
          Funciona con EAN-13, EAN-8, UPC, Code 128 y Code 39
        </p>
      </div>
    </div>
  )
}

// ─── Hook-style helper for views ─────────────────────────────────────────────

/**
 * Convenience hook: returns [scannerOpen, openScanner, closeScanner] plus a
 * pre-wired scanner UI (button + dialog). Views only provide `onScan`.
 */
export function useBarcodeScannerDialog(onScan: (code: string) => void) {
  const [open, setOpen] = useState(false)

  const scannerUi = (
    <>
      <ScanButton onClick={() => setOpen(true)} />
      <BarcodeScannerDialog open={open} onClose={() => setOpen(false)} onScan={onScan} />
    </>
  )

  return {
    open,
    openScanner: () => setOpen(true),
    closeScanner: () => setOpen(false),
    scannerUi,
  }
}




