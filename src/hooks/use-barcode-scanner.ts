'use client'

import { useEffect, useRef, useCallback } from 'react'

interface UseBarcodeScannerOptions {
  onScan: (barcode: string) => void
  enabled?: boolean
  minLength?: number
  maxInterval?: number // ms between keypresses
}

// ─── Shared global listener ──────────────────────────────────────────────────
// A USB/Bluetooth barcode gun behaves like a keyboard that types very fast and
// presses Enter. We keep a SINGLE window keydown listener for the whole app and
// a stack of registered consumers; only the top-most enabled consumer receives
// a scan. This prevents a page-level scanner and a scanner inside a dialog
// opened on top of it from both firing (double add).

interface Registration {
  onScan: (barcode: string) => void
  minLength: number
  maxInterval: number
}

const registrations: Registration[] = []
let bufferState = { value: '', lastKeyTime: 0 }
let flushTimeout: ReturnType<typeof setTimeout> | null = null
let listenerAttached = false

function activeRegistration(): Registration | null {
  return registrations.length > 0 ? registrations[registrations.length - 1] : null
}

function handleKeyDown(e: KeyboardEvent) {
  const reg = activeRegistration()
  if (!reg) return

  // Ignore typing in inputs/areas unless it's a dedicated barcode input.
  const target = e.target as HTMLElement
  if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) {
    if (!target.getAttribute('data-barcode-input')) return
  }

  const now = Date.now()

  if (e.key === 'Enter') {
    const barcode = bufferState.value.trim()
    bufferState = { value: '', lastKeyTime: 0 }
    if (flushTimeout) clearTimeout(flushTimeout)
    if (barcode.length >= reg.minLength) reg.onScan(barcode)
    return
  }

  // Only printable single characters extend the buffer.
  if (e.key.length === 1) {
    const timeDiff = now - bufferState.lastKeyTime
    if (timeDiff > reg.maxInterval && bufferState.value.length > 0) {
      // Too slow — likely manual typing, start over.
      bufferState.value = e.key
    } else {
      bufferState.value += e.key
    }
    bufferState.lastKeyTime = now

    if (flushTimeout) clearTimeout(flushTimeout)
    flushTimeout = setTimeout(() => {
      bufferState = { value: '', lastKeyTime: 0 }
    }, 500)
  }
}

function ensureListener() {
  if (listenerAttached || typeof window === 'undefined') return
  window.addEventListener('keydown', handleKeyDown)
  listenerAttached = true
}

export function useBarcodeScanner({
  onScan,
  enabled = true,
  minLength = 4,
  maxInterval = 100,
}: UseBarcodeScannerOptions) {
  // Keep the latest onScan without re-registering on every render.
  const onScanRef = useRef(onScan)
  useEffect(() => { onScanRef.current = onScan }, [onScan])

  const clearBuffer = useCallback(() => {
    bufferState = { value: '', lastKeyTime: 0 }
  }, [])

  useEffect(() => {
    if (!enabled) return

    const reg: Registration = {
      onScan: (code) => onScanRef.current(code),
      minLength,
      maxInterval,
    }
    registrations.push(reg)
    ensureListener()

    return () => {
      const i = registrations.indexOf(reg)
      if (i !== -1) registrations.splice(i, 1)
    }
  }, [enabled, minLength, maxInterval])

  return { clearBuffer }
}
