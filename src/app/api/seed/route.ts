import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { hashPassword } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function POST() {
  try {
    const existingUsers = await db.user.count()
    if (existingUsers > 0) {
      return NextResponse.json({ message: 'Ya existen datos en la base de datos', seeded: false })
    }

    const passwordHash = await hashPassword('123456')

    const user = await db.user.create({
      data: {
        phone: '5512345678',
        email: 'tienda@ejemplo.com',
        passwordHash,
        fullName: 'María García',
        role: 'OWNER',
        store: {
          create: {
            name: 'Bodega Bavaria',
            currencyCode: 'COP',
            countryCode: 'CO',
          },
        },
      },
      include: { store: true },
    })

    const storeId = user.store!.id

    await db.ledgerAccount.createMany({
      data: [
        { storeId, name: 'Caja General', type: 'ASSET', isDefault: true },
        { storeId, name: 'Banco', type: 'ASSET', isDefault: false },
        { storeId, name: 'Ventas', type: 'INCOME', isDefault: false },
        { storeId, name: 'Comisiones', type: 'INCOME', isDefault: false },
        { storeId, name: 'Compras', type: 'EXPENSE', isDefault: false },
        { storeId, name: 'Gastos Generales', type: 'EXPENSE', isDefault: false },
        { storeId, name: 'Inventario', type: 'ASSET', isDefault: false },
        { storeId, name: 'Cuentas por Cobrar', type: 'ASSET', isDefault: false },
        { storeId, name: 'Capital', type: 'EQUITY', isDefault: false },
      ],
    })

    await db.category.createMany({
      data: [
        { storeId, name: 'Cervezas Lager' },
        { storeId, name: 'Cervezas Premium' },
        { storeId, name: 'Cervezas Especiales' },
        { storeId, name: 'Malta y Bebidas' },
        { storeId, name: 'Promociones' },
      ],
    })

    const cats = await db.category.findMany({ where: { storeId } })

    // ─── Bavaria Products ──────────────────────────────────────────
    // Prices in COP cents (e.g. 3500 = $3.500 COP)
    const products = [
      // Cervezas Lager
      { name: 'Cerveza Águila 330ml', catId: cats.find(c => c.name === 'Cervezas Lager')!.id, cost: 1300, sale: 2000, stock: 120, min: 24, sku: 'BAV-001', desc: 'La cerveza colombiana por excelencia' },
      { name: 'Cerveza Águila 6-Pack', catId: cats.find(c => c.name === 'Cervezas Lager')!.id, cost: 7500, sale: 10500, stock: 40, min: 10, sku: 'BAV-002', desc: 'Pack de 6 unidades Águila 330ml' },
      { name: 'Cerveza Poker 330ml', catId: cats.find(c => c.name === 'Cervezas Lager')!.id, cost: 1300, sale: 2000, stock: 100, min: 24, sku: 'BAV-003', desc: 'La cervecita de todos' },
      { name: 'Cerveza Poker 6-Pack', catId: cats.find(c => c.name === 'Cervezas Lager')!.id, cost: 7500, sale: 10500, stock: 35, min: 10, sku: 'BAV-004', desc: 'Pack de 6 unidades Poker 330ml' },
      { name: 'Cerveza Costeña 330ml', catId: cats.find(c => c.name === 'Cervezas Lager')!.id, cost: 1200, sale: 1800, stock: 80, min: 20, sku: 'BAV-005', desc: 'Cerveza costeña refrescante' },
      { name: 'Cerveza Pilsen 330ml', catId: cats.find(c => c.name === 'Cervezas Lager')!.id, cost: 1300, sale: 2000, stock: 90, min: 20, sku: 'BAV-006', desc: 'Cerveza Pilsen tradición colombiana' },
      { name: 'Cerveza Brava 330ml', catId: cats.find(c => c.name === 'Cervezas Lager')!.id, cost: 1100, sale: 1700, stock: 70, min: 15, sku: 'BAV-007', desc: 'Cerveza Brava sabor intenso' },

      // Cervezas Premium
      { name: 'Club Colombia Dorada 355ml', catId: cats.find(c => c.name === 'Cervezas Premium')!.id, cost: 2200, sale: 3200, stock: 60, min: 12, sku: 'BAV-010', desc: 'Cerveza premium dorada' },
      { name: 'Club Colombia Roja 355ml', catId: cats.find(c => c.name === 'Cervezas Premium')!.id, cost: 2400, sale: 3500, stock: 50, min: 12, sku: 'BAV-011', desc: 'Cerveza premium roja con cuerpo' },
      { name: 'Club Colombia Negra 355ml', catId: cats.find(c => c.name === 'Cervezas Premium')!.id, cost: 2600, sale: 3800, stock: 40, min: 10, sku: 'BAV-012', desc: 'Cerveza premium negra estilo Munich' },
      { name: 'Águila Light 330ml', catId: cats.find(c => c.name === 'Cervezas Premium')!.id, cost: 1500, sale: 2300, stock: 55, min: 12, sku: 'BAV-013', desc: 'Baja en calorías, todo el sabor' },
      { name: 'Poker Red 330ml', catId: cats.find(c => c.name === 'Cervezas Premium')!.id, cost: 1600, sale: 2500, stock: 45, min: 10, sku: 'BAV-014', desc: 'Cerveza roja con toque de caramelo' },

      // Cervezas Especiales
      { name: 'Amparada APA 355ml', catId: cats.find(c => c.name === 'Cervezas Especiales')!.id, cost: 3500, sale: 5500, stock: 24, min: 6, sku: 'BAV-020', desc: 'American Pale Ale de Bavaria' },
      { name: 'Cerveza Costeñita 296ml', catId: cats.find(c => c.name === 'Cervezas Especiales')!.id, cost: 900, sale: 1500, stock: 100, min: 24, sku: 'BAV-021', desc: 'La cervecita costeña pequeña' },
      { name: 'Poker Trópico 330ml', catId: cats.find(c => c.name === 'Cervezas Especiales')!.id, cost: 1400, sale: 2200, stock: 3, min: 10, sku: 'BAV-022', desc: 'Edición limitada sabor tropical' },
      { name: 'Águila Zero 330ml', catId: cats.find(c => c.name === 'Cervezas Especiales')!.id, cost: 1600, sale: 2500, stock: 0, min: 8, sku: 'BAV-023', desc: 'Sin alcohol, puro sabor Águila' },

      // Malta y Bebidas
      { name: 'Malta Leona 350ml', catId: cats.find(c => c.name === 'Malta y Bebidas')!.id, cost: 800, sale: 1500, stock: 80, min: 20, sku: 'BAV-030', desc: 'Malta energizante tradicional' },
      { name: 'Pony Malta 235ml', catId: cats.find(c => c.name === 'Malta y Bebidas')!.id, cost: 600, sale: 1200, stock: 100, min: 24, sku: 'BAV-031', desc: 'Malta nutritiva para toda la familia' },
      { name: 'Pony Malta Familiar 1L', catId: cats.find(c => c.name === 'Malta y Bebidas')!.id, cost: 2200, sale: 3800, stock: 30, min: 8, sku: 'BAV-032', desc: 'Formato familiar 1 litro' },
      { name: 'Agua Cristal 600ml', catId: cats.find(c => c.name === 'Malta y Bebidas')!.id, cost: 400, sale: 1000, stock: 200, min: 48, sku: 'BAV-033', desc: 'Agua purificada Bavaria' },

      // Promociones
      { name: 'Combo Caguama Poker 1.2L', catId: cats.find(c => c.name === 'Promociones')!.id, cost: 4500, sale: 7500, stock: 20, min: 5, sku: 'BAV-040', desc: 'Caguama grande de Poker para compartir' },
      { name: 'Combo Caguama Águila 1.2L', catId: cats.find(c => c.name === 'Promociones')!.id, cost: 4500, sale: 7500, stock: 20, min: 5, sku: 'BAV-041', desc: 'Caguama grande de Águila para compartir' },
      { name: 'Pack 12 Águila Latas', catId: cats.find(c => c.name === 'Promociones')!.id, cost: 14500, sale: 20000, stock: 15, min: 5, sku: 'BAV-042', desc: 'Pack de 12 latas de Águila 330ml' },
      { name: 'Pack 12 Poker Latas', catId: cats.find(c => c.name === 'Promociones')!.id, cost: 14500, sale: 20000, stock: 15, min: 5, sku: 'BAV-043', desc: 'Pack de 12 latas de Poker 330ml' },
      { name: 'Combo Fiesta 24 Latas Mixtas', catId: cats.find(c => c.name === 'Promociones')!.id, cost: 28000, sale: 38000, stock: 8, min: 3, sku: 'BAV-044', desc: '12 Águila + 12 Poker para tu fiesta' },
    ]

    for (const p of products) {
      await db.product.create({
        data: {
          storeId,
          name: p.name,
          categoryId: p.catId,
          sku: p.sku,
          costPrice: p.cost,
          salePrice: p.sale,
          currentStock: p.stock,
          minStock: p.min,
          isActive: true,
          description: p.desc,
        },
      })
    }

    const customersData = [
      { name: 'Roberto López', phone: '3101234567', email: 'roberto@email.com', debt: 45000 },
      { name: 'Ana Martínez', phone: '3209876543', email: 'ana@email.com', debt: 25000 },
      { name: 'Carlos Hernández', phone: '3155551234', email: null, debt: 0 },
      { name: 'Laura Sánchez', phone: '3124448899', email: 'laura@email.com', debt: 96000 },
      { name: 'Pedro Gómez', phone: '3186667788', email: null, debt: 0 },
    ]

    const createdCustomers: Array<{ id: number }> = []
    for (const c of customersData) {
      const customer = await db.customer.create({
        data: { storeId, name: c.name, phone: c.phone, email: c.email, totalDebt: c.debt },
      })
      createdCustomers.push(customer)
    }

    const allProducts = await db.product.findMany({ where: { storeId } })
    const caja = await db.ledgerAccount.findFirst({ where: { storeId, name: 'Caja General' } })
    const ventas = await db.ledgerAccount.findFirst({ where: { storeId, name: 'Ventas' } })

    // ─── Sample Orders ─────────────────────────────────────────────
    const orderData = [
      { custIdx: 0, status: 'COMPLETED', pay: 'CASH', hours: 2, items: [{ pIdx: 0, qty: 3 }, { pIdx: 7, qty: 2 }] },
      { custIdx: 1, status: 'COMPLETED', pay: 'CARD', hours: 4, items: [{ pIdx: 2, qty: 1 }, { pIdx: 14, qty: 3 }, { pIdx: 16, qty: 1 }] },
      { custIdx: 3, status: 'CREDIT', pay: 'MREDIT', hours: 6, items: [{ pIdx: 1, qty: 2 }, { pIdx: 5, qty: 4 }] },
      { custIdx: -1, status: 'COMPLETED', pay: 'CASH', hours: 8, items: [{ pIdx: 0, qty: 6 }, { pIdx: 2, qty: 6 }] },
      { custIdx: 2, status: 'COMPLETED', pay: 'CASH', hours: 12, items: [{ pIdx: 9, qty: 2 }, { pIdx: 15, qty: 5 }] },
      { custIdx: -1, status: 'COMPLETED', pay: 'TRANSFER', hours: 24, items: [{ pIdx: 7, qty: 3 }, { pIdx: 8, qty: 3 }] },
      { custIdx: 0, status: 'COMPLETED', pay: 'CASH', hours: 36, items: [{ pIdx: 4, qty: 12 }, { pIdx: 10, qty: 6 }] },
      { custIdx: -1, status: 'COMPLETED', pay: 'CARD', hours: 48, items: [{ pIdx: 20, qty: 1 }, { pIdx: 14, qty: 4 }] },
    ]

    for (const o of orderData) {
      const itemsData = o.items.map(item => {
        const product = allProducts[item.pIdx]
        return { productId: product.id, quantity: item.qty, unitPrice: product.salePrice, totalRow: product.salePrice * item.qty }
      })
      const subtotal = itemsData.reduce((sum, i) => sum + i.totalRow, 0)
      const date = new Date(Date.now() - o.hours * 3600000)
      const orderNum = `TK-${date.toISOString().slice(2, 10).replace(/-/g, '')}-${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`

      const status = o.pay === 'MREDIT' ? 'CREDIT' : o.status
      const paymentMethod = o.pay === 'MREDIT' ? 'CREDIT' : o.pay

      const order = await db.order.create({
        data: {
          storeId,
          customerId: o.custIdx >= 0 ? createdCustomers[o.custIdx].id : null,
          orderNumber: orderNum,
          subtotal,
          total: subtotal,
          status,
          paymentMethod,
          createdAt: date,
          orderItems: { create: itemsData },
        },
      })

      if (status === 'COMPLETED' && caja && ventas) {
        await db.journalEntry.createMany({
          data: [
            { storeId, ledgerAccountId: caja.id, amount: subtotal, direction: 'DEBIT', description: `Venta ${orderNum}`, referenceType: 'ORDER', referenceId: order.id, createdAt: date },
            { storeId, ledgerAccountId: ventas.id, amount: subtotal, direction: 'CREDIT', description: `Venta ${orderNum}`, referenceType: 'ORDER', referenceId: order.id, createdAt: date },
          ],
        })
      }
    }

    // Sample inventory movement
    await db.inventoryMovement.create({
      data: {
        storeId,
        productId: allProducts[0].id,
        quantity: 48,
        movementType: 'PURCHASE',
        notes: 'Reposición semanal Águila',
        createdAt: new Date(Date.now() - 48 * 3600000),
      },
    })

    await db.inventoryMovement.create({
      data: {
        storeId,
        productId: allProducts[7].id,
        quantity: 24,
        movementType: 'PURCHASE',
        notes: 'Reposición semanal Club Colombia Dorada',
        createdAt: new Date(Date.now() - 48 * 3600000),
      },
    })

    // Sample service transactions
    await db.serviceTransaction.createMany({
      data: [
        { storeId, provider: 'CLARO', transactionType: 'TOPUP', amount: 10000, commissionEarned: 300, status: 'SUCCESS', externalId: 'TXN-001', createdAt: new Date(Date.now() - 3 * 3600000) },
        { storeId, provider: 'MOVISTAR', transactionType: 'TOPUP', amount: 5000, commissionEarned: 150, status: 'SUCCESS', externalId: 'TXN-002', createdAt: new Date(Date.now() - 6 * 3600000) },
        { storeId, provider: 'TUENA', transactionType: 'BILL_PAYMENT', amount: 85000, commissionEarned: 850, status: 'SUCCESS', externalId: 'TXN-003', createdAt: new Date(Date.now() - 12 * 3600000) },
        { storeId, provider: 'CLARO', transactionType: 'TOPUP', amount: 20000, commissionEarned: 600, status: 'PENDING', externalId: 'TXN-004', createdAt: new Date(Date.now() - 1 * 3600000) },
      ],
    })

    return NextResponse.json({
      message: 'Datos de ejemplo creados exitosamente — Bavaria POS',
      seeded: true,
      login: { phone: '5512345678', password: '123456' },
      stats: { users: 1, stores: 1, products: products.length, customers: customersData.length, orders: orderData.length },
    })
  } catch (error) {
    console.error('Seed error:', error)
    return NextResponse.json({ error: 'Error al crear datos de ejemplo' }, { status: 500 })
  }
}
