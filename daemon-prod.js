#!/usr/bin/env node
// Production keepalive - restarts standalone server if it dies
const { spawn } = require('child_process');
const fs = require('fs');

const STANDALONE = '/home/z/my-project/.next/standalone';

function startServer() {
  // Remove .config if exists
  try { fs.unlinkSync('/home/z/my-project/.config'); } catch {}
  
  const child = spawn('node', ['server.js'], {
    cwd: STANDALONE,
    env: { ...process.env, NODE_ENV: 'production', PORT: '3000' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const logStream = fs.createWriteStream('/home/z/my-project/dev.log', { flags: 'a' });
  child.stdout.pipe(logStream);
  child.stderr.pipe(logStream);

  child.on('exit', () => {
    setTimeout(startServer, 2000);
  });

  child.on('error', () => {
    setTimeout(startServer, 2000);
  });
}

startServer();

// Keep alive
setInterval(() => {}, 60000);
process.on('SIGTERM', () => process.exit(0));
process.on('SIGINT', () => process.exit(0));
