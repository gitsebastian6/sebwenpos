import * as Sentry from '@sentry/nextjs'

Sentry.init({
  // DSN is set via SENTRY_DSN environment variable
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Performance monitoring — sample 10% of transactions in production
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

  // Session replay — sample 10% of sessions in production
  replaysSessionSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

  // Replay on error — always record when an error occurs
  replaysOnErrorSampleRate: 1.0,

  // Enable browser tracing
  // @ts-expect-error — enableBrowserTracing exists in runtime but not in Sentry v9 types
  enableBrowserTracing: true,

  // Disable in development (Sentry still captures but doesn't send)
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Debug mode (only in dev, helps troubleshoot Sentry itself)
  debug: false,

  // Integrations
  integrations: [
    Sentry.replayIntegration({
      // Don't record sensitive inputs
      maskAllText: true,
      blockAllMedia: true,
    }),
  ],

  // Filter out noisy errors
  beforeSend(event) {
    // Ignore errors from browser extensions
    if (event.exception?.values?.[0]?.stacktrace?.frames?.some(
      frame => frame.filename && !frame.filename.startsWith('http')
    )) {
      return null
    }

    // Ignore network errors that are user's connection issues
    if (event.message?.includes('NetworkError') || event.message?.includes('Failed to fetch')) {
      return null
    }

    return event
  },

  // Environment tag
  environment: process.env.NODE_ENV || 'development',

  // Release version (auto-detected from git)
  release: process.env.NEXT_PUBLIC_SENTRY_RELEASE || undefined,
})
