'use client'

import { useEffect, useState, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { Copy, CheckCircle2, ExternalLink, Shield } from 'lucide-react'

type CopyStatus = 'copying' | 'copied' | 'fallback'

function DianRedirectContent() {
  const searchParams = useSearchParams()
  const cufe = searchParams.get('cufe') ?? ''
  const isTest = searchParams.get('test') === 'true'

  const [copyStatus, setCopyStatus] = useState<CopyStatus>('copying')
  const [countdown, setCountdown] = useState(3)

  const dianUrl = isTest
    ? 'https://catalogo-vpfe-hab.dian.gov.co/User/SearchDocument'
    : 'https://catalogo-vpfe.dian.gov.co/User/SearchDocument'

  // Auto-copy CUFE on mount (only fires when cufe is non-empty)
  useEffect(() => {
    let cancelled = false
    if (!cufe) return
    navigator.clipboard.writeText(cufe).then(
      () => { if (!cancelled) setCopyStatus('copied') },
      () => { if (!cancelled) setCopyStatus('fallback') },
    )
    return () => { cancelled = true }
  }, [cufe])

  const copyCUFE = useCallback(async () => {
    if (!cufe) return
    try {
      await navigator.clipboard.writeText(cufe)
      setCopyStatus('copied')
    } catch {
      setCopyStatus('fallback')
    }
  }, [cufe])

  const handleCopyAndRedirect = useCallback(async () => {
    if (!cufe) return
    await copyCUFE()
    window.location.href = dianUrl
  }, [cufe, copyCUFE, dianUrl])

  // Auto-redirect countdown after successful copy
  useEffect(() => {
    if (copyStatus !== 'copied') return

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer)
          window.location.href = dianUrl
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [copyStatus, dianUrl])

  if (!cufe) {
    return (
      <main className="min-h-screen bg-white flex items-center justify-center p-4">
        <div className="text-center max-w-md w-full">
          <div className="mb-6 flex justify-center">
            <div className="h-16 w-16 rounded-full bg-red-50 flex items-center justify-center">
              <Shield className="h-8 w-8 text-red-500" />
            </div>
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">
            Refugio / VENTIFY
          </h1>
          <h2 className="text-lg font-semibold text-gray-700 mb-4">
            Validaci\u00f3n de Factura Electr\u00f3nica
          </h2>
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
            <p className="text-amber-800 text-sm">
              No se encontr\u00f3 un c\u00f3digo CUFE/CUDE en la URL.
              Verifica que el c\u00f3digo QR sea correcto e intenta de nuevo.
            </p>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-white flex items-center justify-center p-4">
      <div className="text-center max-w-md w-full">
        {/* Branding */}
        <div className="mb-6 flex justify-center">
          <div className="h-16 w-16 rounded-full bg-emerald-50 flex items-center justify-center">
            <Shield className="h-8 w-8 text-emerald-600" />
          </div>
        </div>
        <h1 className="text-xl font-bold text-gray-900 mb-1">
          Refugio / VENTIFY
        </h1>
        <p className="text-sm text-gray-500 mb-6">
          Validaci\u00f3n de Factura Electr\u00f3nica DIAN
        </p>

        {/* Status Messages */}
        <div className="mb-6 space-y-3">
          {copyStatus === 'copying' && (
            <div className="flex items-center justify-center gap-2 text-gray-600">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-emerald-600" />
              <span className="text-sm">Copiando CUFE...</span>
            </div>
          )}

          {copyStatus === 'copied' && (
            <div className="flex items-center justify-center gap-2 text-emerald-600">
              <CheckCircle2 className="h-5 w-5" />
              <span className="text-sm font-medium">
                \u00a1CUFE copiado! Redirigiendo a la DIAN...
              </span>
            </div>
          )}

          {copyStatus === 'fallback' && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <p className="text-amber-800 text-sm font-medium mb-1">
                Selecciona y copia el CUFE manualmente
              </p>
              <p className="text-amber-700 text-xs">
                Tu navegador no permite copiar autom\u00e1ticamente. Selecciona el texto y c\u00f3pialo.
              </p>
            </div>
          )}
        </div>

        {/* CUFE Display */}
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-6">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
            CUFE / CUDE
          </p>
          <p className="font-mono text-xs sm:text-sm text-gray-900 break-all leading-relaxed select-all cursor-text">
            {cufe}
          </p>
        </div>

        {/* Countdown (visible when copied) */}
        {copyStatus === 'copied' && (
          <p className="text-xs text-gray-400 mb-4">
            Redirigiendo en {countdown} segundo{countdown !== 1 ? 's' : ''}...
          </p>
        )}

        {/* Action Button */}
        <button
          onClick={handleCopyAndRedirect}
          className="inline-flex items-center justify-center gap-2 w-full rounded-lg bg-emerald-600 px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 active:bg-emerald-800 transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
        >
          <Copy className="h-4 w-4" />
          <span>Copiar y Buscar en DIAN</span>
          <ExternalLink className="h-4 w-4" />
        </button>

        {/* Direct Link */}
        <div className="mt-4">
          <a
            href={dianUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-emerald-600 transition-colors"
          >
            <ExternalLink className="h-3 w-3" />
            <span>
              Abrir portal DIAN{' '}
              {isTest && (
                <span className="text-amber-600 font-medium">(habilitaci\u00f3n)</span>
              )}
            </span>
          </a>
        </div>
      </div>
    </main>
  )
}

export default function DianRedirectPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-white flex items-center justify-center p-4">
          <div className="text-center">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-gray-300 border-t-emerald-600 mx-auto mb-4" />
            <p className="text-sm text-gray-500">Cargando...</p>
          </div>
        </main>
      }
    >
      <DianRedirectContent />
    </Suspense>
  )
}
