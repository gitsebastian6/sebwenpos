'use client'

/**
 * useCameraScanner
 * ────────────────
 * Camera-based barcode scanning hook with a hybrid strategy:
 *
 * 1. Native `BarcodeDetector` API (Chrome/Android) — zero extra bundle weight.
 * 2. Fallback to `@zxing/library` (iOS Safari & browsers without native
 *    support), loaded via dynamic import so it never inflates the initial
 *    bundle.
 *
 * Edge cases handled:
 * - Insecure context (HTTP): getUserMedia is unavailable → 'not-secure'.
 * - Permission denied by the user → 'permission-denied'.
 * - No camera hardware / no video tracks → 'no-camera'.
 * - Camera held by another app (NotReadableError) → 'camera-busy'.
 * - Stream lifecycle: all tracks are stopped on close/unmount so the camera
 *   light always turns off.
 * - Duplicate reads: same code ignored for DUPLICATE_WINDOW_MS; codes must be
 *   read twice consecutively before being accepted (kills partial false
 *   positives).
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { isAcceptableScan } from '@/lib/barcode-validate'

export type CameraScannerState =
  | 'idle'
  | 'starting'
  | 'scanning'
  | 'permission-denied'
  | 'not-secure'
  | 'no-camera'
  | 'camera-busy'
  | 'unsupported'
  | 'error'

interface UseCameraScannerOptions {
  /** Called once per accepted scan. */
  onScan: (code: string) => void
  /** When true the camera starts; when false everything shuts down. */
  active: boolean
  /** Minimum length for non-GTIN codes (default 4). */
  minLength?: number
}

const DUPLICATE_WINDOW_MS = 1500
const REQUIRED_CONSECUTIVE_READS = 2
const DETECT_INTERVAL_MS = 120

export function useCameraScanner({ onScan, active, minLength = 4 }: UseCameraScannerOptions) {
  const [state, setState] = useState<CameraScannerState>('idle')

  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const zxingReaderRef = useRef<{ reset: () => void } | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const detectorRef = useRef<{ detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue: string }>> } | null>(null)

  // Dedupe / validation refs (kept in refs to avoid re-binding effects)
  const lastAcceptedRef = useRef<{ code: string; time: number }>({ code: '', time: 0 })
  const candidateRef = useRef<{ code: string; count: number }>({ code: '', count: 0 })
  const onScanRef = useRef(onScan)
  const minLengthRef = useRef(minLength)

  useEffect(() => { onScanRef.current = onScan }, [onScan])
  useEffect(() => { minLengthRef.current = minLength }, [minLength])

  const stopEverything = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    if (zxingReaderRef.current) {
      try { zxingReaderRef.current.reset() } catch { /* noop */ }
      zxingReaderRef.current = null
    }
    detectorRef.current = null
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
    candidateRef.current = { code: '', count: 0 }
  }, [])

  /** Validate + require consecutive identical reads + dedupe + emit. */
  const acceptCandidate = useCallback((raw: string) => {
    const code = raw.trim()
    if (!isAcceptableScan(code, minLengthRef.current)) return

    const now = Date.now()
    const candidate = candidateRef.current
    if (candidate.code === code) {
      candidate.count += 1
    } else {
      candidateRef.current = { code, count: 1 }
      return
    }
    if (candidate.count < REQUIRED_CONSECUTIVE_READS) return

    candidateRef.current = { code: '', count: 0 }
    if (lastAcceptedRef.current.code === code && now - lastAcceptedRef.current.time < DUPLICATE_WINDOW_MS) return

    lastAcceptedRef.current = { code, time: now }

    try { navigator.vibrate?.(60) } catch { /* noop */ }
    onScanRef.current(code)
  }, [])

  useEffect(() => {
    if (!active) {
      stopEverything()
      setState('idle')
      return
    }

    let cancelled = false

    async function start() {
      setState('starting')

      // Secure context check — getUserMedia only works over HTTPS/localhost
      if (typeof window !== 'undefined' && !window.isSecureContext) {
        setState('not-secure')
        return
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        setState('unsupported')
        return
      }

      let stream: MediaStream
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        })
      } catch (err) {
        if (cancelled) return
        const name = (err as DOMException)?.name
        if (name === 'NotAllowedError' || name === 'SecurityError') setState('permission-denied')
        else if (name === 'NotFoundError' || name === 'OverconstrainedError') setState('no-camera')
        else if (name === 'NotReadableError' || name === 'AbortError') setState('camera-busy')
        else setState('error')
        return
      }

      if (cancelled) {
        stream.getTracks().forEach((t) => t.stop())
        return
      }
      streamRef.current = stream

      const video = videoRef.current
      if (!video) {
        stream.getTracks().forEach((t) => t.stop())
        return
      }
      video.srcObject = stream
      video.setAttribute('playsinline', 'true') // iOS Safari requirement
      try { await video.play() } catch { /* playback may resume later */ }

      setState('scanning')

      // ── Strategy 1: native BarcodeDetector (Chrome/Android) ─────────
      const BarcodeDetectorCtor = (globalThis as Record<string, unknown>).BarcodeDetector as
        | (new (options?: { formats?: string[] }) => { detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue: string }>> })
        | undefined

      if (BarcodeDetectorCtor) {
        try {
          detectorRef.current = new BarcodeDetectorCtor({
            formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf'],
          })
        } catch {
          detectorRef.current = null
        }

        if (detectorRef.current) {
          intervalRef.current = setInterval(async () => {
            const v = videoRef.current
            const detector = detectorRef.current
            if (!v || !detector || v.readyState < 2) return
            try {
              const results = await detector.detect(v)
              if (results.length > 0) acceptCandidate(results[0].rawValue)
            } catch { // transient decode errors are normal while focusing
              /* noop */
            }
          }, DETECT_INTERVAL_MS)
          return
        }
      }

      // ── Strategy 2: ZXing fallback (iOS Safari, etc.) ───────────────
      try {
        const { BrowserMultiFormatReader } = await import('@zxing/library')
        if (cancelled) return
        const reader = new BrowserMultiFormatReader(undefined, DETECT_INTERVAL_MS)
        zxingReaderRef.current = reader
        await reader.decodeFromStream(stream, video, (result) => {
          if (result) acceptCandidate(result.getText())
        })
      } catch (err) {
        if (cancelled) return
        console.error('[use-camera-scanner] ZXing fallback failed:', err)
        stopEverything()
        setState('error')
      }
    }

    start()

    // Stop the camera when the tab/app goes to background
    function handleVisibility() {
      if (document.hidden) {
        stopEverything()
        setState('idle')
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', handleVisibility)
      stopEverything()
    }
  }, [active, acceptCandidate, stopEverything])

  return { state, videoRef }
}



