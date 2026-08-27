export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Fail fast on a misconfigured production deploy instead of 500-ing later.
    const { assertRequiredEnv } = await import('./src/lib/env')
    assertRequiredEnv()

    await import('./sentry.server.config')
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config')
  }
}
