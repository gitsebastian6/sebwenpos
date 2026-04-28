#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# fix-prisma-standalone.sh — Fix Prisma client for Next.js standalone output
# ─────────────────────────────────────────────────────────────
# Next.js 16 Turbopack externalizes @prisma/client with a hashed name
# (e.g., @prisma/client-2c3a283f134fdcb6) but the standalone output
# only includes @prisma/client. This script detects the hash dynamically
# and creates the necessary symlinks/copies.
#
# Usage: bash scripts/fix-prisma-standalone.sh [STANDALONE_DIR]
# ─────────────────────────────────────────────────────────────

set -e

STANDALONE_DIR="${1:-.next/standalone}"
NM="$STANDALONE_DIR/node_modules"

if [ ! -d "$NM/.prisma" ]; then
  echo "[fix-prisma] No .prisma directory found in $NM — nothing to fix"
  exit 0
fi

# Check if hashed copy already exists
EXISTING_HASHES=$(ls -d "$NM/.prisma/"client-* 2>/dev/null || true)
if [ -n "$EXISTING_HASHES" ]; then
  echo "[fix-prisma] Hashed Prisma client already exists: $(basename $EXISTING_HASHES | head -1)"
  exit 0
fi

# Strategy 1: Search standalone server JS for the hashed import pattern
HASHED_NAME=""
if [ -d "$STANDALONE_DIR/.next/server" ]; then
  # Use grep to find the hashed import in compiled server files
  HASHED_NAME=$(grep -roh '@prisma/client-[a-f0-9]\+' "$STANDALONE_DIR/.next/server/" 2>/dev/null | head -1 | sed 's/@prisma\///')
fi

# Strategy 2: If not found, check the chunk files
if [ -z "$HASHED_NAME" ] && [ -d "$STANDALONE_DIR/.next/static" ]; then
  HASHED_NAME=$(grep -roh '@prisma/client-[a-f0-9]\+' "$STANDALONE_DIR/.next/static/" 2>/dev/null | head -1 | sed 's/@prisma\///')
fi

# Strategy 3: Check the main server.js
if [ -z "$HASHED_NAME" ] && [ -f "$STANDALONE_DIR/server.js" ]; then
  HASHED_NAME=$(grep -oh '@prisma/client-[a-f0-9]\+' "$STANDALONE_DIR/server.js" 2>/dev/null | head -1 | sed 's/@prisma\///')
fi

if [ -z "$HASHED_NAME" ]; then
  echo "[fix-prisma] No hashed Prisma client import found — standalone may work without fix"
  exit 0
fi

echo "[fix-prisma] Detected hashed Prisma import: @prisma/$HASHED_NAME"

# Create the hashed copy in .prisma/
if [ -d "$NM/.prisma/client" ] && [ ! -d "$NM/.prisma/$HASHED_NAME" ]; then
  echo "[fix-prisma] Copying .prisma/client → .prisma/$HASHED_NAME"
  cp -r "$NM/.prisma/client" "$NM/.prisma/$HASHED_NAME"
fi

# Create the hashed copy in @prisma/
if [ -d "$NM/@prisma/client" ] && [ ! -d "$NM/@prisma/$HASHED_NAME" ]; then
  echo "[fix-prisma] Copying @prisma/client → @prisma/$HASHED_NAME"
  cp -r "$NM/@prisma/client" "$NM/@prisma/$HASHED_NAME"
fi

echo "[fix-prisma] ✅ Fix applied successfully"
