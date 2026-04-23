'use client'

import * as Sentry from '@sentry/nextjs'
import { useEffect } from 'react'
import { AlertTriangle, RefreshCcw } from 'lucide-react'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <html lang="es">
      <body className="min-h-screen flex items-center justify-center bg-background text-foreground">
        <div className="max-w-md w-full text-center space-y-6 p-6">
          {/* Icon */}
          <div className="mx-auto h-16 w-16 rounded-full bg-red-500/10 flex items-center justify-center">
            <AlertTriangle className="h-8 w-8 text-red-500" />
          </div>

          {/* Title */}
          <div className="space-y-2">
            <h1 className="text-xl font-bold">
              Error inesperado
            </h1>
            <p className="text-sm text-muted-foreground">
              Ocurrió un error crítico en la aplicación. Hemos notificado al equipo técnico.
              Puedes intentar recargar la página.
            </p>
          </div>

          {/* Error detail */}
          {error?.message && process.env.NODE_ENV === 'development' && (
            <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-3 text-left">
              <p className="text-xs font-mono text-red-600 dark:text-red-400 break-all">
                {error.message}
              </p>
            </div>
          )}

          {/* Actions */}
          <button
            onClick={reset}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <RefreshCcw className="h-4 w-4" />
            Recargar página
          </button>
        </div>
      </body>
    </html>
  )
}
