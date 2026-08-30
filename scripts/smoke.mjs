#!/usr/bin/env node
/**
 * Smoke test: arranca la app compilada y hace GET a las rutas reales.
 *
 * Por qué existe: `tsc` + `vitest` no empaquetan la app. Un import roto dentro de
 * un client component (p.ej. un named export inexistente) pasa esos gates y solo
 * revienta al compilar/renderizar. `next build` (que `verify` corre justo antes)
 * ya falla ante eso; este script es la red secundaria para errores que solo
 * aparecen al renderizar una ruta.
 *
 * Uso:
 *   node scripts/smoke.mjs            # asume que `.next` ya está compilado
 *   SMOKE_PORT=3222 node scripts/smoke.mjs
 *   SMOKE_SKIP_BUILD=1 node scripts/smoke.mjs
 */

import { spawn, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'
import process from 'node:process'

const PORT = Number(process.env.SMOKE_PORT || 3111)
const HOST = '127.0.0.1'
const BASE = `http://${HOST}:${PORT}`
const READY_TIMEOUT_MS = 90_000
const IS_WIN = process.platform === 'win32'

// Marcadores de un fallo de build/módulo en el HTML de una página de error de Next.
const ERROR_MARKERS = [
  /doesn't exist in target module/i,
  /export .* was not found in module/i,
  /Module not found/i,
  /Cannot find module/i,
  /Can't resolve/i,
  /Failed to compile/i,
  /__NEXT_ERROR__|nextjs__container_errors/i,
  /Application error: a (server|client)-side exception/i,
]

// status -> ¿aceptable? ; y además se escanea el body en busca de ERROR_MARKERS.
const CHECKS = [
  { path: '/api/health', ok: (s) => s === 200 || s === 503, scanBody: false },
  { path: '/', ok: (s) => s < 500, scanBody: true },
  { path: '/dian-redirect', ok: (s) => s < 500, scanBody: true },
  { path: '/tienda/__smoke__', ok: (s) => s !== 500, scanBody: true },
]

function log(...a) { console.log('[smoke]', ...a) }
function fail(...a) { console.error('[smoke] ✗', ...a) }

function ensureBuild() {
  if (process.env.SMOKE_SKIP_BUILD === '1') return
  if (existsSync('.next/BUILD_ID')) return
  log('no hay .next/BUILD_ID — corriendo `next build`…')
  const r = spawnSync('npx', ['next', 'build'], { stdio: 'inherit', shell: IS_WIN })
  if (r.status !== 0) { fail('next build falló'); process.exit(1) }
}

function startServer() {
  const env = {
    ...process.env,
    NODE_ENV: 'production',
    // Placeholders para que módulos de ruta que leen env al importar no exploten.
    AUTH_SECRET: process.env.AUTH_SECRET || 'smoke-placeholder-secret-value-0000000000',
    INTERNAL_SECRET: process.env.INTERNAL_SECRET || 'smoke-placeholder-internal-000000000000',
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || BASE,
    SMTP_FROM: process.env.SMTP_FROM || 'smoke@example.com',
    ALERT_API_BASE: process.env.ALERT_API_BASE || 'http://localhost',
    DATABASE_URL: process.env.DATABASE_URL || 'postgresql://placeholder:placeholder@127.0.0.1:5432/placeholder',
    DIRECT_URL: process.env.DIRECT_URL || process.env.DATABASE_URL || 'postgresql://placeholder:placeholder@127.0.0.1:5432/placeholder',
    // Smoke runs with NODE_ENV=production; give the production env guard
    // (instrumentation.ts → assertRequiredEnv) a valid Wompi mode so it does
    // not abort server startup. No Wompi call is exercised by the smoke routes.
    WOMPI_ENV: process.env.WOMPI_ENV || 'sandbox',
    NEXT_TELEMETRY_DISABLED: '1',
  }
  const child = spawn('npx', ['next', 'start', '-p', String(PORT), '-H', HOST], {
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: IS_WIN,
    detached: !IS_WIN,
  })
  let out = ''
  child.stdout.on('data', (d) => { out += d; process.stdout.write(d) })
  child.stderr.on('data', (d) => { out += d; process.stderr.write(d) })
  child.on('exit', (code) => { child._exited = true; child._exitCode = code })
  child._getOutput = () => out
  return child
}

function killServer(child) {
  if (!child || child._exited) return
  try {
    if (IS_WIN) spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
    else process.kill(-child.pid, 'SIGKILL')
  } catch { /* ya muerto */ }
}

async function waitReady(child) {
  const deadline = Date.now() + READY_TIMEOUT_MS
  while (Date.now() < deadline) {
    if (child._exited) throw new Error(`el servidor murió antes de responder (exit ${child._exitCode})`)
    try {
      const res = await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(3000) })
      if (res.status > 0) return
    } catch { /* aún arrancando */ }
    await sleep(1000)
  }
  throw new Error(`el servidor no respondió en ${READY_TIMEOUT_MS / 1000}s`)
}

async function runChecks() {
  const failures = []
  for (const c of CHECKS) {
    let status = 0
    let body = ''
    try {
      const res = await fetch(`${BASE}${c.path}`, { signal: AbortSignal.timeout(15_000), redirect: 'manual' })
      status = res.status
      if (c.scanBody) body = await res.text()
    } catch (e) {
      failures.push(`${c.path} — la petición falló: ${e.message}`)
      continue
    }
    if (!c.ok(status)) {
      failures.push(`${c.path} — status ${status} no aceptable`)
    }
    const marker = ERROR_MARKERS.find((re) => re.test(body))
    if (marker) {
      failures.push(`${c.path} — el HTML contiene un error de build/módulo: ${marker}`)
    }
    if (!failures.some((f) => f.startsWith(c.path))) log(`✓ ${c.path} (${status})`)
  }
  return failures
}

async function main() {
  ensureBuild()
  log(`arrancando next start en ${BASE} …`)
  const child = startServer()
  let failures = []
  try {
    await waitReady(child)
    log('servidor listo — corriendo checks')
    failures = await runChecks()
  } catch (e) {
    failures.push(String(e.message || e))
  } finally {
    killServer(child)
  }
  if (failures.length) {
    fail(`${failures.length} problema(s):`)
    for (const f of failures) fail('  - ' + f)
    process.exit(1)
  }
  log('OK — todas las rutas responden sin errores de build')
}

main().catch((e) => { fail(e); process.exit(1) })
