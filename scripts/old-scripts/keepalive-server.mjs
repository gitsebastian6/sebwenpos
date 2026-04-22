#!/usr/bin/env node
// Keepalive wrapper for Next.js standalone server
import { spawn } from 'child_process';
import { createServer } from 'net';

const STANDALONE_DIR = '/home/z/my-project/.next/standalone';
const PORT = 3000;

function waitForPort(port) {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        resolve(); // Port is already in use
      } else {
        reject(err);
      }
    });
    server.once('listening', () => {
      server.close();
      resolve();
    });
    server.listen(port);
  });
}

function startServer() {
  const child = spawn('node', ['server.js'], {
    cwd: STANDALONE_DIR,
    env: { ...process.env, NODE_ENV: 'production', PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  child.stdout.on('data', (data) => {
    process.stdout.write(data);
  });

  child.stderr.on('data', (data) => {
    process.stderr.write(data);
  });

  child.on('exit', (code) => {
    console.log(`[keeper] Server exited with code ${code}, restarting in 2s...`);
    setTimeout(startServer, 2000);
  });

  child.on('error', (err) => {
    console.error(`[keeper] Server error: ${err.message}, restarting in 2s...`);
    setTimeout(startServer, 2000);
  });

  return child;
}

// Start the server
console.log('[keeper] Starting Next.js standalone server keepalive...');
startServer();

// Keep the process alive
process.on('SIGTERM', () => {
  console.log('[keeper] Received SIGTERM, exiting...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('[keeper] Received SIGINT, exiting...');
  process.exit(0);
});
