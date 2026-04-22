const { spawn } = require('child_process');
const path = require('path');

function start() {
  const server = spawn('node', [path.join(__dirname, '.next/standalone/server.js')], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PORT: '3000', NODE_ENV: 'production' }
  });
  
  server.stdout.on('data', (d) => process.stdout.write(d));
  server.stderr.on('data', (d) => process.stderr.write(d));
  server.on('exit', (code) => {
    console.log(`Server exited with code ${code}, restarting in 2s...`);
    setTimeout(start, 2000);
  });
}

start();
