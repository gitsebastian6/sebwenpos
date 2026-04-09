const { spawn } = require('child_process');
const path = require('path');

// This script daemonizes the keeper - it forks itself and exits,
// leaving the grandchild completely independent of any terminal session.
const isDaemon = process.env.__DAEMONIZED__ === '1';

if (!isDaemon) {
  // First run: fork ourselves as a detached daemon
  const child = spawn(process.execPath, [__filename], {
    detached: true,
    stdio: 'ignore',
    cwd: '/home/z/my-project/mini-services/next-keeper',
    env: {
      ...process.env,
      __DAEMONIZED__: '1',
      DATABASE_URL: 'file:/home/z/my-project/db/custom.db',
    }
  });
  child.unref();
  // Exit immediately - the daemon lives on its own
  process.exit(0);
} else {
  // We ARE the daemon now - load and run the keeper
  require('./index.js');
}
