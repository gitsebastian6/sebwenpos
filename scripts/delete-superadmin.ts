import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();

async function main() {
  // 1. Delete super admin
  const superAdmin = await db.user.findFirst({ where: { role: 'SUPER_ADMIN' } });
  if (!superAdmin) {
    console.log('❌ No se encontró super admin para borrar');
    return;
  }

  console.log(`🗑️  Eliminando Super Admin: id=${superAdmin.id}, email=${superAdmin.email}`);

  await db.user.delete({ where: { id: superAdmin.id } });
  console.log('✅ Super Admin eliminado correctamente');

  // 2. Verify remaining data
  console.log('\n=== VERIFICACIÓN POST-BORRADO ===');

  const plans = await db.plan.count();
  console.log(`✅ Planes: ${plans} (globales intactos)`);

  const users = await db.user.findMany({
    select: { id: true, email: true, role: true, fullName: true }
  });
  console.log(`✅ Usuarios restantes: ${users.length}`);
  for (const u of users) {
    console.log(`   → id:${u.id} | ${u.role} | ${u.email} | ${u.fullName}`);
  }

  const stores = await db.store.findMany({
    include: {
      user: { select: { email: true } },
      subscription: { include: { plan: { select: { name: true } } } }
    }
  });
  console.log(`✅ Tiendas: ${stores.length}`);
  for (const s of stores) {
    console.log(`   → ${s.name} | Owner: ${s.user.email} | Plan: ${s.subscription?.plan.name}`);
  }

  const roles = await db.role.count();
  const taxRates = await db.taxRate.count();
  const prodCats = await db.productCategory.count();
  const expCats = await db.expenseCategory.count();
  const ledgerAccounts = await db.ledgerAccount.count();
  console.log(`✅ Roles: ${roles} | IVA: ${taxRates} | CatProductos: ${prodCats} | CatGastos: ${expCats} | CtasContables: ${ledgerAccounts}`);
}

main().finally(() => db.$disconnect());
