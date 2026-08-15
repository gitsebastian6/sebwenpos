#!/bin/bash
# ---------------------------------------------------------------------------
# VivaPOS — Docker Entrypoint
# ---------------------------------------------------------------------------
# Runs on container startup:
#   1. Wait for PostgreSQL to be ready (TCP check)
#   2. Seed plans and super admin if DB is empty
#   3. Start the Next.js standalone server
#
# NOTE: Prisma schema push (db push) runs in a SEPARATE init container
#       (see docker-compose.yml → migrate service). The app container
#       only needs to wait for PG + seed + start.
# ---------------------------------------------------------------------------

echo "╔══════════════════════════════════════════════════╗"
echo "║         VivaPOS — Starting Container          ║"
echo "╚══════════════════════════════════════════════════╝"

# ── 1. Wait for PostgreSQL (simple TCP check) ──
if [ -n "$DATABASE_URL" ] && echo "$DATABASE_URL" | grep -q "postgresql"; then
  echo "⏳ Waiting for PostgreSQL..."
  MAX_RETRIES=30
  RETRY_COUNT=0

  until node -e "
    const net = require('net');
    const url = new URL(process.env.DATABASE_URL);
    const socket = net.createConnection({ host: url.hostname, port: parseInt(url.port || '5432') }, () => {
      socket.end();
      process.exit(0);
    });
    socket.on('error', () => { process.exit(1); });
    socket.setTimeout(2000, () => { socket.destroy(); process.exit(1); });
  " 2>/dev/null; do
    RETRY_COUNT=$((RETRY_COUNT + 1))
    echo "   Retry $RETRY_COUNT/$MAX_RETRIES..."
    sleep 2
    if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
      echo "❌ Could not connect to PostgreSQL after $MAX_RETRIES retries"
      exit 1
    fi
  done

  echo "✅ PostgreSQL is reachable"
else
  echo "⚠️  No PostgreSQL URL detected — skipping DB check"
fi

# ── 2. Sync plans (create missing, update existing) + seed super admin ──
# Plan data comes from prisma/default-plans.json — the single source of
# truth shared with prisma/seed.ts and /api/super-admin/plans/seed.
# This runs on every boot (idempotent) so plan definitions never drift
# from what's committed in the repo, even on an already-seeded database.
echo "🌱 Syncing plans..."
node -e "
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();
  const DEFAULT_PLANS = require('/app/prisma/default-plans.json');

  async function syncPlans() {
    const existing = await prisma.plan.findMany({ select: { id: true, name: true } });
    const existingNames = new Set(existing.map(p => p.name));
    let created = 0;
    let updated = 0;

    for (const plan of DEFAULT_PLANS) {
      const data = {
        description: plan.description,
        price: plan.price,
        maxStores: plan.maxStores,
        maxEmployees: plan.maxEmployees,
        maxProducts: plan.maxProducts,
        features: JSON.stringify(plan.features),
        sortOrder: plan.sortOrder,
        isActive: plan.isActive,
      };
      if (existingNames.has(plan.name)) {
        await prisma.plan.update({ where: { name: plan.name }, data });
        updated++;
      } else {
        await prisma.plan.create({ data: { name: plan.name, ...data } });
        created++;
      }
    }
    console.log(\`✅ Planes sincronizados: \${created} creado(s), \${updated} actualizado(s)\`);

    if (process.env.SUPERADMIN_CEDULA) {
      const bcrypt = require('bcryptjs');
      const existingAdmin = await prisma.user.findFirst({ where: { role: 'SUPER_ADMIN' } });
      if (!existingAdmin) {
        const hash = await bcrypt.hash(process.env.SUPERADMIN_PASSWORD || 'Admin123!', 10);
        await prisma.user.create({
          data: {
            cedula: process.env.SUPERADMIN_CEDULA,
            fullName: process.env.SUPERADMIN_NAME || 'Super Administrador',
            phone: process.env.SUPERADMIN_PHONE || null,
            passwordHash: hash,
            role: 'SUPER_ADMIN',
          },
        });
        console.log('✅ Super admin created');
      }
    }

    await prisma.\$disconnect();
  }

  syncPlans().catch(e => { console.error('Plan sync error:', e); process.exit(1); });
" || echo "⚠️  Plan sync skipped (may need manual setup)"

# ── 3. Ensure uploads directory exists ──
mkdir -p /app/uploads/receipts 2>/dev/null || true

# ── 4. Start the server ──
echo "🚀 Starting VivaPOS server on port ${PORT:-3000}..."
exec node server.js
