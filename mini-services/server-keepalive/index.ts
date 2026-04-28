// Server Keepalive Service
// Starts the Next.js standalone server and restarts it when it crashes.
// Also performs warmup requests to keep the server responsive.

import { spawn } from 'child_process'

const SERVER_PORT = 3000
const WARMUP_INTERVAL = 30_000 // 30 seconds
const MAX_RESTARTS = 50
const RESTART_WINDOW = 300_000 // 5 minutes
const MIN_UPTIME = 5_000 // Consider a crash if uptime < 5s

let serverProcess: ReturnType<typeof spawn> | null = null
let restartCount = 0
let startTime = 0
let lastRestartTime = 0

function startServer(): void {
  const now = Date.now()
  
  // Reset restart count if outside the window
  if (now - lastRestartTime > RESTART_WINDOW) {
    restartCount = 0
  }
  
  if (restartCount >= MAX_RESTARTS) {
    console.error(`[Keepalive] Max restarts (${MAX_RESTARTS}) reached. Waiting 5 minutes...`)
    setTimeout(() => {
      restartCount = 0
      startServer()
    }, 300_000)
    return
  }
  
  startTime = now
  lastRestartTime = now
  restartCount++
  
  console.log(`[Keepalive] Starting server (attempt ${restartCount})...`)
  
  serverProcess = spawn('node', [
    '--max-old-space-size=4096',
    '.next/standalone/server.js'
  ], {
    cwd: '/home/z/my-project',
    env: { ...process.env, NODE_ENV: 'production', PORT: String(SERVER_PORT), HOSTNAME: '0.0.0.0' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  
  serverProcess.stdout?.on('data', (data: Buffer) => {
    const msg = data.toString().trim()
    if (msg) console.log(`[Server] ${msg}`)
  })
  
  serverProcess.stderr?.on('data', (data: Buffer) => {
    const msg = data.toString().trim()
    if (msg) console.error(`[Server] ${msg}`)
  })
  
  serverProcess.on('exit', (code, signal) => {
    const uptime = Date.now() - startTime
    console.log(`[Keepalive] Server exited with code=${code}, signal=${signal}, uptime=${uptime}ms`)
    
    if (uptime < MIN_UPTIME) {
      console.log(`[Keepalive] Quick crash detected (uptime < ${MIN_UPTIME}ms). Waiting 3s before restart...`)
      setTimeout(startServer, 3000)
    } else {
      // Normal restart
      console.log(`[Keepalive] Restarting server in 1s...`)
      setTimeout(startServer, 1000)
    }
  })
}

// Warmup: periodically make a request to keep the server responsive
async function warmup(): Promise<void> {
  try {
    const response = await fetch(`http://localhost:${SERVER_PORT}/api/payments/wompi/health`, {
      signal: AbortSignal.timeout(5000),
    })
    if (response.ok) {
      console.log(`[Keepalive] Warmup OK`)
    } else {
      console.log(`[Keepalive] Warmup returned ${response.status}`)
    }
  } catch {
    console.log(`[Keepalive] Warmup failed - server might be restarting`)
  }
}

// HTTP server for health checks
const PORT = 3020
Bun.serve({
  port: PORT,
  fetch(req) {
    const url = new URL(req.url)
    
    if (url.pathname === '/health') {
      const uptime = serverProcess?.pid ? Date.now() - startTime : 0
      return new Response(JSON.stringify({
        status: serverProcess?.pid ? 'running' : 'stopped',
        uptime,
        restartCount,
        port: SERVER_PORT,
      }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }
    
    if (url.pathname === '/restart' && req.method === 'POST') {
      console.log('[Keepalive] Manual restart requested')
      serverProcess?.kill('SIGTERM')
      return new Response(JSON.stringify({ message: 'Restarting...' }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }
    
    return new Response('Not Found', { status: 404 })
  },
})

console.log(`[Keepalive] Service running on port ${PORT}`)

// Start the server
startServer()

// Start warmup interval
setTimeout(() => {
  warmup()
  setInterval(warmup, WARMUP_INTERVAL)
}, 10000) // First warmup after 10s
