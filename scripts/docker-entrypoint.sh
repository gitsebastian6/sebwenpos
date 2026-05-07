#!/bin/bash
# ---------------------------------------------------------------------------
# VentifyPOS — Docker Entrypoint
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
echo "║         VentifyPOS — Starting Container          ║"
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

# ── 2. Seed if empty ──
PLAN_COUNT=$(node -e "
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();
  prisma.plan.count().then(c => { console.log(c); prisma.\$disconnect(); }).catch(() => { console.log(0); prisma.\$disconnect(); });
" 2>/dev/null || echo "0")

if [ "$PLAN_COUNT" = "0" ]; then
  echo "🌱 Seeding database..."
  node -e "
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();

    async function seed() {
      const plans = [
        { name: 'Trial', description: 'Prueba gratuita de 7 días para conocer el sistema', price: 0, maxStores: 1, maxEmployees: 3, maxProducts: 100, features: JSON.stringify({ pos: true, invoices: true, electronicInvoicing: false, tables: true, dashboard: true }), isActive: true, sortOrder: 0 },
        { name: 'Básico', description: 'Plan básico para negocios pequeños', price: 49000, maxStores: 1, maxEmployees: 3, maxProducts: 100, features: JSON.stringify({ pos: true, invoices: false, electronicInvoicing: false }), isActive: true, sortOrder: 1 },
        { name: 'Profesional', description: 'Plan profesional para negocios en crecimiento', price: 99000, maxStores: 2, maxEmployees: 10, maxProducts: 500, features: JSON.stringify({ pos: true, invoices: true, electronicInvoicing: false }), isActive: true, sortOrder: 2 },
        { name: 'Empresarial', description: 'Plan empresarial con facturación electrónica DIAN', price: 199000, maxStores: 5, maxEmployees: 25, maxProducts: 2000, features: JSON.stringify({ pos: true, invoices: true, electronicInvoicing: true, multiStore: true }), isActive: true, sortOrder: 3 },
      ];

      for (const plan of plans) {
        await prisma.plan.upsert({
          where: { name: plan.name },
          update: {},
          create: plan,
        });
      }

      console.log('✅ Plans seeded');

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

    seed().catch(e => { console.error('Seed error:', e); process.exit(1); });
  " || echo "⚠️  Seed skipped (may need manual setup)"
else
  echo "✅ Database already has $PLAN_COUNT plans — skipping seed"
fi

# ── 3. Ensure uploads directory exists ──
mkdir -p /app/uploads/receipts 2>/dev/null || true

# ── 4. Start the server ──
echo "🚀 Starting VentifyPOS server on port ${PORT:-3000}..."
exec node server.js
