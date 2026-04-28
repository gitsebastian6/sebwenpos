#!/bin/bash
# ---------------------------------------------------------------------------
# VentifyPOS — Docker Entrypoint
# ---------------------------------------------------------------------------
# Runs on container startup:
#   1. Wait for PostgreSQL to be ready
#   2. Push Prisma schema (creates/migrates tables)
#   3. Seed plans and super admin if DB is empty
#   4. Start the Next.js standalone server
# ---------------------------------------------------------------------------

set -e

echo "╔══════════════════════════════════════════════════╗"
echo "║         VentifyPOS — Starting Container          ║"
echo "╚══════════════════════════════════════════════════╝"

# ── 1. Wait for PostgreSQL ──
if [ -n "$DATABASE_URL" ] && echo "$DATABASE_URL" | grep -q "postgresql"; then
  echo "⏳ Waiting for PostgreSQL..."
  MAX_RETRIES=30
  RETRY_COUNT=0

  until npx prisma db push --accept-data-loss 2>/dev/null || [ $RETRY_COUNT -eq $MAX_RETRIES ]; do
    RETRY_COUNT=$((RETRY_COUNT + 1))
    echo "   Retry $RETRY_COUNT/$MAX_RETRIES..."
    sleep 2
  done

  if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
    echo "❌ Could not connect to PostgreSQL after $MAX_RETRIES retries"
    exit 1
  fi

  echo "✅ PostgreSQL connected and schema pushed"
else
  echo "⚠️  No PostgreSQL URL detected — skipping DB setup"
fi

# ── 2. Seed if empty ──
# Check if the plans table has data; if not, seed
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
      // Create default plans
      const plans = [
        { name: 'Básico', description: 'Plan básico para negocios pequeños', price: 49000, maxStores: 1, maxEmployees: 3, maxProducts: 100, features: JSON.stringify({ pos: true, invoices: false, electronicInvoicing: false }), sortOrder: 1 },
        { name: 'Profesional', description: 'Plan profesional para negocios en crecimiento', price: 99000, maxStores: 2, maxEmployees: 10, maxProducts: 500, features: JSON.stringify({ pos: true, invoices: true, electronicInvoicing: false }), sortOrder: 2 },
        { name: 'Empresarial', description: 'Plan empresarial con facturación electrónica DIAN', price: 199000, maxStores: 5, maxEmployees: 25, maxProducts: 2000, features: JSON.stringify({ pos: true, invoices: true, electronicInvoicing: true, multiStore: true }), sortOrder: 3 },
      ];

      for (const plan of plans) {
        await prisma.plan.upsert({
          where: { name: plan.name },
          update: {},
          create: plan,
        });
      }

      console.log('✅ Plans seeded');

      // Create super admin if SUPERADMIN_CEDULA is set
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
  " 2>/dev/null || echo "⚠️  Seed skipped (may need manual setup)"
else
  echo "✅ Database already has $PLAN_COUNT plans — skipping seed"
fi

# ── 3. Ensure uploads directory exists ──
mkdir -p /app/uploads/receipts

# ── 4. Start the server ──
echo "🚀 Starting VentifyPOS server on port ${PORT:-3000}..."
exec node server.js
