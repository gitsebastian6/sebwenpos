import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();

async function main() {
  console.log('=== ESTADO FINAL DE LA BASE DE DATOS ===\n');

  // Global
  const plans = await db.plan.findMany({ select: { name: true, price: true } });
  console.log(`🌐 PLANES GLOBALES: ${plans.length}`);
  for (const p of plans) console.log(`   ✅ ${p.name} - $${p.price.toLocaleString()}`);

  // Store
  const stores = await db.store.findMany({
    include: { user: { select: { email: true, role: true } }, subscription: { include: { plan: { select: { name: true } } } } }
  });
  console.log(`\n🏪 TIENDAS: ${stores.length}`);
  for (const s of stores) console.log(`   ✅ ${s.name} | Owner: ${s.user.email} | Plan: ${s.subscription?.plan.name}`);

  // Auto-created data
  const roles = await db.role.count();
  const taxRates = await db.taxRate.count();
  const categories = await db.category.count();
  const ledgerAccounts = await db.ledgerAccount.count();

  console.log(`\n📦 DATOS AUTO-CREADOS DE TIENDA:`);
  console.log(`   ✅ Roles: ${roles}`);
  console.log(`   ✅ Tasas IVA: ${taxRates}`);
  console.log(`   ✅ Categorías: ${categories}`);
  console.log(`   ✅ Cuentas contables: ${ledgerAccounts}`);

  // Users
  const users = await db.user.findMany({ select: { id: true, email: true, role: true } });
  console.log(`\n👤 USUARIOS: ${users.length}`);
  for (const u of users) console.log(`   ✅ ${u.email} (${u.role})`);

  // Empty tables verification
  const emptyChecks = [
    ['Employees', db.employee.count()],
    ['Cash Registers', db.cashRegister.count()],
    ['Products', db.product.count()],
    ['Orders', db.order.count()],
    ['Customers', db.customer.count()],
    ['Expenses', db.expense.count()],
    ['Services', db.service.count()],
    ['Inventory Movements', db.inventoryMovement.count()],
  ];

  console.log(`\n📋 TABLAS VACÍAS:`);
  for (const [name, count] of emptyChecks) {
    console.log(`   ⬜ ${name}: ${await count}`);
  }

  // Confirm NO super admin
  const superAdmin = await db.user.findFirst({ where: { role: 'SUPER_ADMIN' } });
  console.log(`\n🚫 Super Admin: ${superAdmin ? 'EXISTS (ERROR)' : 'ELIMINADO (OK)'}`);
}

main().finally(() => db.$disconnect());
