/**
 * Ventify Keepalive Service v3 (Node.js)
 * Watches Next.js dev server and auto-restarts it if it dies.
 * Uses Node.js for maximum sandbox compatibility.
 */

const { spawn, execSync } = require('child_process');
const http = require('http');

const NEXT_PORT = 3000;
const PING_INTERVAL_MS = 15_000;
const MAX_RESTART_DELAY_MS = 60_000;
const HEALTH_TIMEOUT_MS = 5_000;
const PORT_FREE_WAIT_MS = 5_000;

let nextProcess = null;
let restartCount = 0;
let isShuttingDown = false;

function log(msg) {
  const ts = new Date().toLocaleTimeString('en-US', { hour12: false });
  console.log(`[${ts}] [keepalive] ${msg}`);
}

function isServerAlive() {
  return new Promise((resolve) => {
    const req = http.request({
      hostname: 'localhost',
      port: NEXT_PORT,
      path: '/',
      method: 'GET',
      timeout: HEALTH_TIMEOUT_MS,
    }, (res) => {
      res.resume();
      resolve(true);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.end();
  });
}

function killPortUsers(port) {
  try {
    const result = execSync(`ss -tlnp 2>/dev/null | grep ':${port} ' || true`, {
      encoding: 'utf-8', timeout: 5000,
    });
    if (!result.trim()) return true;
    const pidMatches = result.match(/pid=(\d+)/g);
    if (!pidMatches || pidMatches.length === 0) return true;
    const pids = pidMatches.map(m => parseInt(m.replace('pid=', '')));
    for (const pid of pids) {
      try { process.kill(pid, 'SIGKILL'); log(`Killed PID ${pid} on port ${port}`); } catch {}
    }
    return true;
  } catch { return false; }
}

function waitForPort(port, maxWaitMs) {
  return new Promise((resolve) => {
    const start = Date.now();
    const check = () => {
      try {
        const result = execSync(`ss -tlnp 2>/dev/null | grep ':${port} ' || true`, {
          encoding: 'utf-8', timeout: 2000,
        });
        if (!result.trim()) return resolve(true);
      } catch { return resolve(true); }
      if (Date.now() - start < maxWaitMs) {
        setTimeout(check, 500);
      } else {
        resolve(false);
      }
    };
    check();
  });
}

function startNextProcess() {
  killPortUsers(NEXT_PORT);
  log('Starting Next.js dev server...');

  nextProcess = spawn('bun', ['run', 'dev'], {
    cwd: '/home/z/my-project',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, NODE_OPTIONS: '--max-old-space-size=256' },
  });

  nextProcess.stdout.on('data', (data) => {
    const lines = data.toString().split('\n').filter(Boolean);
    for (const line of lines) {
      if (line.includes('Ready') || line.includes('Error') || line.includes('GET /') || line.includes('POST /')) {
        log(`[next] ${line.trim()}`);
      }
    }
  });

  nextProcess.stderr.on('data', (data) => {
    const lines = data.toString().split('\n').filter(Boolean);
    for (const line of lines) {
      log(`[next:err] ${line.trim()}`);
    }
  });

  nextProcess.on('exit', (code, signal) => {
    log(`Next.js exited (code=${code}, signal=${signal})`);
    nextProcess = null;
    if (isShuttingDown) return;
    restartCount++;
    const delay = Math.min(1000 * Math.pow(1.5, restartCount), MAX_RESTART_DELAY_MS);
    log(`Restarting in ${Math.round(delay)}ms (restart #${restartCount})...`);
    setTimeout(async () => {
      if (isShuttingDown) return;
      const free = await waitForPort(NEXT_PORT, PORT_FREE_WAIT_MS);
      if (!free) { killPortUsers(NEXT_PORT); }
      await new Promise(r => setTimeout(r, 2000));
      startNextProcess();
    }, delay);
  });
}

async function main() {
  log('═══ Ventify Keepalive v3 (Node.js) ═══');
  log(`Watching Next.js on port ${NEXT_PORT}`);
  log(`Ping interval: ${PING_INTERVAL_MS / 1000}s`);

  startNextProcess();

  // Wait for initial compilation
  log('Waiting for initial compilation...');
  for (let i = 0; i < 90; i++) {
    await new Promise(r => setTimeout(r, 2000));
    if (await isServerAlive()) {
      log('✓ Next.js is ready and responding!');
      break;
    }
    if (i % 10 === 9) log(`Still compiling... (${(i + 1) * 2}s)`);
  }

  // Keepalive loop — ping and restart if needed
  setInterval(async () => {
    if (isShuttingDown) return;
    if (await isServerAlive()) { restartCount = 0; return; }
    log('Health check failed — server not responding');
    if (nextProcess) {
      try { nextProcess.kill('SIGKILL'); } catch {}
      nextProcess = null;
    }
    const free = await waitForPort(NEXT_PORT, PORT_FREE_WAIT_MS);
    if (!free) { killPortUsers(NEXT_PORT); }
    await new Promise(r => setTimeout(r, 2000));
    startNextProcess();
  }, PING_INTERVAL_MS);

  // Graceful shutdown
  const shutdown = () => {
    isShuttingDown = true;
    log('Shutting down...');
    if (nextProcess) {
      nextProcess.kill('SIGTERM');
      setTimeout(() => { try { nextProcess.kill('SIGKILL'); } catch {} }, 5000);
    }
    setTimeout(() => process.exit(0), 1000);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
  process.on('SIGHUP', () => log('Received SIGHUP, ignoring (keep-alive mode)'));
  process.on('uncaughtException', (err) => log(`Uncaught exception: ${err.message}`));
}

main().catch(err => { console.error('[keepalive] Fatal:', err); process.exit(1); });
