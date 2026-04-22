import { NextResponse, NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { hashPassword } from '@/lib/auth'
import { requireAuth } from '@/lib/api-auth'
import { z } from 'zod'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

// ---------------------------------------------------------------------------
// Ventify POS — Seed Route (DEVELOPMENT ONLY)
// ---------------------------------------------------------------------------
// This route creates demo data for development/testing purposes.
//
// PROTECTION LAYERS:
//   1. Environment variable: ALLOW_SEED must be "true"
//   2. Auth middleware: valid token required (Edge middleware)
//   3. Server-side: SUPER_ADMIN role required
//
// In production (ALLOW_SEED != "true"), both DELETE and POST return 404.
// ---------------------------------------------------------------------------

const SEED_ENABLED = process.env.ALLOW_SEED === 'true'

/**
 * Helper: reject if seed is not enabled or user is not SUPER_ADMIN
 */
function rejectIfNotSeedable(req: NextRequest): NextResponse | null {
  // Layer 1: Environment check
  if (!SEED_ENABLED) {
    return NextResponse.json(
      { error: 'Endpoint deshabilitado en producción' },
      { status: 404 }
    )
  }

  // Layer 2: Auth check
  const auth = requireAuth(req)
  if (!('userId' in auth)) return auth

  // Layer 3: SUPER_ADMIN only
  if (auth.role !== 'SUPER_ADMIN') {
    return NextResponse.json(
      { error: 'Acceso restringido a Super Administrador' },
      { status: 403 }
    )
  }

  return null
}

/**
 * Helper: safely delete all data using Prisma (no raw SQL)
 */
async function deleteAllData() {
  // Delete in correct dependency order to avoid foreign key errors
  await db.comandaItem.deleteMany()
  await db.orderItem.deleteMany()
  await db.purchaseItem.deleteMany()
  await db.quotationItem.deleteMany()
  await db.inventoryMovement.deleteMany()
  await db.serviceTransaction.deleteMany()
  await db.journalEntry.deleteMany()

  await db.invoice.deleteMany()
  await db.contingencyInvoice.deleteMany()
  await db.creditNote.deleteMany()

  await db.tableSession.deleteMany()
  await db.order.deleteMany()
  await db.purchase.deleteMany()
  await db.quotation.deleteMany()
  await db.expense.deleteMany()

  await db.cashRegister.deleteMany()
  await db.customer.deleteMany()
  await db.provider.deleteMany()
  await db.service.deleteMany()
  await db.product.deleteMany()

  await db.taxRate.deleteMany()
  await db.ledgerAccount.deleteMany()
  await db.employee.deleteMany()
  await db.role.deleteMany()
  await db.barTable.deleteMany()
  await db.category.deleteMany()

  await db.paymentReceipt.deleteMany()
  await db.subscription.deleteMany()
  await db.store.deleteMany()
  await db.user.deleteMany()
}

// ─── DELETE: Clear ALL data (SUPER_ADMIN only, dev only) ─────────

export async function DELETE(req: NextRequest) {
  const rejection = rejectIfNotSeedable(req)
  if (rejection) return rejection

  try {
    await deleteAllData()

    return NextResponse.json({
      message: 'Todos los datos eliminados correctamente',
      cleared: true,
    })
  } catch (error) {
    logger.error('Seed delete error:', error)
    return NextResponse.json({ error: 'Error al eliminar datos' }, { status: 500 })
  }
}

// ─── POST: Seed with comprehensive Colombian bar data ───────────────

const resetSchema = z.object({
  confirm: z.literal('RESET'),
})

export async function POST(req: NextRequest) {
  const rejection = rejectIfNotSeedable(req)
  if (rejection) return rejection

  try {
    // Optionally allow force-reset
    let forceReset = false
    try {
      const body = await req.json()
      const parsed = resetSchema.safeParse(body)
      forceReset = parsed.success
    } catch { /* no body is ok */ }

    const existingUsers = await db.user.count()
    if (existingUsers > 0 && !forceReset) {
      return NextResponse.json({
        message: 'Ya existen datos. Envía { "confirm": "RESET" } para reiniciar.',
        seeded: false,
        hint: 'POST /api/seed con body: { "confirm": "RESET" }',
      })
    }

    if (forceReset) {
      await deleteAllData()
    }

    const passwordHash = await hashPassword('1234')

    // ─── User + Store (login por cédula) ───────────────────────
    const user = await db.user.create({
      data: {
        cedula: '1098765432',
        phone: '3001234567',
        email: 'admin@ventify.com',
        passwordHash,
        fullName: 'Carlos Bar Manager',
        role: 'OWNER',
        store: {
          create: {
            name: 'Bar La Terraza',
            nit: '901234567-8',
            legalName: 'Bar La Terraza S.A.S',
            address: 'Cra 15 #82-45, Bogotá',
            phone: '6013456789',
            currencyCode: 'COP',
            countryCode: 'CO',
            invoicePrefix: 'FE',
            resolutionNumber: '18764',
            resolutionStartDate: new Date('2024-01-01'),
            resolutionEndDate: new Date('2026-12-31'),
            resolutionStartNumber: 1,
            resolutionEndNumber: 10000,
            invoiceTestMode: true,
          },
        },
      },
      include: { store: true },
    })

    const storeId = user.store!.id

    // ─── Categories ────────────────────────────────────────────
    const catMap: Record<string, number> = {}
    const catNames = [
      'Cervezas Bavaria', 'Cervezas Importadas', 'Cigarrillos',
      'Licores', 'Snacks', 'Bebidas No Alcohólicas', 'Cocteles',
    ]
    for (const name of catNames) {
      const cat = await db.category.create({ data: { storeId, name } })
      catMap[name] = cat.id
    }
    const cat = (name: string) => catMap[name]

    // ─── Tax Rates (DIAN) ─────────────────────────────────────
    const taxRates = await Promise.all([
      db.taxRate.create({ data: {
        storeId,
        name: 'IVA 19%',
        code: '01',
        rateType: 'PERCENTAGE',
        rate: 19,
        applyTo: 'PRODUCT',
        category: 'SALES_TAX',
        isActive: true,
        isDefault: true,
        description: 'Impuesto al Valor Agregado - Tarifa general (bebidas alcohólicas, preparaciones)',
      }}),
      db.taxRate.create({ data: {
        storeId,
        name: 'IVA 5%',
        code: '02',
        rateType: 'PERCENTAGE',
        rate: 5,
        applyTo: 'PRODUCT',
        category: 'SALES_TAX',
        isActive: true,
        isDefault: false,
        description: 'IVA tarifa reducida (algunos alimentos básicos)',
      }}),
      db.taxRate.create({ data: {
        storeId,
        name: 'IVA Exento',
        code: '03',
        rateType: 'PERCENTAGE',
        rate: 0,
        applyTo: 'BOTH',
        category: 'SALES_TAX',
        isActive: true,
        isDefault: false,
        description: 'Productos exentos de IVA (pan, agua, servicios exentos)',
      }}),
      db.taxRate.create({ data: {
        storeId,
        name: 'IVA Excluido',
        code: '04',
        rateType: 'PERCENTAGE',
        rate: 0,
        applyTo: 'BOTH',
        category: 'SALES_TAX',
        isActive: true,
        isDefault: false,
        description: 'Productos excluidos del IVA',
      }}),
      db.taxRate.create({ data: {
        storeId,
        name: 'Impoconsumo 8%',
        code: '05',
        rateType: 'PERCENTAGE',
        rate: 8,
        applyTo: 'PRODUCT',
        category: 'CONSUMPTION_TAX',
        isActive: true,
        isDefault: false,
        description: 'Impuesto al consumo (aplica sobre licores y tabaco)',
      }}),
    ])
    const defaultTaxRate = taxRates[0] // IVA 19% as default

    // ─── Products ─────────────────────────────────────────────
    const allProducts: Array<{ name: string; salePrice: number; costPrice: number; stock: number }> = [
      // Cervezas Bavaria (26)
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
      // Cervezas Importadas (10)
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
      // Cigarrillos (16)
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
      // Licores (15)
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
      // Snacks (8)
      { name: 'Nachos con Guacamole', salePrice: 12000, costPrice: 5000, stock: 20 },
      { name: 'Papas Fritas Colombianas', salePrice: 8000, costPrice: 3000, stock: 30 },
      { name: 'Chicharrón Colombiano', salePrice: 10000, costPrice: 4000, stock: 25 },
      { name: 'Empanada Colombiana', salePrice: 6000, costPrice: 2000, stock: 40 },
      { name: 'Patacón con Hogao', salePrice: 9000, costPrice: 3500, stock: 25 },
      { name: 'Arepas con Queso', salePrice: 7000, costPrice: 2500, stock: 30 },
      { name: 'Mango Biche con Limón y Sal', salePrice: 5000, costPrice: 1500, stock: 50 },
      { name: 'Plátano Maduro Frito', salePrice: 6000, costPrice: 2000, stock: 35 },
      // Bebidas No Alcohólicas (12)
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
      // Cocteles (10)
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

    const products = []
    for (let i = 0; i < allProducts.length; i++) {
      const p = allProducts[i]
      let categoryId: number | null = null
      if (i < 26) categoryId = cat('Cervezas Bavaria')
      else if (i < 36) categoryId = cat('Cervezas Importadas')
      else if (i < 52) categoryId = cat('Cigarrillos')
      else if (i < 67) categoryId = cat('Licores')
      else if (i < 75) categoryId = cat('Snacks')
      else if (i < 87) categoryId = cat('Bebidas No Alcohólicas')
      else categoryId = cat('Cocteles')

      products.push(await db.product.create({
        data: {
          storeId,
          categoryId,
          name: p.name,
          salePrice: p.salePrice,
          costPrice: p.costPrice,
          currentStock: p.stock,
          minStock: 5,
          isActive: true,
        },
      }))
    }

    // ─── Assign Tax Rates to Products ─────────────────────────
    await db.product.updateMany({
      where: { storeId },
      data: { taxRateId: defaultTaxRate.id },
    })

    const exemptProducts = await db.product.findMany({
      where: { storeId, name: { contains: 'Agua' } },
      select: { id: true },
    })
    const juiceProducts = await db.product.findMany({
      where: { storeId, OR: [
        { name: { contains: 'Jugo' } },
        { name: { contains: 'Limonada' } },
      ]},
      select: { id: true },
    })
    const exemptTaxRate = taxRates[2] // IVA Exento
    const exemptIds = [...exemptProducts.map(p => p.id), ...juiceProducts.map(p => p.id)]
    if (exemptIds.length > 0) {
      await db.product.updateMany({
        where: { id: { in: exemptIds } },
        data: { taxRateId: exemptTaxRate.id },
      })
    }

    // ─── Services ─────────────────────────────────────────────
    await db.service.createMany({
      data: [
        { storeId, name: 'Copa de Licor', description: 'Porción individual de cualquier licor de la casa', price: 8000, icon: 'Wine', unit: 'servicio' },
        { storeId, name: 'Cerveza de Barril', description: 'Jarra de cerveza del barril (500ml)', price: 6000, icon: 'Beer', unit: 'jarra' },
        { storeId, name: 'Mesa de Billar', description: 'Uso de la mesa de billar por hora', price: 15000, icon: 'Gamepad2', unit: 'hora' },
        { storeId, name: 'Cava Privada', description: 'Uso del espacio privado con botella incluida', price: 120000, icon: 'Lock', unit: 'servicio' },
        { storeId, name: 'Karaoke', description: 'Uso del equipo de karaoke por hora', price: 20000, icon: 'Mic', unit: 'hora' },
        { storeId, name: 'Propina Barman', description: 'Propina voluntaria para el barman', price: 0, icon: 'Heart', unit: 'servicio' },
      ],
    })

    // ─── Default Roles ────────────────────────────────────────
    const adminPerms = JSON.stringify({
      dashboard: true, pos: true, tables: true, products: true,
      customers: true, providers: true, orders: true, invoices: true,
      inventory: true, accounting: true, services: true, reports: true,
      settings: true, quotations: true, manageEmployees: true, manageRoles: true,
    })
    const cajeroPerms = JSON.stringify({
      dashboard: true, pos: true, tables: false, products: false,
      customers: true, providers: false, orders: true, invoices: false,
      inventory: false, accounting: false, services: false, reports: false,
      settings: false, quotations: true, manageEmployees: false, manageRoles: false,
    })
    const meseroPerms = JSON.stringify({
      dashboard: true, pos: false, tables: true, products: false,
      customers: true, providers: false, orders: true, invoices: false,
      inventory: false, accounting: false, services: false, reports: false,
      settings: false, quotations: false, manageEmployees: false, manageRoles: false,
    })
    const bartenderPerms = JSON.stringify({
      dashboard: true, pos: true, tables: true, products: false,
      customers: true, providers: false, orders: true, invoices: false,
      inventory: false, accounting: false, services: true, reports: false,
      settings: false, quotations: false, manageEmployees: false, manageRoles: false,
    })

    await db.role.createMany({
      data: [
        { storeId, name: 'Administrador', description: 'Acceso completo a todos los módulos del sistema', permissions: adminPerms, isDefault: false, isActive: true },
        { storeId, name: 'Cajero', description: 'Punto de venta, clientes, órdenes y cotizaciones', permissions: cajeroPerms, isDefault: true, isActive: true },
        { storeId, name: 'Mesero', description: 'Mesas, comandas, clientes y órdenes', permissions: meseroPerms, isDefault: false, isActive: true },
        { storeId, name: 'Bartender', description: 'POS, mesas, servicios y atención al cliente', permissions: bartenderPerms, isDefault: false, isActive: true },
      ],
    })

    // ─── Tables ────────────────────────────────────────────────
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
      tables.push(await db.barTable.create({ data: { storeId, ...t, isActive: true } }))
    }

    // ─── Customers ────────────────────────────────────────────
    const customers = [
      await db.customer.create({ data: { storeId, name: 'Juan Pérez', phone: '3101111111', totalDebt: 0 } }),
      await db.customer.create({ data: { storeId, name: 'María García', phone: '3202222222', totalDebt: 0 } }),
      await db.customer.create({ data: { storeId, name: 'Pedro Martínez', phone: '3153333333', totalDebt: 0 } }),
    ]

    // ─── Ledger Accounts ───────────────────────────────────────
    const accs = [
      await db.ledgerAccount.create({ data: { storeId, name: 'Caja General', type: 'ASSET', isDefault: true } }),
      await db.ledgerAccount.create({ data: { storeId, name: 'Cuenta Daviplata', type: 'ASSET', isDefault: false } }),
      await db.ledgerAccount.create({ data: { storeId, name: 'Cuenta Nequi', type: 'ASSET', isDefault: false } }),
      await db.ledgerAccount.create({ data: { storeId, name: 'Cuenta Tarjeta', type: 'ASSET', isDefault: false } }),
      await db.ledgerAccount.create({ data: { storeId, name: 'Inventario Productos', type: 'ASSET', isDefault: false } }),
      await db.ledgerAccount.create({ data: { storeId, name: 'Cuentas por Cobrar (Fiado)', type: 'ASSET', isDefault: false } }),
      await db.ledgerAccount.create({ data: { storeId, name: 'Ventas', type: 'INCOME', isDefault: false } }),
      await db.ledgerAccount.create({ data: { storeId, name: 'Costo de Ventas', type: 'EXPENSE', isDefault: false } }),
      await db.ledgerAccount.create({ data: { storeId, name: 'Propina', type: 'INCOME', isDefault: false } }),
    ]
    const Caja = accs[0].id
    const Daviplata = accs[1].id
    const Nequi = accs[2].id
    const Tarjeta = accs[3].id
    const CxC = accs[5].id
    const Ventas = accs[6].id

    // Helper: create full order with complete transaction
    async function createOrder(data: {
      orderNumber: string; customerId: number | null; paymentMethod: string;
      status: string; items: Array<{ productId: number; qty: number }>; createdAt: Date;
    }) {
      const total = data.items.reduce((s, i) => s + products[i.productId - 1].salePrice * i.qty, 0)
      return await db.$transaction(async (tx) => {
        const o = await tx.order.create({
          data: {
            storeId, customerId: data.customerId, orderNumber: data.orderNumber,
            subtotal: total, total, status: data.status, paymentMethod: data.paymentMethod,
            createdAt: data.createdAt,
            orderItems: {
              create: data.items.map(i => ({
                productId: i.productId, quantity: i.qty,
                unitPrice: products[i.productId - 1].salePrice,
                totalRow: products[i.productId - 1].salePrice * i.qty,
              })),
            },
          },
        })
        for (const item of data.items) {
          await tx.product.update({ where: { id: item.productId }, data: { currentStock: { decrement: item.qty } } })
          await tx.inventoryMovement.create({
            data: { storeId, productId: item.productId, quantity: -item.qty, movementType: 'SALE', referenceId: o.id, notes: `Venta ${data.orderNumber}`, createdAt: data.createdAt },
          })
        }
        const isFiado = data.paymentMethod === 'FIADO' || data.paymentMethod === 'CREDIT'
        if (isFiado) {
          await tx.journalEntry.create({ data: { storeId, ledgerAccountId: CxC, amount: total, direction: 'DEBIT', description: `Fiado ${data.orderNumber}`, referenceType: 'ORDER', referenceId: o.id, createdAt: data.createdAt } })
          await tx.journalEntry.create({ data: { storeId, ledgerAccountId: Ventas, amount: total, direction: 'CREDIT', description: `Venta fiada ${data.orderNumber}`, referenceType: 'ORDER', referenceId: o.id, createdAt: data.createdAt } })
          if (data.customerId) await tx.customer.update({ where: { id: data.customerId }, data: { totalDebt: { increment: total } } })
        } else {
          let payAcc = Caja
          if (data.paymentMethod === 'DAVIPLATA') payAcc = Daviplata
          else if (data.paymentMethod === 'NEQUI') payAcc = Nequi
          else if (data.paymentMethod === 'TARJETA') payAcc = Tarjeta
          await tx.journalEntry.create({ data: { storeId, ledgerAccountId: payAcc, amount: total, direction: 'DEBIT', description: `Pago ${data.orderNumber} ${data.paymentMethod}`, referenceType: 'ORDER', referenceId: o.id, createdAt: data.createdAt } })
          await tx.journalEntry.create({ data: { storeId, ledgerAccountId: Ventas, amount: total, direction: 'CREDIT', description: `Venta ${data.orderNumber}`, referenceType: 'ORDER', referenceId: o.id, createdAt: data.createdAt } })
        }
        return o
      })
    }

    // ─── Historical Orders ────────────────────────────────────
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1)
    const dayBefore = new Date(today); dayBefore.setDate(dayBefore.getDate() - 2)

    await createOrder({ orderNumber: 'ORD-001', customerId: customers[0].id, paymentMethod: 'EFECTIVO', status: 'COMPLETED', createdAt: yesterday, items: [{ productId: 1, qty: 3 }] })
    await createOrder({ orderNumber: 'ORD-002', customerId: customers[2].id, paymentMethod: 'DAVIPLATA', status: 'COMPLETED', createdAt: yesterday, items: [{ productId: 7, qty: 4 }, { productId: 84, qty: 2 }] })
    await createOrder({ orderNumber: 'ORD-003', customerId: null, paymentMethod: 'NEQUI', status: 'COMPLETED', createdAt: dayBefore, items: [{ productId: 37, qty: 1 }] })
    await createOrder({ orderNumber: 'ORD-004', customerId: customers[1].id, paymentMethod: 'TARJETA', status: 'COMPLETED', createdAt: today, items: [{ productId: 37, qty: 1 }, { productId: 91, qty: 2 }] })
    await createOrder({ orderNumber: 'ORD-005', customerId: null, paymentMethod: 'EFECTIVO', status: 'COMPLETED', createdAt: today, items: [{ productId: 27, qty: 5 }] })
    await createOrder({ orderNumber: 'ORD-006', customerId: customers[1].id, paymentMethod: 'FIADO', status: 'CREDIT', createdAt: today, items: [{ productId: 1, qty: 3 }, { productId: 58, qty: 2 }] })

    // ─── Open Sessions ─────────────────────────────────────────
    const now = Date.now()
    await db.tableSession.create({
      data: {
        storeId, barTableId: tables[0].id, customerId: customers[0].id, guests: 4, status: 'OPEN',
        startedAt: new Date(now - 2 * 3600000),
        comandaItems: { create: [
          { storeId, productId: 1, productName: 'Aguila Light Botella 330ml', quantity: 4, unitPrice: 4500, total: 18000, status: 'SERVED' },
          { storeId, productId: 58, productName: 'Coca-Cola Personal 400ml', quantity: 2, unitPrice: 3500, total: 7000, status: 'SERVED' },
          { storeId, productId: 84, productName: 'Nachos con Guacamole', quantity: 1, unitPrice: 12000, total: 12000, status: 'PENDING' },
        ] },
      },
    })
    await db.tableSession.create({
      data: {
        storeId, barTableId: tables[4].id, customerId: customers[1].id, guests: 6, status: 'OPEN',
        startedAt: new Date(now - 1 * 3600000),
        comandaItems: { create: [
          { storeId, productId: 7, productName: 'Club Colombia Dorada Lata 355ml', quantity: 6, unitPrice: 5500, total: 33000, status: 'SERVED' },
          { storeId, productId: 37, productName: 'Aguardiente Antioqueño 750ml', quantity: 2, unitPrice: 55000, total: 110000, status: 'PENDING' },
          { storeId, productId: 91, productName: 'Cuba Libre', quantity: 3, unitPrice: 15000, total: 45000, status: 'PENDING' },
        ] },
      },
    })
    await db.tableSession.create({
      data: {
        storeId, barTableId: tables[8].id, guests: 2, status: 'OPEN',
        startedAt: new Date(now - 30 * 60000),
        comandaItems: { create: [
          { storeId, productId: 11, productName: 'Costeña Lata 355ml', quantity: 2, unitPrice: 5000, total: 10000, status: 'SERVED' },
        ] },
      },
    })

    return NextResponse.json({
      seeded: true,
      storeId,
      user: { cedula: '1098765432', password: '1234' },
      store: { name: 'Bar La Terraza', currencyCode: 'COP' },
      stats: { products: products.length, tables: tables.length, orders: 6, customers: customers.length },
    })
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 })
    }
    logger.error('Seed error:', error)
    return NextResponse.json({ error: 'Error al sembrar datos' }, { status: 500 })
  }
}
