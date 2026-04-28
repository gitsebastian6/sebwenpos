#!/bin/bash
# Ensure environment variables are set for development
cd /home/z/my-project
if [ ! -f .env ]; then
  cp .env.example .env
fi
echo "Environment ready"
