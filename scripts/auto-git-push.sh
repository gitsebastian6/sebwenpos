#!/bin/bash
# Auto-push protection: checks every minute for unpushed commits
# and pushes them to GitHub automatically

cd /home/z/my-project

UNPUSHED=$(git log --oneline origin/main..main 2>/dev/null | wc -l)

if [ "$UNPUSHED" -gt 0 ]; then
  echo "$(date '+%Y-%m-%d %H:%M:%S') - Found $UNPUSHED unpushed commit(s), pushing..."
  git push origin main 2>&1
  echo "$(date '+%Y-%m-%d %H:%M:%S') - Push completed"
fi
