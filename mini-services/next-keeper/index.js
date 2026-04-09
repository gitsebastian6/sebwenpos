const { spawn } = require('child_process');
const path = require('path');

const PROJECT = '/home/z/my-project';
let child = null;

function start() {
  // Remove .config if exists
  const fs = require('fs');
  const configPath = path.join(PROJECT, '.config');
  if (fs.existsSync(configPath)) {
    try { fs.unlinkSync(configPath); } catch(e) {}
  }

  child = spawn('npx', ['next', 'dev', '-p', '3000'], {
    cwd: PROJECT,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, DATABASE_URL: 'file:/home/z/my-project/db/custom.db' }
  });

  child.stdout.on('data', d => process.stdout.write(d));
  child.stderr.on('data', d => process.stderr.write(d));

  child.on('exit', (code) => {
    console.log(`[keeper] Next.js died (code=${code}), restarting in 2s...`);
    setTimeout(start, 2000);
  });
}

console.log('[keeper] Starting Next.js server watchdog...');
start();
