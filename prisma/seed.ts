import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Iniciando siembra de datos...')

  // Limpieza total
  await prisma.purchaseItem.deleteMany()
  await prisma.purchase.deleteMany()
  await prisma.comandaItem.deleteMany()
  await prisma.orderItem.deleteMany()
  await prisma.inventoryMovement.deleteMany()
  await prisma.journalEntry.deleteMany()
  await prisma.tableSession.deleteMany()
  await prisma.order.deleteMany()
  await prisma.serviceTransaction.deleteMany()
  await prisma.service.deleteMany()
  await prisma.ledgerAccount.deleteMany()
  await prisma.barTable.deleteMany()
  await prisma.customer.deleteMany()
  await prisma.provider.deleteMany()
  await prisma.product.deleteMany()
  await prisma.category.deleteMany()
  await prisma.store.deleteMany()
  await prisma.user.deleteMany()

  // =============================================
  // 1. USUARIO Y TIENDA
  // =============================================
  const passwordHash = await bcrypt.hash('1234', 10)

  const user = await prisma.user.create({
    data: {
      phone: '3001234567',
      email: 'admin@ventify.com',
      passwordHash,
      fullName: 'Carlos Bar Manager',
      role: 'OWNER',
      store: {
        create: {
          name: 'Bar La Terraza',
          currencyCode: 'COP',
          countryCode: 'CO',
        },
      },
    },
    include: { store: true },
  })

  const storeId = user.store!.id
  console.log(`✅ Usuario: ${user.phone} → Tienda: ${user.store!.name} (ID: ${storeId})`)

  // =============================================
  // 2. CATEGORÍAS
  // =============================================
  const categoryNames = [
    'Cervezas Bavaria', 'Cervezas Importadas', 'Cigarrillos',
    'Cigarrillos por Unidad',
    'Licores', 'Snacks', 'Bebidas No Alcohólicas', 'Cocteles',
  ]

  const categories = []
  for (const name of categoryNames) {
    categories.push(await prisma.category.create({ data: { storeId, name } }))
  }
  console.log(`✅ ${categories.length} categorías`)

  // =============================================
  // 3. PRODUCTOS (Precios en centavos COP)
  // =============================================
  const bavaria = [
    { name: 'Aguila Light Botella 330ml', salePrice: 4500, costPrice: 2200, stock: 120 },
    { name: 'Aguila Light Lata 355ml', salePrice: 4200, costPrice: 2000, stock: 150 },
    { name: 'Aguila Original Botella 330ml', salePrice: 4500, costPrice: 2200, stock: 80 },
    { name: 'Aguila Original Lata 355ml', salePrice: 4200, costPrice: 2000, stock: 100 },
    { name: 'Poker Lata 355ml', salePrice: 4800, costPrice: 2400, stock: 100 },
    { name: 'Poker Botella 330ml', salePrice: 5000, costPrice: 2500, stock: 80 },
    { name: 'Club Colombia Dorada Lata 355ml', salePrice: 5500, costPrice: 2800, stock: 80 },
    { name: 'Club Colombia Dorada Botella 330ml', salePrice: 5800, costPrice: 2900, stock: 60 },
    { name: 'Club Colombia Negra Lata 355ml', salePrice: 6000, costPrice: 3100, stock: 50 },
    { name: 'Club Colombia Negra Botella 330ml', salePrice: 6200, costPrice: 3200, stock: 40 },
    { name: 'Costeña Lata 355ml', salePrice: 5000, costPrice: 2500, stock: 60 },
    { name: 'Costeña Botella 330ml', salePrice: 5200, costPrice: 2600, stock: 50 },
    { name: 'Pilsen Lata 355ml', salePrice: 3800, costPrice: 1800, stock: 100 },
    { name: 'Pilsen Botella 330ml', salePrice: 4000, costPrice: 1900, stock: 80 },
    { name: 'Brahma Lata 355ml', salePrice: 4400, costPrice: 2100, stock: 70 },
    { name: 'Brahma Botella 330ml', salePrice: 4600, costPrice: 2200, stock: 50 },
    { name: 'Poker Red IPA Lata 440ml', salePrice: 7500, costPrice: 4000, stock: 30 },
    { name: 'Poker Black Lata 355ml', salePrice: 5500, costPrice: 2800, stock: 40 },
    { name: 'Aguila Shandy Lata 355ml', salePrice: 4800, costPrice: 2500, stock: 50 },
    { name: 'Club Colombia Red Lager Lata', salePrice: 8000, costPrice: 4200, stock: 25 },
    { name: 'Club Colombia Trigo Lata 355ml', salePrice: 7200, costPrice: 3800, stock: 20 },
    { name: 'Costeñita Lata 330ml', salePrice: 3500, costPrice: 1700, stock: 80 },
    { name: 'Pony Malta 330ml', salePrice: 2500, costPrice: 1200, stock: 100 },
    { name: 'Pony Malta 500ml', salePrice: 3500, costPrice: 1600, stock: 80 },
    { name: 'Aguila Zero Lata 355ml', salePrice: 4500, costPrice: 2200, stock: 60 },
    { name: 'Poker Sin Alcohol Lata 355ml', salePrice: 4800, costPrice: 2400, stock: 40 },
  ]

  const imported = [
    { name: 'Corona Extra Botella 355ml', salePrice: 8000, costPrice: 5000, stock: 48 },
    { name: 'Heineken Lata 330ml', salePrice: 7500, costPrice: 4500, stock: 48 },
    { name: 'Budweiser Lata 355ml', salePrice: 7000, costPrice: 4200, stock: 36 },
    { name: 'Stella Artois Lata 330ml', salePrice: 8500, costPrice: 5200, stock: 36 },
    { name: 'Miller Genuine Draft Lata', salePrice: 6800, costPrice: 4000, stock: 30 },
    { name: 'Guinness Draught Lata 440ml', salePrice: 10000, costPrice: 6500, stock: 24 },
    { name: 'Samuel Adams Lata 355ml', salePrice: 12000, costPrice: 8000, stock: 18 },
    { name: 'Sierra Nevada Pale Ale Lata', salePrice: 11000, costPrice: 7000, stock: 18 },
    { name: 'Modelo Especial Lata 355ml', salePrice: 7500, costPrice: 4500, stock: 36 },
    { name: 'Patagonia Amber Lager Lata', salePrice: 9500, costPrice: 5800, stock: 24 },
  ]

  const cigs = [
    { name: 'Marlboro Red Cajetilla 20', salePrice: 7500, costPrice: 5200, stock: 30 },
    { name: 'Marlboro Lights Cajetilla 20', salePrice: 7500, costPrice: 5200, stock: 25 },
    { name: 'Marlboro Ice Blast Cajetilla 20', salePrice: 8200, costPrice: 5800, stock: 20 },
    { name: 'Camel Filters Cajetilla 20', salePrice: 7200, costPrice: 5000, stock: 20 },
    { name: 'Camel Blue Cajetilla 20', salePrice: 7200, costPrice: 5000, stock: 18 },
    { name: 'Winston Red Cajetilla 20', salePrice: 6500, costPrice: 4500, stock: 25 },
    { name: 'Winston Blue Cajetilla 20', salePrice: 6500, costPrice: 4500, stock: 22 },
    { name: 'Lucky Strike Red Cajetilla 20', salePrice: 7000, costPrice: 4800, stock: 20 },
    { name: 'Lucky Strike Blue Cajetilla 20', salePrice: 7000, costPrice: 4800, stock: 18 },
    { name: 'Pielroja Cajetilla 20', salePrice: 4500, costPrice: 2800, stock: 35 },
    { name: 'Derby Cajetilla 20', salePrice: 4200, costPrice: 2600, stock: 30 },
    { name: 'Belmont Cajetilla 20', salePrice: 5500, costPrice: 3500, stock: 25 },
    { name: 'Fox Cajetilla 20', salePrice: 3800, costPrice: 2200, stock: 40 },
    { name: 'Jinja Cajetilla 20', salePrice: 4000, costPrice: 2500, stock: 35 },
    { name: 'Prestige Cajetilla 20', salePrice: 3600, costPrice: 2100, stock: 30 },
    { name: 'Mustang Cajetilla 20', salePrice: 3200, costPrice: 1800, stock: 40 },
  ]

  const cigUnits = [
    { name: 'Marlboro Red Unidad', salePrice: 500, costPrice: 260, stock: 500 },
    { name: 'Marlboro Lights Unidad', salePrice: 500, costPrice: 260, stock: 500 },
    { name: 'Marlboro Ice Blast Unidad', salePrice: 550, costPrice: 290, stock: 400 },
    { name: 'Camel Filters Unidad', salePrice: 480, costPrice: 250, stock: 400 },
    { name: 'Camel Blue Unidad', salePrice: 480, costPrice: 250, stock: 360 },
    { name: 'Winston Red Unidad', salePrice: 420, costPrice: 225, stock: 500 },
    { name: 'Winston Blue Unidad', salePrice: 420, costPrice: 225, stock: 440 },
    { name: 'Lucky Strike Red Unidad', salePrice: 460, costPrice: 240, stock: 400 },
    { name: 'Lucky Strike Blue Unidad', salePrice: 460, costPrice: 240, stock: 360 },
    { name: 'Pielroja Unidad', salePrice: 300, costPrice: 140, stock: 600 },
    { name: 'Derby Unidad', salePrice: 280, costPrice: 130, stock: 550 },
    { name: 'Belmont Unidad', salePrice: 360, costPrice: 175, stock: 450 },
    { name: 'Fox Unidad', salePrice: 250, costPrice: 110, stock: 700 },
    { name: 'Jinja Unidad', salePrice: 270, costPrice: 125, stock: 600 },
    { name: 'Prestige Unidad', salePrice: 240, costPrice: 105, stock: 600 },
    { name: 'Mustang Unidad', salePrice: 220, costPrice: 90, stock: 700 },
  ]

  const liquors = [
    { name: 'Aguardiente Antioqueño Sin Azúcar 750ml', salePrice: 55000, costPrice: 35000, stock: 12 },
    { name: 'Aguardiente Antioqueño 750ml', salePrice: 48000, costPrice: 30000, stock: 15 },
    { name: 'Ron Medellín 8 Años 750ml', salePrice: 65000, costPrice: 42000, stock: 10 },
    { name: 'Ron Medellín Reserva 12 Años 750ml', salePrice: 85000, costPrice: 58000, stock: 6 },
    { name: 'Ron Viejo de Caldas 750ml', salePrice: 52000, costPrice: 33000, stock: 12 },
    { name: 'Ron Santafereño 750ml', salePrice: 45000, costPrice: 28000, stock: 10 },
    { name: 'Whisky Old Parr 12 Años 750ml', salePrice: 120000, costPrice: 85000, stock: 6 },
    { name: 'Whisky Buchanan 12 Años 750ml', salePrice: 135000, costPrice: 95000, stock: 5 },
    { name: 'Vodka Absolut 750ml', salePrice: 85000, costPrice: 55000, stock: 8 },
    { name: 'Vodka Smirnoff 750ml', salePrice: 65000, costPrice: 40000, stock: 8 },
    { name: 'Tequila José Cuervo Gold 750ml', salePrice: 90000, costPrice: 58000, stock: 6 },
    { name: 'Tequila Don Julio Blanco 750ml', salePrice: 150000, costPrice: 100000, stock: 4 },
    { name: 'Gin Gordon´s 750ml', salePrice: 75000, costPrice: 48000, stock: 6 },
    { name: 'Gin Hendricks 750ml', salePrice: 180000, costPrice: 130000, stock: 3 },
    { name: 'Refajo Costeño', salePrice: 8000, costPrice: 4000, stock: 30 },
  ]

  const snacks = [
    { name: 'Nachos con Guacamole', salePrice: 12000, costPrice: 5000, stock: 20 },
    { name: 'Papas Fritas Colombianas', salePrice: 8000, costPrice: 3000, stock: 30 },
    { name: 'Chicharrón Colombiano', salePrice: 10000, costPrice: 4000, stock: 25 },
    { name: 'Empanada Colombiana', salePrice: 6000, costPrice: 2000, stock: 40 },
    { name: 'Patacón con Hogao', salePrice: 9000, costPrice: 3500, stock: 25 },
    { name: 'Arepas con Queso', salePrice: 7000, costPrice: 2500, stock: 30 },
    { name: 'Mango Biche con Limón y Sal', salePrice: 5000, costPrice: 1500, stock: 50 },
    { name: 'Plátano Maduro Frito', salePrice: 6000, costPrice: 2000, stock: 35 },
  ]

  const nonAlc = [
    { name: 'Coca-Cola Personal 400ml', salePrice: 3500, costPrice: 1800, stock: 80 },
    { name: 'Coca-Cola 600ml', salePrice: 4500, costPrice: 2200, stock: 60 },
    { name: 'Pepsi Personal 400ml', salePrice: 3200, costPrice: 1600, stock: 60 },
    { name: 'Postobón Manzana 400ml', salePrice: 2800, costPrice: 1400, stock: 70 },
    { name: 'Postobón Uva 400ml', salePrice: 2800, costPrice: 1400, stock: 70 },
    { name: 'Postobón Cola 400ml', salePrice: 2800, costPrice: 1400, stock: 70 },
    { name: 'Agua Cristal 500ml', salePrice: 2500, costPrice: 1000, stock: 100 },
    { name: 'Agua Brisa 500ml', salePrice: 2500, costPrice: 1000, stock: 100 },
    { name: 'Jugo Hit Naranja 1L', salePrice: 5500, costPrice: 3000, stock: 30 },
    { name: 'Jugo Tropicana Naranja 1L', salePrice: 8500, costPrice: 5200, stock: 20 },
    { name: 'Limonada Natural 500ml', salePrice: 5000, costPrice: 1800, stock: 40 },
    { name: 'Lulada 500ml', salePrice: 7000, costPrice: 3000, stock: 30 },
  ]

  const cocktails = [
    { name: 'Cuba Libre', salePrice: 15000, costPrice: 6000, stock: 20 },
    { name: 'Mojito', salePrice: 18000, costPrice: 7000, stock: 20 },
    { name: 'Agua de Valencia', salePrice: 16000, costPrice: 6500, stock: 15 },
    { name: 'Margarita', salePrice: 20000, costPrice: 8000, stock: 15 },
    { name: 'Piña Colada', salePrice: 18000, costPrice: 7000, stock: 15 },
    { name: 'Caipiriña', salePrice: 19000, costPrice: 7500, stock: 15 },
    { name: 'Canelazo Colombiano', salePrice: 12000, costPrice: 4500, stock: 20 },
    { name: 'Campesino Colombiano', salePrice: 14000, costPrice: 5500, stock: 18 },
    { name: 'Ron con Limón', salePrice: 10000, costPrice: 4000, stock: 25 },
    { name: 'Cerveza Preparada (Refajo)', salePrice: 9000, costPrice: 4500, stock: 25 },
  ]

  const allProductsData = [
    ...bavaria.map(p => ({ ...p, categoryId: categories[0].id })),
    ...imported.map(p => ({ ...p, categoryId: categories[1].id })),
    ...cigs.map(p => ({ ...p, categoryId: categories[2].id })),
    ...cigUnits.map(p => ({ ...p, categoryId: categories[3].id })),
    ...liquors.map(p => ({ ...p, categoryId: categories[4].id })),
    ...snacks.map(p => ({ ...p, categoryId: categories[5].id })),
    ...nonAlc.map(p => ({ ...p, categoryId: categories[6].id })),
    ...cocktails.map(p => ({ ...p, categoryId: categories[7].id })),
  ]

  const products = []
  for (const p of allProductsData) {
    products.push(await prisma.product.create({
      data: {
        storeId,
        categoryId: p.categoryId,
        name: p.name,
        salePrice: p.salePrice,
        costPrice: p.costPrice,
        currentStock: p.stock,
        minStock: 5,
        isActive: true,
      },
    }))
  }
  console.log(`✅ ${products.length} productos creados`)

  // =============================================
  // 4. MESAS
  // =============================================
  const tableData = [
    { number: 1, name: 'Ventana 1', capacity: 4, zone: 'PRINCIPAL' },
    { number: 2, name: 'Ventana 2', capacity: 4, zone: 'PRINCIPAL' },
    { number: 3, name: 'Centro 1', capacity: 6, zone: 'PRINCIPAL' },
    { number: 4, name: 'Centro 2', capacity: 6, zone: 'PRINCIPAL' },
    { number: 5, name: 'VIP 1', capacity: 8, zone: 'VIP' },
    { number: 6, name: 'VIP 2', capacity: 8, zone: 'VIP' },
    { number: 7, name: 'Terraza 1', capacity: 4, zone: 'TERRAZA' },
    { number: 8, name: 'Terraza 2', capacity: 4, zone: 'TERRAZA' },
    { number: 9, name: 'Barra 1', capacity: 2, zone: 'BARRA' },
    { number: 10, name: 'Barra 2', capacity: 2, zone: 'BARRA' },
  ]

  const tables = []
  for (const t of tableData) {
    tables.push(await prisma.barTable.create({
      data: { storeId, ...t, isActive: true },
    }))
  }
  console.log(`✅ ${tables.length} mesas creadas`)

  // =============================================
  // 5. CLIENTES
  // =============================================
  // IMPORTANTE: totalDebt = 0 inicialmente. Se incrementa SOLO cuando se crean órdenes fiadas.
  const customers = [
    await prisma.customer.create({ data: { storeId, name: 'Juan Pérez', phone: '3101111111', totalDebt: 0 } }),
    await prisma.customer.create({ data: { storeId, name: 'María García', phone: '3202222222', totalDebt: 0 } }),
    await prisma.customer.create({ data: { storeId, name: 'Pedro Martínez', phone: '3153333333', totalDebt: 0 } }),
  ]
  console.log(`✅ ${customers.length} clientes creados`)

  // =============================================
  // 6. CUENTAS CONTABLES
  // =============================================
  const accounts = [
    await prisma.ledgerAccount.create({ data: { storeId, name: 'Caja General', type: 'ASSET', isDefault: true } }),
    await prisma.ledgerAccount.create({ data: { storeId, name: 'Cuenta Daviplata', type: 'ASSET', isDefault: false } }),
    await prisma.ledgerAccount.create({ data: { storeId, name: 'Cuenta Nequi', type: 'ASSET', isDefault: false } }),
    await prisma.ledgerAccount.create({ data: { storeId, name: 'Cuenta Tarjeta', type: 'ASSET', isDefault: false } }),
    await prisma.ledgerAccount.create({ data: { storeId, name: 'Inventario Productos', type: 'ASSET', isDefault: false } }),
    await prisma.ledgerAccount.create({ data: { storeId, name: 'Cuentas por Cobrar (Fiado)', type: 'ASSET', isDefault: false } }),
    await prisma.ledgerAccount.create({ data: { storeId, name: 'Ventas', type: 'INCOME', isDefault: false } }),
    await prisma.ledgerAccount.create({ data: { storeId, name: 'Costo de Ventas', type: 'EXPENSE', isDefault: false } }),
    await prisma.ledgerAccount.create({ data: { storeId, name: 'Propina', type: 'INCOME', isDefault: false } }),
  ]
  const Caja = accounts[0].id
  const Daviplata = accounts[1].id
  const Nequi = accounts[2].id
  const Tarjeta = accounts[3].id
  const CxC = accounts[5].id
  const Ventas = accounts[6].id
  console.log(`✅ ${accounts.length} cuentas contables`)

  // =============================================
  // Helper: crear orden completa con transacción
  // =============================================
  async function createFullOrder(data: {
    orderNumber: string; customerId: number | null; paymentMethod: string;
    status: string; items: Array<{ productId: number; qty: number }>;
    createdAt: Date;
  }) {
    const orderItemsData = data.items.map(i => ({
      productId: i.productId,
      quantity: i.qty,
      unitPrice: products[i.productId - 1].salePrice,
      totalRow: products[i.productId - 1].salePrice * i.qty,
    }))
    const total = orderItemsData.reduce((s, i) => s + i.totalRow, 0)

    const order = await prisma.$transaction(async (tx) => {
      const o = await tx.order.create({
        data: {
          storeId,
          customerId: data.customerId,
          orderNumber: data.orderNumber,
          subtotal: total,
          total,
          status: data.status,
          paymentMethod: data.paymentMethod,
          createdAt: data.createdAt,
          orderItems: { create: orderItemsData },
        },
      })

      // Decrementar stock + crear movimiento de inventario
      for (const item of data.items) {
        await tx.product.update({
          where: { id: item.productId },
          data: { currentStock: { decrement: item.qty } },
        })
        await tx.inventoryMovement.create({
          data: {
            storeId,
            productId: item.productId,
            quantity: -item.qty,
            movementType: 'SALE',
            referenceId: o.id,
            notes: `Venta ${data.orderNumber}`,
          },
        })
      }

      // Asientos contables según método de pago
      const isFiado = data.paymentMethod === 'FIADO' || data.paymentMethod === 'CREDIT'

      if (isFiado) {
        // FIADO: DEBIT CxC, CREDIT Ventas
        await tx.journalEntry.create({
          data: { storeId, ledgerAccountId: CxC, amount: total, direction: 'DEBIT', description: `Fiado ${data.orderNumber}`, referenceType: 'ORDER', referenceId: o.id, createdAt: data.createdAt },
        })
        await tx.journalEntry.create({
          data: { storeId, ledgerAccountId: Ventas, amount: total, direction: 'CREDIT', description: `Venta fiada ${data.orderNumber}`, referenceType: 'ORDER', referenceId: o.id, createdAt: data.createdAt },
        })
        // Incrementar deuda del cliente
        if (data.customerId) {
          await tx.customer.update({
            where: { id: data.customerId },
            data: { totalDebt: { increment: total } },
          })
        }
      } else {
        // Pago normal: DEBIT cuenta_pago, CREDIT Ventas
        let paymentAccount = Caja
        if (data.paymentMethod === 'DAVIPLATA') paymentAccount = Daviplata
        else if (data.paymentMethod === 'NEQUI') paymentAccount = Nequi
        else if (data.paymentMethod === 'TARJETA') paymentAccount = Tarjeta

        await tx.journalEntry.create({
          data: { storeId, ledgerAccountId: paymentAccount, amount: total, direction: 'DEBIT', description: `Pago ${data.orderNumber} ${data.paymentMethod}`, referenceType: 'ORDER', referenceId: o.id, createdAt: data.createdAt },
        })
        await tx.journalEntry.create({
          data: { storeId, ledgerAccountId: Ventas, amount: total, direction: 'CREDIT', description: `Venta ${data.orderNumber}`, referenceType: 'ORDER', referenceId: o.id, createdAt: data.createdAt },
        })
      }

      return o
    })

    return order
  }

  // =============================================
  // 7. ÓRDENES HISTÓRICAS (con transacciones completas)
  // =============================================
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1)
  const dayBefore = new Date(today); dayBefore.setDate(dayBefore.getDate() - 2)

  // IDs tras insertar 16 cigarrillos unidad (shift +16 para licores en adelante):
  // P[0]  = Aguila Light Botella (id=1, price=4500)
  // P[6]  = Club Colombia Dorada Lata (id=7, price=5500)
  // P[10] = Costeña Lata (id=11, price=5000)
  // P[26] = Corona Extra (id=27, price=8000)
  // P[68] = Aguardiente Antioqueño SA (id=69, price=55000)
  // P[91] = Coca-Cola Personal (id=92, price=3500)
  // P[83] = Nachos con Guacamole (id=84, price=12000)
  // P[103]= Cuba Libre (id=104, price=15000)

  await createFullOrder({
    orderNumber: 'ORD-001', customerId: customers[0].id, paymentMethod: 'EFECTIVO',
    status: 'COMPLETED', createdAt: yesterday,
    items: [{ productId: 1, qty: 3 }], // 3 Aguila Light = $13,500
  })

  await createFullOrder({
    orderNumber: 'ORD-002', customerId: customers[2].id, paymentMethod: 'DAVIPLATA',
    status: 'COMPLETED', createdAt: yesterday,
    items: [{ productId: 7, qty: 4 }, { productId: 84, qty: 2 }], // 4 Club Col + 2 Nachos = $46,000
  })

  await createFullOrder({
    orderNumber: 'ORD-003', customerId: null, paymentMethod: 'NEQUI',
    status: 'COMPLETED', createdAt: dayBefore,
    items: [{ productId: 69, qty: 1 }], // 1 Aguardiente = $55,000
  })

  await createFullOrder({
    orderNumber: 'ORD-004', customerId: customers[1].id, paymentMethod: 'TARJETA',
    status: 'COMPLETED', createdAt: today,
    items: [{ productId: 69, qty: 1 }, { productId: 104, qty: 2 }], // Aguardiente + 2 Cuba Libre = $85,000
  })

  await createFullOrder({
    orderNumber: 'ORD-005', customerId: null, paymentMethod: 'EFECTIVO',
    status: 'COMPLETED', createdAt: today,
    items: [{ productId: 14, qty: 5 }], // 5 Pilsen Botella = $20,000
  })

  // ORDEN FIADA
  await createFullOrder({
    orderNumber: 'ORD-006', customerId: customers[1].id, paymentMethod: 'FIADO',
    status: 'CREDIT', createdAt: today,
    items: [{ productId: 1, qty: 3 }, { productId: 92, qty: 2 }], // 3 Aguila + 2 Coca = $20,500
  })

  console.log('✅ 6 órdenes históricas con transacciones completas')

  // Verificar deuda de María
  const maria = await prisma.customer.findUnique({ where: { id: customers[1].id } })
  console.log(`  María García deuda: $${maria!.totalDebt.toLocaleString('es-CO')} COP`)

  // =============================================
  // 8. SESIONES ABIERTAS con comanda
  // =============================================
  // Sesión en Mesa 1 (Juan Pérez)
  await prisma.tableSession.create({
    data: {
      storeId, barTableId: tables[0].id, customerId: customers[0].id,
      guests: 4, status: 'OPEN',
      startedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      comandaItems: {
        create: [
          { storeId, productId: 1, productName: 'Aguila Light Botella 330ml', quantity: 4, unitPrice: 4500, total: 18000, status: 'SERVED' },
          { storeId, productId: 92, productName: 'Coca-Cola Personal 400ml', quantity: 2, unitPrice: 3500, total: 7000, status: 'SERVED' },
          { storeId, productId: 84, productName: 'Nachos con Guacamole', quantity: 1, unitPrice: 12000, total: 12000, status: 'PENDING' },
        ],
      },
    },
  })

  // Sesión en Mesa 5 VIP (María García)
  await prisma.tableSession.create({
    data: {
      storeId, barTableId: tables[4].id, customerId: customers[1].id,
      guests: 6, status: 'OPEN',
      startedAt: new Date(Date.now() - 1 * 60 * 60 * 1000),
      comandaItems: {
        create: [
          { storeId, productId: 7, productName: 'Club Colombia Dorada Lata 355ml', quantity: 6, unitPrice: 5500, total: 33000, status: 'SERVED' },
          { storeId, productId: 69, productName: 'Aguardiente Antioqueño 750ml', quantity: 2, unitPrice: 55000, total: 110000, status: 'PENDING' },
          { storeId, productId: 104, productName: 'Cuba Libre', quantity: 3, unitPrice: 15000, total: 45000, status: 'PENDING' },
        ],
      },
    },
  })

  // Sesión en Mesa 9 Barra (sin cliente)
  await prisma.tableSession.create({
    data: {
      storeId, barTableId: tables[8].id,
      guests: 2, status: 'OPEN',
      startedAt: new Date(Date.now() - 30 * 60 * 1000),
      comandaItems: {
        create: [
          { storeId, productId: 11, productName: 'Costeña Lata 355ml', quantity: 2, unitPrice: 5000, total: 10000, status: 'SERVED' },
        ],
      },
    },
  })

  console.log('✅ 3 sesiones abiertas con comandas')

  // =============================================
  // 9. PROVEEDORES
  // =============================================
  const providers = [
    await prisma.provider.create({ data: { storeId, name: 'Bavaria S.A.', contactName: 'Carlos Ramírez', phone: '6018000911', email: 'comercial@bavaria.com.co', city: 'Bogotá', nit: '860.001.234-5', isActive: true } }),
    await prisma.provider.create({ data: { storeId, name: 'Distribuidora Nacional de Licores', contactName: 'Ana López', phone: '6013001234', email: 'ventas@dnl.com.co', city: 'Bogotá', nit: '900.123.456-7', isActive: true } }),
    await prisma.provider.create({ data: { storeId, name: 'Importadora Premium Bebidas', contactName: 'Luis Fernández', phone: '6044445678', email: 'info@premiumbebidas.com', city: 'Medellín', nit: '800.654.321-0', isActive: true } }),
    await prisma.provider.create({ data: { storeId, name: 'Tabacalera Colombiana', contactName: 'Marta Gómez', phone: '6015554321', email: 'pedidos@tabacol.com.co', city: 'Bogotá', nit: '890.111.222-3', isActive: true } }),
    await prisma.provider.create({ data: { storeId, name: 'Snacks y Golosinas del Valle', contactName: 'Pedro Vargas', phone: '6026667890', email: 'ventas@syv.com.co', city: 'Cali', nit: '700.999.888-1', isActive: true } }),
  ]
  console.log(`✅ ${providers.length} proveedores creados`)

  // Conectar productos a proveedores
  // Bavaria: 26 items (0-25) → provider 0
  for (let i = 0; i < 26; i++) {
    await prisma.product.update({ where: { id: products[i].id }, data: { providerId: providers[0].id } })
  }
  // Imported beers: 10 items (26-35) → provider 2
  for (let i = 26; i < 36; i++) {
    await prisma.product.update({ where: { id: products[i].id }, data: { providerId: providers[2].id } })
  }
  // Cigarrillos (packs + units): 32 items (36-67) → provider 3
  for (let i = 36; i < 68; i++) {
    await prisma.product.update({ where: { id: products[i].id }, data: { providerId: providers[3].id } })
  }
  // Licores: 15 items (68-82) → provider 1
  for (let i = 68; i < 83; i++) {
    await prisma.product.update({ where: { id: products[i].id }, data: { providerId: providers[1].id } })
  }
  // Snacks: 8 items (83-90) → provider 4
  for (let i = 83; i < 91; i++) {
    await prisma.product.update({ where: { id: products[i].id }, data: { providerId: providers[4].id } })
  }
  console.log('✅ Productos conectados a proveedores')

  // =============================================
  // 10. COMPRAS HISTÓRICAS
  // =============================================
  const twoDaysAgo = new Date(today); twoDaysAgo.setDate(twoDaysAgo.getDate() - 2)
  const threeDaysAgo = new Date(today); threeDaysAgo.setDate(threeDaysAgo.getDate() - 3)
  const fiveDaysAgo = new Date(today); fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5)

  // Compra 1: Bavaria - Cervezas (hace 5 días)
  const purchase1 = await prisma.purchase.create({
    data: {
      storeId, providerId: providers[0].id, date: fiveDaysAgo,
      notes: 'Reposición quincenal de cervezas Bavaria',
      total: 50 * 2200 + 30 * 2000 + 20 * 2500, // $226,000
      status: 'COMPLETED',
      purchaseItems: {
        create: [
          { productId: 1, quantity: 50, unitCost: 2200, total: 50 * 2200 },
          { productId: 2, quantity: 30, unitCost: 2000, total: 30 * 2000 },
          { productId: 6, quantity: 20, unitCost: 2500, total: 20 * 2500 },
        ],
      },
    },
  })
  // Incrementar stock por la compra
  for (const item of [{ productId: 1, quantity: 50 }, { productId: 2, quantity: 30 }, { productId: 6, quantity: 20 }]) {
    await prisma.product.update({ where: { id: item.productId }, data: { currentStock: { increment: item.quantity } } })
    await prisma.inventoryMovement.create({ data: { storeId, productId: item.productId, quantity: item.quantity, movementType: 'PURCHASE', referenceId: purchase1.id, notes: `Compra #${purchase1.id}` } })
  }

  // Compra 2: Licores (hace 3 días)
  const purchase2 = await prisma.purchase.create({
    data: {
      storeId, providerId: providers[1].id, date: threeDaysAgo,
      notes: 'Pedido de aguardientes y rones',
      total: 10 * 35000 + 5 * 42000 + 3 * 85000, // $910,000
      status: 'COMPLETED',
      purchaseItems: {
        create: [
          { productId: products[68].id, quantity: 10, unitCost: 35000, total: 10 * 35000 },
          { productId: products[70].id, quantity: 5, unitCost: 42000, total: 5 * 42000 },
          { productId: products[74].id, quantity: 3, unitCost: 85000, total: 3 * 85000 },
        ],
      },
    },
  })
  for (const item of [{ productId: products[68].id, quantity: 10 }, { productId: products[70].id, quantity: 5 }, { productId: products[74].id, quantity: 3 }]) {
    await prisma.product.update({ where: { id: item.productId }, data: { currentStock: { increment: item.quantity } } })
    await prisma.inventoryMovement.create({ data: { storeId, productId: item.productId, quantity: item.quantity, movementType: 'PURCHASE', referenceId: purchase2.id, notes: `Compra #${purchase2.id}` } })
  }

  // Compra 3: Cigarrillos (hace 2 días)
  const purchase3 = await prisma.purchase.create({
    data: {
      storeId, providerId: providers[3].id, date: twoDaysAgo,
      notes: 'Reposición de cigarrillos Marlboro y Lucky Strike',
      total: 20 * 5200 + 15 * 4800, // $184,000
      status: 'COMPLETED',
      purchaseItems: {
        create: [
          { productId: products[36].id, quantity: 20, unitCost: 5200, total: 20 * 5200 },
          { productId: products[40].id, quantity: 15, unitCost: 4800, total: 15 * 4800 },
        ],
      },
    },
  })
  for (const item of [{ productId: products[36].id, quantity: 20 }, { productId: products[40].id, quantity: 15 }]) {
    await prisma.product.update({ where: { id: item.productId }, data: { currentStock: { increment: item.quantity } } })
    await prisma.inventoryMovement.create({ data: { storeId, productId: item.productId, quantity: item.quantity, movementType: 'PURCHASE', referenceId: purchase3.id, notes: `Compra #${purchase3.id}` } })
  }

  console.log('✅ 3 compras históricas creadas')

  // =============================================
  // 11. SERVICIOS DEL BAR
  // =============================================
  const barServices = [
    await prisma.service.create({
      data: { storeId, name: 'Servicio de Daños', description: 'Cargo por daños a elementos del bar (vasos, muebles, etc.)', price: 15000, icon: 'AlertTriangle', unit: 'servicio', isActive: true },
    }),
    await prisma.service.create({
      data: { storeId, name: 'Billarana', description: 'Servicio de mesa de billar por hora', price: 8000, icon: 'CircleDot', unit: 'hora', isActive: true },
    }),
    await prisma.service.create({
      data: { storeId, name: 'Guardado de Elementos', description: 'Guarda y custodia de elementos personales', price: 5000, icon: 'ShieldCheck', unit: 'servicio', isActive: true },
    }),
    await prisma.service.create({
      data: { storeId, name: 'Papel Higiénico', description: 'Control de rollos de papel higiénico utilizados', price: 3500, icon: 'ScrollText', unit: 'rollo', isActive: true },
    }),
  ]
  console.log(`✅ ${barServices.length} servicios del bar creados`)

  // Transacciones de servicio históricas
  await prisma.serviceTransaction.create({
    data: { storeId, serviceId: barServices[3].id, quantity: 3, unitPrice: 3500, totalAmount: 10500, notes: 'Rollos usados en el día', status: 'COMPLETED', createdAt: yesterday },
  })
  await prisma.serviceTransaction.create({
    data: { storeId, serviceId: barServices[1].id, quantity: 2, unitPrice: 8000, totalAmount: 16000, notes: 'Billarana 2 horas - Mesa VIP', status: 'COMPLETED', createdAt: yesterday },
  })
  await prisma.serviceTransaction.create({
    data: { storeId, serviceId: barServices[3].id, quantity: 4, unitPrice: 3500, totalAmount: 14000, notes: 'Rollos usados en el día', status: 'COMPLETED', createdAt: dayBefore },
  })
  await prisma.serviceTransaction.create({
    data: { storeId, serviceId: barServices[0].id, quantity: 1, unitPrice: 15000, totalAmount: 15000, notes: 'Vaso roto en mesa 3', status: 'COMPLETED', createdAt: dayBefore },
  })
  console.log('✅ 4 transacciones de servicio creadas')

  // =============================================
  // RESUMEN
  // =============================================
  console.log('\n📊 === RESUMEN ===')
  console.log(`🧑 Usuario: ${user.phone} (pass: 1234)`)
  console.log(`🏪 Tienda: ${user.store!.name} (ID: ${storeId})`)
  console.log(`📁 Categorías: ${categories.length}`)
  console.log(`📦 Productos: ${products.length} (26 Bavaria + ${bavaria.length - 26} otros)`)
  console.log(`🪑 Mesas: ${tables.length}`)
  console.log(`👥 Clientes: ${customers.length}`)
  console.log(`📋 Sesiones abiertas: 3`)
  console.log(`🧾 Órdenes: 6 (5 pagadas + 1 fiada)`)
  console.log(`💰 Deuda María García: $${maria!.totalDebt.toLocaleString('es-CO')} COP`)
  console.log(`🚛 Proveedores: ${providers.length}`)
  console.log(`🛒 Compras: 3`)
  console.log(`🔧 Servicios: ${barServices.length}`)
  console.log('✅ ¡Siembra completada!\n')
}

main()
  .catch((e) => { console.error('❌ Error:', e); process.exit(1) })
  .finally(async () => { await prisma.$disconnect() })
