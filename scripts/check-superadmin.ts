import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();

async function main() {
  // Find super admin
  const superAdmins = await db.user.findMany({
    where: { role: 'SUPER_ADMIN' },
    select: { id: true, email: true, fullName: true, role: true, cedula: true }
  });
  console.log('=== SUPER ADMINS ===');
  console.log(JSON.stringify(superAdmins, null, 2));

  for (const sa of superAdmins) {
    // Check if this user has a store linked
    const store = await db.store.findFirst({ where: { userId: sa.id } });
    console.log(`\nStore vinculada al super admin ${sa.id}:`, store ? store.name : 'NINGUNA');

    // Check if this user has an employee linked
    const employee = await db.employee.findFirst({ where: { userId: sa.id } });
    console.log(`Employee vinculado al super admin ${sa.id}:`, employee ? employee.fullName : 'NINGUNO');

    // Check cash registers
    const cashRegs = await db.cashRegister.findMany({ where: { userId: sa.id } });
    console.log(`Cash registers del super admin ${sa.id}:`, cashRegs.length);
  }

  // Show all users
  console.log('\n=== TODOS LOS USUARIOS ===');
  const allUsers = await db.user.findMany({
    select: { id: true, email: true, fullName: true, role: true, cedula: true }
  });
  for (const u of allUsers) {
    console.log(`  id:${u.id} | ${u.role} | ${u.email} | ${u.fullName}`);
  }

  // Show store info
  console.log('\n=== TIENDAS ===');
  const stores = await db.store.findMany({
    include: {
      user: { select: { id: true, email: true, role: true } },
      subscription: { include: { plan: { select: { name: true, price: true } } } },
      roles: { select: { id: true, name: true } },
      taxConfigs: { select: { id: true, name: true } },
      expenseCategories: { select: { id: true, name: true } },
      productCategories: { select: { id: true, name: true } },
    }
  });
  for (const s of stores) {
    console.log(`  🏪 ${s.name} (id:${s.id})`);
    console.log(`     Owner: ${s.user.email} (${s.user.role})`);
    console.log(`     Suscripción: ${s.subscription?.plan.name} (${s.subscription?.status})`);
    console.log(`     Roles: ${s.roles.length} | IVA: ${s.taxConfigs.length} | CatGastos: ${s.expenseCategories.length} | CatProductos: ${s.productCategories.length}`);
  }
}

main().finally(() => db.$disconnect());
