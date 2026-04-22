const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  try {
    const r = await p.paymentReceipt.findMany({ where: { storeId: 6 }, orderBy: { id: 'desc' }, take: 5 });
    console.log(JSON.stringify(r, null, 2));
  } catch(e) { console.error(e.message); }
  await p.$disconnect();
})();
