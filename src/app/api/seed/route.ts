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
            name: 'Tienda la Esperanza',
            currencyCode: 'MXN',
            countryCode: 'MX',
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
        { storeId, name: 'Compras', type: 'EXPENSE', isDefault: false },
        { storeId, name: 'Gastos Generales', type: 'EXPENSE', isDefault: false },
        { storeId, name: 'Inventario', type: 'ASSET', isDefault: false },
        { storeId, name: 'Cuentas por Cobrar', type: 'ASSET', isDefault: false },
        { storeId, name: 'Capital', type: 'EQUITY', isDefault: false },
      ],
    })

    await db.category.createMany({
      data: [
        { storeId, name: 'Abarrotes' },
        { storeId, name: 'Bebidas' },
        { storeId, name: 'Lácteos' },
        { storeId, name: 'Limpieza' },
        { storeId, name: 'Snacks' },
        { storeId, name: 'Panadería' },
      ],
    })

    const cats = await db.category.findMany({ where: { storeId } })

    const products = [
      { name: 'Arroz SOS 1kg', catId: cats.find(c => c.name === 'Abarrotes')!.id, cost: 1800, sale: 2200, stock: 50, min: 10, sku: 'ABR-001' },
      { name: 'Frijol Negro 1kg', catId: cats.find(c => c.name === 'Abarrotes')!.id, cost: 2800, sale: 3500, stock: 30, min: 8, sku: 'ABR-002' },
      { name: 'Aceite Vegetal 1L', catId: cats.find(c => c.name === 'Abarrotes')!.id, cost: 3200, sale: 3900, stock: 25, min: 5, sku: 'ABR-003' },
      { name: 'Azúcar Blanca 1kg', catId: cats.find(c => c.name === 'Abarrotes')!.id, cost: 2000, sale: 2500, stock: 40, min: 10, sku: 'ABR-004' },
      { name: 'Sal Fina 500g', catId: cats.find(c => c.name === 'Abarrotes')!.id, cost: 800, sale: 1200, stock: 60, min: 15, sku: 'ABR-005' },
      { name: 'Coca-Cola 600ml', catId: cats.find(c => c.name === 'Bebidas')!.id, cost: 1000, sale: 1500, stock: 100, min: 20, sku: 'BEB-001' },
      { name: 'Agua Mineral 1L', catId: cats.find(c => c.name === 'Bebidas')!.id, cost: 500, sale: 1000, stock: 80, min: 20, sku: 'BEB-002' },
      { name: 'Jugo de Naranja 1L', catId: cats.find(c => c.name === 'Bebidas')!.id, cost: 1500, sale: 2200, stock: 35, min: 10, sku: 'BEB-003' },
      { name: 'Cerveza Lager 355ml', catId: cats.find(c => c.name === 'Bebidas')!.id, cost: 1200, sale: 1800, stock: 48, min: 12, sku: 'BEB-004' },
      { name: 'Leche Entera 1L', catId: cats.find(c => c.name === 'Lácteos')!.id, cost: 1800, sale: 2400, stock: 30, min: 8, sku: 'LAC-001' },
      { name: 'Yogurt Natural 1kg', catId: cats.find(c => c.name === 'Lácteos')!.id, cost: 2800, sale: 3500, stock: 20, min: 5, sku: 'LAC-002' },
      { name: 'Queso Fresco 400g', catId: cats.find(c => c.name === 'Lácteos')!.id, cost: 4500, sale: 5800, stock: 15, min: 3, sku: 'LAC-003' },
      { name: 'Detergente en Polvo 1kg', catId: cats.find(c => c.name === 'Limpieza')!.id, cost: 3500, sale: 4500, stock: 20, min: 5, sku: 'LIM-001' },
      { name: 'Jabón de Lavandería 500g', catId: cats.find(c => c.name === 'Limpieza')!.id, cost: 1500, sale: 2200, stock: 25, min: 5, sku: 'LIM-002' },
      { name: 'Cloro 1L', catId: cats.find(c => c.name === 'Limpieza')!.id, cost: 1200, sale: 1800, stock: 18, min: 4, sku: 'LIM-003' },
      { name: 'Papas Fritas Grandes', catId: cats.find(c => c.name === 'Snacks')!.id, cost: 1200, sale: 1800, stock: 40, min: 10, sku: 'SNK-001' },
      { name: 'Galletas de Chocolate', catId: cats.find(c => c.name === 'Snacks')!.id, cost: 800, sale: 1500, stock: 55, min: 12, sku: 'SNK-002' },
      { name: 'Pan Blanco Paquete', catId: cats.find(c => c.name === 'Panadería')!.id, cost: 2500, sale: 3200, stock: 15, min: 5, sku: 'PAN-001' },
      { name: 'Tortillas de Maíz 1kg', catId: cats.find(c => c.name === 'Panadería')!.id, cost: 1500, sale: 2200, stock: 50, min: 15, sku: 'PAN-002' },
      { name: 'Café Molido 250g', catId: cats.find(c => c.name === 'Abarrotes')!.id, cost: 4000, sale: 5500, stock: 2, min: 5, sku: 'ABR-006' },
      { name: 'Chocolate en Barra', catId: cats.find(c => c.name === 'Snacks')!.id, cost: 1500, sale: 2500, stock: 0, min: 8, sku: 'SNK-003' },
    ]

    for (const p of products) {
      await db.product.create({
        data: {
          storeId, name: p.name, categoryId: p.catId, sku: p.sku,
          costPrice: p.cost, salePrice: p.sale, currentStock: p.stock, minStock: p.min,
          isActive: true, description: `${p.name} - Producto de calidad`,
        },
      })
    }

    const customersData = [
      { name: 'Roberto López', phone: '5598765432', email: 'roberto@email.com', debt: 15000 },
      { name: 'Ana Martínez', phone: '5511223344', email: 'ana@email.com', debt: 8500 },
      { name: 'Carlos Hernández', phone: '5533445566', email: null, debt: 0 },
      { name: 'Laura Sánchez', phone: '5577889900', email: 'laura@email.com', debt: 32000 },
      { name: 'Pedro Gómez', phone: '5544556677', email: null, debt: 0 },
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

    const orderData = [
      { custIdx: 0, status: 'COMPLETED', pay: 'CASH', hours: 2, items: [{ pIdx: 5, qty: 3 }, { pIdx: 9, qty: 2 }] },
      { custIdx: 1, status: 'COMPLETED', pay: 'CARD', hours: 4, items: [{ pIdx: 0, qty: 1 }, { pIdx: 2, qty: 1 }, { pIdx: 14, qty: 2 }] },
      { custIdx: 3, status: 'CREDIT', pay: 'MIXED', hours: 6, items: [{ pIdx: 7, qty: 4 }, { pIdx: 15, qty: 3 }] },
      { custIdx: -1, status: 'COMPLETED', pay: 'CASH', hours: 8, items: [{ pIdx: 5, qty: 2 }, { pIdx: 11, qty: 1 }] },
      { custIdx: 2, status: 'COMPLETED', pay: 'CASH', hours: 12, items: [{ pIdx: 17, qty: 3 }, { pIdx: 6, qty: 5 }] },
      { custIdx: -1, status: 'COMPLETED', pay: 'CASH', hours: 24, items: [{ pIdx: 1, qty: 2 }, { pIdx: 3, qty: 1 }] },
      { custIdx: 0, status: 'COMPLETED', pay: 'TRANSFER', hours: 36, items: [{ pIdx: 8, qty: 6 }] },
    ]

    for (const o of orderData) {
      const itemsData = o.items.map(item => {
        const product = allProducts[item.pIdx]
        return { productId: product.id, quantity: item.qty, unitPrice: product.salePrice, totalRow: product.salePrice * item.qty }
      })
      const subtotal = itemsData.reduce((sum, i) => sum + i.totalRow, 0)
      const date = new Date(Date.now() - o.hours * 3600000)
      const orderNum = `TK-${date.toISOString().slice(2, 10).replace(/-/g, '')}-${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`

      const order = await db.order.create({
        data: {
          storeId,
          customerId: o.custIdx >= 0 ? createdCustomers[o.custIdx].id : null,
          orderNumber: orderNum,
          subtotal, total: subtotal,
          status: o.status, paymentMethod: o.pay,
          createdAt: date,
          orderItems: { create: itemsData },
        },
      })

      if (o.status === 'COMPLETED' && caja && ventas) {
        await db.journalEntry.createMany({
          data: [
            { storeId, ledgerAccountId: caja.id, amount: subtotal, direction: 'DEBIT', description: `Venta ${orderNum}`, referenceType: 'ORDER', referenceId: order.id, createdAt: date },
            { storeId, ledgerAccountId: ventas.id, amount: subtotal, direction: 'CREDIT', description: `Venta ${orderNum}`, referenceType: 'ORDER', referenceId: order.id, createdAt: date },
          ],
        })
      }
    }

    await db.inventoryMovement.create({
      data: {
        storeId, productId: allProducts[0].id, quantity: 20, movementType: 'PURCHASE',
        notes: 'Reposición semanal', createdAt: new Date(Date.now() - 48 * 3600000),
      },
    })

    await db.serviceTransaction.createMany({
      data: [
        { storeId, provider: 'TELCEL', transactionType: 'TOPUP', amount: 10000, commissionEarned: 300, status: 'SUCCESS', externalId: 'TXN-001', createdAt: new Date(Date.now() - 3 * 3600000) },
        { storeId, provider: 'TELCEL', transactionType: 'TOPUP', amount: 5000, commissionEarned: 150, status: 'SUCCESS', externalId: 'TXN-002', createdAt: new Date(Date.now() - 6 * 3600000) },
        { storeId, provider: 'CFE', transactionType: 'BILL_PAYMENT', amount: 85000, commissionEarned: 850, status: 'SUCCESS', externalId: 'TXN-003', createdAt: new Date(Date.now() - 12 * 3600000) },
        { storeId, provider: 'AT&T', transactionType: 'TOPUP', amount: 20000, commissionEarned: 600, status: 'PENDING', externalId: 'TXN-004', createdAt: new Date(Date.now() - 1 * 3600000) },
      ],
    })

    return NextResponse.json({
      message: 'Datos de ejemplo creados exitosamente',
      seeded: true,
      login: { phone: '5512345678', password: '123456' },
      stats: { users: 1, stores: 1, products: products.length, customers: customersData.length, orders: orderData.length },
    })
  } catch (error) {
    console.error('Seed error:', error)
    return NextResponse.json({ error: 'Error al crear datos de ejemplo' }, { status: 500 })
  }
}
