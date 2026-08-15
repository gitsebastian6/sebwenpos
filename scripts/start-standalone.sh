#!/bin/bash
# Start VivaPOS using the standalone production build with Node.js
# This is more memory-efficient than the dev server in sandbox environments

cd /home/z/my-project

# Ensure we have a build
if [ ! -f .next/standalone/server.js ]; then
  echo "No standalone build found. Building..."
  bun run build
fi

# Start the standalone server with memory limits
echo "Starting VivaPOS standalone server..."
exec NODE_ENV=production node --max-old-space-size=768 .next/standalone/server.js
