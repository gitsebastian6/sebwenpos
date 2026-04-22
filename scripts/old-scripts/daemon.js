#!/usr/bin/env node
// Keepalive daemon - restarts Next.js dev server if it dies
const { spawn } = require('child_process');
const fs = require('fs');
const http = require('http');

const PROJECT = '/home/z/my-project';
const LOG = '/home/z/my-project/dev.log';

function cleanup() {
  try { fs.unlinkSync(PROJECT + '/.config'); } catch {}
}

function startServer() {
  cleanup();
  
  const child = spawn('npx', ['next', 'dev', '-p', '3000'], {
    cwd: PROJECT,
    env: { ...process.env, NODE_ENV: 'development' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const logStream = fs.createWriteStream(LOG, { flags: 'a' });
  child.stdout.pipe(logStream);
  child.stderr.pipe(logStream);

  child.on('exit', (code) => {
    console.log(`[${new Date().toISOString()}] Server exited (${code}), restarting in 3s...`);
    setTimeout(startServer, 3000);
  });

  child.on('error', (err) => {
    console.error(`[${new Date().toISOString()}] Error: ${err.message}`);
    setTimeout(startServer, 3000);
  });
}

console.log('[daemon] Starting Next.js keepalive...');
startServer();

// Health check every 30s
setInterval(() => {
  http.get('http://localhost:3000/', (res) => {
    console.log(`[health] ${res.statusCode}`);
  }).on('error', () => {
    console.log(`[health] FAIL`);
  });
}, 30000);

process.on('SIGTERM', () => process.exit(0));
process.on('SIGINT', () => process.exit(0));
