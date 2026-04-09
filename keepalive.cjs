const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const LOG = '/home/z/my-project/dev.log';

function log(msg) {
  const ts = new Date().toISOString();
  fs.appendFileSync(LOG, `[${ts}] ${msg}\n`);
}

function start() {
  log('Starting Next.js standalone server...');
  const child = spawn('node', [path.join(__dirname, '.next/standalone/server.js')], {
    cwd: __dirname,
    env: { ...process.env, PORT: '3000', NODE_ENV: 'production', NODE_OPTIONS: '--max-old-space-size=256' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  child.stdout.on('data', (d) => {
    const lines = d.toString().split('\n').filter(Boolean);
    lines.forEach(l => fs.appendFileSync(LOG, l + '\n'));
  });
  child.stderr.on('data', (d) => {
    const lines = d.toString().split('\n').filter(Boolean);
    lines.forEach(l => fs.appendFileSync(LOG, l + '\n'));
  });

  child.on('exit', (code) => {
    log(`Server exited (code=${code}), restarting in 2s...`);
    setTimeout(start, 2000);
  });

  child.on('error', (err) => {
    log(`Server error: ${err.message}, restarting in 2s...`);
    setTimeout(start, 2000);
  });
}

start();
