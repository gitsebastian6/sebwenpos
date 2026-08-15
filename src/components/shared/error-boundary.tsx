'use client'

import React from 'react'
import * as Sentry from '@sentry/nextjs'
import { Button } from '@/components/ui/button'
import { AlertTriangle, RefreshCcw, ArrowLeft, Home } from 'lucide-react'

interface ErrorBoundaryProps {
  children: React.ReactNode
  /** Optional label for context (e.g. "Dashboard", "POS") */
  viewName?: string
  /** If true, shows a compact inline error instead of full-page */
  inline?: boolean
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
  errorInfo: React.ErrorInfo | null
}

/**
 * React Error Boundary — catches rendering errors in child components.
 * Two modes:
 *   - Full-page (layout): shows a full-screen recovery UI
 *   - Inline (per-view): shows a compact error card within the sidebar layout
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null, errorInfo: null }
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.setState({ errorInfo })
    // Send to Sentry in production for error monitoring
    Sentry.withScope((scope) => {
      if (this.props.viewName) scope.setTag('view', this.props.viewName)
      scope.setExtra('componentStack', errorInfo.componentStack)
      Sentry.captureException(error)
    })
    // Also log locally for dev debugging
    console.error(
      `[ErrorBoundary${this.props.viewName ? ` (${this.props.viewName})` : ''}]`,
      error,
      errorInfo.componentStack
    )
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null, errorInfo: null })
  }

  handleGoHome = () => {
    // Try to navigate to dashboard by dispatching a view change via custom event
    // (avoids circular imports with the app store)
    try {
      window.dispatchEvent(new CustomEvent('viva:navigate', { detail: 'dashboard' }))
    } catch {
      // If event fails, just retry
    }
    this.handleRetry()
  }

  render() {
    if (this.state.hasError) {
      if (this.props.inline) {
        return this.renderInlineError()
      }
      return this.renderFullPageError()
    }

    return this.props.children
  }

  renderFullPageError() {
    const { error } = this.state
    const { viewName } = this.props
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="max-w-md w-full text-center space-y-6">
          {/* Icon */}
          <div className="mx-auto h-16 w-16 rounded-full bg-red-500/10 flex items-center justify-center">
            <AlertTriangle className="h-8 w-8 text-red-500" />
          </div>

          {/* Title */}
          <div className="space-y-2">
            <h1 className="text-xl font-bold text-foreground">
              {viewName ? `Error en ${viewName}` : 'Algo salió mal'}
            </h1>
            <p className="text-sm text-muted-foreground">
              Ocurrió un error inesperado al cargar esta sección. Puedes intentar nuevamente o volver al inicio.
            </p>
          </div>

          {/* Error detail (dev only) */}
          {error?.message && (
            <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-3 text-left">
              <p className="text-xs font-mono text-red-600 dark:text-red-400 break-all">
                {error.message}
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button onClick={this.handleRetry} variant="outline" className="gap-2">
              <RefreshCcw className="h-4 w-4" />
              Intentar de nuevo
            </Button>
            {viewName && (
              <Button onClick={this.handleGoHome} className="gap-2">
                <Home className="h-4 w-4" />
                Ir al Dashboard
              </Button>
            )}
          </div>
        </div>
      </div>
    )
  }

  renderInlineError() {
    const { error } = this.state
    const { viewName } = this.props
    return (
      <div className="flex items-center justify-center p-8 min-h-[300px]">
        <div className="max-w-sm w-full text-center space-y-4">
          {/* Icon */}
          <div className="mx-auto h-12 w-12 rounded-full bg-red-500/10 flex items-center justify-center">
            <AlertTriangle className="h-6 w-6 text-red-500" />
          </div>

          {/* Title */}
          <div className="space-y-1.5">
            <h3 className="text-base font-semibold text-foreground">
              Error al cargar{viewName ? ` ${viewName}` : ''}
            </h3>
            <p className="text-xs text-muted-foreground">
              {error?.message || 'Ocurrió un error inesperado.'}
            </p>
          </div>

          {/* Actions */}
          <div className="flex gap-2 justify-center">
            <Button onClick={this.handleRetry} variant="outline" size="sm" className="gap-1.5 text-xs">
              <RefreshCcw className="h-3.5 w-3.5" />
              Reintentar
            </Button>
            <Button onClick={this.handleGoHome} variant="ghost" size="sm" className="gap-1.5 text-xs">
              <Home className="h-3.5 w-3.5" />
              Dashboard
            </Button>
          </div>
        </div>
      </div>
    )
  }
}

/**
 * View-level Error Boundary wrapper — used per-view for inline error recovery.
 */
export function ViewErrorBoundary({
  children,
  viewName,
}: {
  children: React.ReactNode
  viewName: string
}) {
  return (
    <ErrorBoundary viewName={viewName} inline>
      {children}
    </ErrorBoundary>
  )
}
