// ---------------------------------------------------------------------------
// Global test setup — runs before every test file
// ---------------------------------------------------------------------------

import { vi } from 'vitest'

// ── Force development mode for all tests ──────────────────────────────────
// This is critical: when NODE_ENV=production, React bundles the production
// build which lacks React.act(), breaking @testing-library/react's renderHook.
// CI pipelines set NODE_ENV=production for the build step, but tests must
// always run in development mode to access React's test utilities.
// @ts-expect-error — NODE_ENV is read-only but we must override for tests
process.env.NODE_ENV = 'development'

// Silence React 19 act() warnings in test output (expected with renderHook)
const originalError = console.error
console.error = (...args: unknown[]) => {
  if (typeof args[0] === 'string' && args[0].includes('act(')) return
  originalError.call(console, ...args)
}

// Polyfill TextEncoder / TextDecoder for jsdom (needed by some internals)
if (typeof globalThis.TextEncoder === 'undefined') {
  const { TextEncoder, TextDecoder } = await import('util')
  globalThis.TextEncoder = TextEncoder
  globalThis.TextDecoder = TextDecoder as any
}
