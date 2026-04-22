import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();

async function main() {
  const tables = [
    'plan', 'user', 'employee', 'store', 'subscription', 'role',
    'product', 'productCategory', 'customer', 'cashRegister',
    'order', 'orderItem', 'payment', 'serviceTransaction',
    'expense', 'expenseCategory', 'supplier', 'inventoryMovement',
    'table', 'reservation', 'notification', 'auditLog',
    'permission', 'permissionGroup', 'storeSetting', 'taxConfig',
    'discount', 'kitchenOrder', 'menuSection', 'menuSectionItem'
  ];

  for (const t of tables) {
    try {
      // @ts-expect-error dynamic access
      const count: number = await db[t].count();
      if (count > 0) {
        console.log(`\n✅ ${t}: ${count} registros`);
        if (count <= 10) {
          // @ts-expect-error dynamic access
          const records = await db[t].findMany({ take: 5 });
          for (const r of records) {
            const { id, createdAt, updatedAt, ...rest } = r as Record<string, unknown>;
            console.log(`   → ${(JSON.stringify(rest)).substring(0, 150)}`);
          }
        } else {
          console.log(`   (demasiados para mostrar detalle)`);
        }
      }
    } catch {
      // Table doesn't exist or model name wrong
    }
  }
}

main().finally(() => db.$disconnect());
