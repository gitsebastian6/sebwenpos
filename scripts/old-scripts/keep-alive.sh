#!/bin/bash
while true; do
  cd /home/z/my-project/.next/standalone
  DATABASE_URL="file:/home/z/my-project/db/custom.db" node server.js -p 3000
  sleep 1
done
