#!/bin/bash
# Git Auto-Push Watcher
# Runs in background, checks every 30 seconds for unpushed commits
# Usage: nohup bash /home/z/my-project/scripts/git-watch-push.sh &

cd /home/z/my-project

echo "[Git Watcher] Started - checking every 30s for unpushed commits..."

while true; do
  sleep 30
  # Fetch first to get latest remote state
  git fetch origin main 2>/dev/null
  UNPUSHED=$(git log --oneline origin/main..main 2>/dev/null | wc -l | tr -d ' ')
  if [ "$UNPUSHED" -gt 0 ]; then
    TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[Git Watcher] $TIMESTAMP - Found $UNPUSHED unpushed commit(s), pushing..."
    RESULT=$(git push origin main 2>&1)
    echo "[Git Watcher] $TIMESTAMP - Push result: $RESULT"
  fi
done
