'use client'

import { useEffect, useRef, useCallback } from 'react'

interface UseBarcodeScannerOptions {
  onScan: (barcode: string) => void
  enabled?: boolean
  minLength?: number
  maxInterval?: number // ms between keypresses
}

export function useBarcodeScanner({
  onScan,
  enabled = true,
  minLength = 4,
  maxInterval = 100,
}: UseBarcodeScannerOptions) {
  const bufferRef = useRef<string>('')
  const lastKeyTimeRef = useRef<number>(0)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearBuffer = useCallback(() => {
    bufferRef.current = ''
    lastKeyTimeRef.current = 0
  }, [])

  useEffect(() => {
    if (!enabled) return

    function handleKeyDown(e: KeyboardEvent) {
      // Ignore if user is typing in an input/textarea (unless it's our barcode input)
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') {
        // Allow scanning from a dedicated barcode input
        if (!target.getAttribute('data-barcode-input')) {
          return
        }
      }

      const now = Date.now()

      if (e.key === 'Enter') {
        const barcode = bufferRef.current.trim()
        if (barcode.length >= minLength) {
          onScan(barcode)
          clearBuffer()
        }
        bufferRef.current = ''
        if (timeoutRef.current) clearTimeout(timeoutRef.current)
        return
      }

      // Only accept printable characters
      if (e.key.length === 1) {
        const timeDiff = now - lastKeyTimeRef.current

        if (timeDiff > maxInterval && bufferRef.current.length > 0) {
          // Too slow, reset buffer (probably manual typing)
          bufferRef.current = e.key
        } else {
          bufferRef.current += e.key
        }

        lastKeyTimeRef.current = now

        // Clear buffer after 500ms of no input
        if (timeoutRef.current) clearTimeout(timeoutRef.current)
        timeoutRef.current = setTimeout(() => {
          bufferRef.current = ''
        }, 500)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [enabled, minLength, maxInterval, onScan, clearBuffer])

  return { clearBuffer }
}
