// =============================================================================
// Ventify POS — Git Auto-Commit Cron Service
// =============================================================================
// Runs every hour. Executes bash script for git auto-commit with validation.
// Port 3011 — health check only (commit logic in bash for reliability).
// =============================================================================

const PROJECT_DIR = '/home/z/my-project'
const SCRIPT_PATH = `${PROJECT_DIR}/scripts/git-auto-commit.sh`
const LOG_FILE = `${PROJECT_DIR}/.git-commit.log`
const PORT = 3012

async function runBashScript(): Promise<{ success: boolean; output: string }> {
  const proc = Bun.spawn(['bash', SCRIPT_PATH], {
    cwd: PROJECT_DIR,
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const stdout = await new Response(proc.stdout).text()
  const stderr = await new Response(proc.stderr).text()
  const exitCode = await proc.exited
  return {
    success: exitCode === 0,
    output: stdout + stderr,
  }
}

function log(msg: string): void {
  const ts = new Date().toISOString()
  const line = `[${ts}] ${msg}`
  console.log(line)
}

// ─── HTTP Server ─────────────────────────────────────────────────────────────
Bun.serve({
  port: PORT,
  fetch(req) {
    const url = new URL(req.url)

    if (url.pathname === '/health') {
      return Response.json({
        status: 'ok',
        service: 'git-auto-commit',
        port: PORT,
        interval: '1 hour',
      })
    }

    if (url.pathname === '/commit' && req.method === 'POST') {
      return runBashScript().then(r =>
        Response.json({ success: r.success, output: r.output })
      )
    }

    return new Response('Not Found', { status: 404 })
  },
})

console.log(`[Git Auto-Commit] Service running on port ${PORT}`)

// ─── Scheduled Execution — Every 1 hour ────────────────────────────────────
const HOUR_MS = 60 * 60 * 1000

function runScheduledCommit(): void {
  log(`[SCHEDULED] Ejecutando commit automático programado...`)
  runBashScript().then(r => {
    if (r.success) {
      log(`[SCHEDULED] ✅ Completado exitosamente`)
    } else {
      log(`[SCHEDULED] ❌ Error en ejecución`)
    }
  }).catch(err => {
    log(`[SCHEDULED] FATAL: ${String(err)}`)
  })
}

// Run first check after 30 seconds
setTimeout(runScheduledCommit, 30_000)

// Schedule recurring checks every hour
setInterval(runScheduledCommit, HOUR_MS)
