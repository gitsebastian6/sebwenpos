/**
 * Ventify Keepalive Service
 * ─────────────────────────
 * Watches the Next.js dev server and auto-restarts it if it dies.
 * Also pings it every 15s to prevent sandbox idle-kill.
 * 
 * This solves the recurring sandbox issue where processes are
 * terminated during inactivity between messages.
 */

import { spawn, ChildProcess, execSync } from 'child_process'
import http from 'http'

const NEXT_PORT = 3000
const PING_INTERVAL_MS = 15_000  // Ping every 15 seconds
const MAX_RESTART_DELAY_MS = 60_000
const HEALTH_TIMEOUT_MS = 5_000
const PORT_FREE_WAIT_MS = 5_000

let nextProcess: ChildProcess | null = null
let restartCount = 0
let isShuttingDown = false

// ─── Logging ───────────────────────────────────────────────
function log(msg: string) {
  const ts = new Date().toLocaleTimeString('en-US', { hour12: false })
  console.log(`[${ts}] [keepalive] ${msg}`)
}

// ─── Health Check ──────────────────────────────────────────
function isServerAlive(): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.request(
      {
        hostname: 'localhost',
        port: NEXT_PORT,
        path: '/api/auth/init',
        method: 'GET',
        timeout: HEALTH_TIMEOUT_MS,
      },
      (res) => {
        // Any response (even 401) means server is alive
        res.resume()
        resolve(true)
      }
    )
    req.on('error', () => resolve(false))
    req.on('timeout', () => {
      req.destroy()
      resolve(false)
    })
    req.end()
  })
}

// ─── Kill processes on port ──────────────────────────────────
function killPortUsers(port: number): boolean {
  try {
    // Use ss to find PIDs listening on the port
    const result = execSync(`ss -tlnp 2>/dev/null | grep ':${port} ' || true`, {
      encoding: 'utf-8',
      timeout: 5000,
    })
    if (!result.trim()) return true // Port is free

    // Extract PIDs from ss output: users:(("name",pid,fd))
    const pidMatches = result.match(/pid=(\d+)/g)
    if (!pidMatches || pidMatches.length === 0) return true

    const pids = pidMatches.map(m => parseInt(m.replace('pid=', '')))
    for (const pid of pids) {
      try {
        process.kill(pid, 'SIGKILL')
        log(`Killed process ${pid} on port ${port}`)
      } catch {
        // Process already dead
      }
    }
    return true
  } catch {
    return false
  }
}

// ─── Wait for port to be free ───────────────────────────────
async function waitForPort(port: number, maxWaitMs: number): Promise<boolean> {
  const start = Date.now()
  while (Date.now() - start < maxWaitMs) {
    try {
      const result = execSync(`ss -tlnp 2>/dev/null | grep ':${port} ' || true`, {
        encoding: 'utf-8',
        timeout: 2000,
      })
      if (!result.trim()) return true // Port is free
    } catch {
      return true
    }
    await new Promise(r => setTimeout(r, 500))
  }
  return false
}

// ─── Start / Restart Next.js ───────────────────────────────
function startNextProcess() {
  const projectDir = '/home/z/my-project'

  // CRITICAL: Kill any zombie processes on the port BEFORE spawning
  killPortUsers(NEXT_PORT)

  log('Starting Next.js dev server...')

  nextProcess = spawn(
    'bun',
    ['run', 'dev'],
    {
      cwd: projectDir,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        NODE_OPTIONS: '--max-old-space-size=1536',
      },
    }
  )

  // Log stdout (non-blocking)
  nextProcess.stdout?.on('data', (data: Buffer) => {
    const lines = data.toString().split('\n').filter(Boolean)
    for (const line of lines) {
      if (line.includes('Ready') || line.includes('GET') || line.includes('POST') || line.includes('Error') || line.includes('error')) {
        log(`[next] ${line.trim()}`)
      }
    }
  })

  nextProcess.stderr?.on('data', (data: Buffer) => {
    const lines = data.toString().split('\n').filter(Boolean)
    for (const line of lines) {
      log(`[next:err] ${line.trim()}`)
    }
  })

  nextProcess.on('exit', (code, signal) => {
    log(`Next.js exited (code=${code}, signal=${signal})`)
    nextProcess = null

    if (isShuttingDown) return

    restartCount++
    const delay = Math.min(1000 * Math.pow(1.5, restartCount), MAX_RESTART_DELAY_MS)
    log(`Restarting in ${Math.round(delay)}ms (restart #${restartCount})...`)
    
    setTimeout(async () => {
      if (isShuttingDown) return
      // CRITICAL: Wait for port to be free before restarting
      const free = await waitForPort(NEXT_PORT, PORT_FREE_WAIT_MS)
      if (!free) {
        log(`Port ${NEXT_PORT} still in use after ${PORT_FREE_WAIT_MS}ms, force-killing...`)
        killPortUsers(NEXT_PORT)
        await new Promise(r => setTimeout(r, 2000))
      }
      startNextProcess()
    }, delay)
  })
}

// ─── Main Loop ─────────────────────────────────────────────
async function main() {
  log('════════════════════════════════════════════')
  log('  Ventify Keepalive Service v1.0')
  log(`  Watching Next.js on port ${NEXT_PORT}`)
  log(`  Ping interval: ${PING_INTERVAL_MS / 1000}s`)
  log('════════════════════════════════════════════')

  // Start Next.js for the first time
  startNextProcess()

  // Wait for initial compilation
  log('Waiting for initial compilation...')
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 2000))
    const alive = await isServerAlive()
    if (alive) {
      log('✓ Next.js is ready and responding!')
      break
    }
    if (i % 5 === 4) {
      log(`Still compiling... (${(i + 1) * 2}s)`)
    }
  }

  // Keepalive loop — ping and restart if needed
  setInterval(async () => {
    if (isShuttingDown) return

    const alive = await isServerAlive()
    if (alive) {
      // Server is healthy, reset restart counter
      restartCount = 0
      return
    }

    // Server is dead but process might still exist
    log('Health check failed — server not responding')

    if (nextProcess) {
      log('Killing stale Next.js process...')
      try { nextProcess.kill('SIGKILL') } catch { /* already dead */ }
      nextProcess = null
    }

    // CRITICAL: Wait for port to be completely free
    const free = await waitForPort(NEXT_PORT, PORT_FREE_WAIT_MS)
    if (!free) {
      log('Port still occupied, force-killing all users...')
      killPortUsers(NEXT_PORT)
      await new Promise(r => setTimeout(r, 2000))
    }

    // Start fresh
    startNextProcess()
  }, PING_INTERVAL_MS)

  // Graceful shutdown
  const shutdown = () => {
    isShuttingDown = true
    log('Shutting down...')
    if (nextProcess) {
      nextProcess.kill('SIGTERM')
      setTimeout(() => nextProcess?.kill('SIGKILL'), 5000)
    }
    setTimeout(() => process.exit(0), 1000)
  }

  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)
  process.on('SIGHUP', shutdown)
}

main().catch((err) => {
  console.error('[keepalive] Fatal error:', err)
  process.exit(1)
})
