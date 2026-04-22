import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
const stores = await p.store.findMany({
  include: { user: { select: { id: true, cedula: true, role: true, fullName: true } } },
  orderBy: { id: 'asc' }
});
for (const s of stores) {
  console.log(`Store ${s.id}: "${s.name}" parentStoreId=${s.parentStoreId} user=${s.user?.cedula} (${s.user?.role})`);
}
console.log(`\nTotal stores: ${stores.length}`);
await p.$disconnect();
