const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const PROJECT = '/home/z/my-project';
const LOG = PROJECT + '/keeper.log';
let child = null;
let restartCount = 0;

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  fs.appendFileSync(LOG, line);
  process.stdout.write(line);
}

function startNext() {
  // Remove .config if exists (JuiceFS artifact)
  const configPath = path.join(PROJECT, '.config');
  try { if (fs.existsSync(configPath)) fs.unlinkSync(configPath); } catch(e) {}

  restartCount++;
  log(`Starting Next.js (attempt #${restartCount})...`);

  child = spawn('npx', ['next', 'dev', '-p', '3000'], {
    cwd: PROJECT,
    detached: false,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      DATABASE_URL: 'file:/home/z/my-project/db/custom.db',
      NODE_ENV: 'development',
    }
  });

  child.stdout.on('data', d => {
    const s = d.toString();
    // Only log important lines
    if (s.includes('Ready') || s.includes('Error') || s.includes('error') || s.includes('GET /') || s.includes('POST /')) {
      log(s.trim());
    }
  });

  child.stderr.on('data', d => {
    const s = d.toString();
    if (!s.includes('prisma:query')) {
      log(s.trim());
    }
  });

  child.on('exit', (code, signal) => {
    log(`Next.js exited (code=${code}, signal=${signal}). Restarting in 3s...`);
    setTimeout(startNext, 3000);
  });

  child.on('error', (err) => {
    log(`Next.js error: ${err.message}. Restarting in 5s...`);
    setTimeout(startNext, 5000);
  });
}

// Handle signals gracefully - don't die, just restart
['SIGINT', 'SIGTERM', 'SIGHUP'].forEach(sig => {
  process.on(sig, () => {
    log(`Received ${sig}, ignoring (keep-alive mode)`);
  });
});

process.on('uncaughtException', (err) => {
  log(`Uncaught exception: ${err.message}`);
});

log('=== Next.js Keeper started ===');
startNext();
