// =============================================================================
// SebwenPOS — Seed de datos de prueba para el panel de Super Admin
// =============================================================================
// A diferencia de prisma/seed.ts (que arma UNA tienda completa: "Bar La
// Terraza"), este script llena la capa SaaS/CRM que el panel de Super Admin
// necesita para no verse vacío: varias tiendas con planes y estados de
// suscripción distintos, leads en cada etapa del pipeline (incluyendo casos
// pensados para probar los bugs de sincronización status/stage y
// LeadDocument/rutFilePath que se corrigieron), y comprobantes de pago.
//
// Es seguro correrlo varias veces: solo limpia y recrea lo que él mismo creó
// la vez anterior (identificado por rangos de cédula reservados), nunca toca
// "Bar La Terraza" ni datos que hayas creado a mano probando la plataforma.
//
// Uso:
//   npx tsx prisma/seed-saas-demo.ts
// =============================================================================

import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import DEFAULT_PLANS from './default-plans.json'
import { saveLeadDocumentFile, saveReceiptFile } from '../src/lib/file-storage'

const prisma = new PrismaClient()

// Rangos de cédula reservados para este seed — así una nueva corrida limpia
// exactamente lo que creó la anterior, sin tocar nada más.
const STORE_OWNER_PREFIX = '90000000' // tiendas demo: 900000001..900000005
const SUPERADMIN_CEDULA = '900000000'
const LEAD_OWNER_PREFIX = '91000000' // leads demo: 910000001..910000008

// Placeholder 1x1 PNG transparente — para que "Ver documento"/"Ver comprobante"
// en el CRM abran un archivo real en vez de fallar con un path inexistente.
const PLACEHOLDER_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='

function daysFromNow(days: number): Date {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000)
}

const ADMIN_PERMISSIONS = JSON.stringify({
  dashboard: true, pos: true, tables: true, products: true,
  customers: true, providers: true, orders: true, invoices: true,
  inventory: true, accounting: true, services: true, reports: true,
  settings: true, quotations: true, manageEmployees: true, manageRoles: true,
})
const CAJERO_PERMISSIONS = JSON.stringify({
  dashboard: true, pos: true, orders: true, quotations: true,
  customers: true, products: false, providers: false,
  invoices: false, inventory: false, accounting: false,
  services: false, reports: false, settings: false,
  manageEmployees: false, manageRoles: false, tables: true,
})

// =============================================================================
// Limpieza — borra solo lo que este script creó en una corrida anterior
// =============================================================================
async function cleanupPreviousRun() {
  console.log('🧹 Limpiando datos demo de una corrida anterior (si existen)...')

  const demoLeads = await prisma.lead.findMany({ where: { ownerCedula: { startsWith: LEAD_OWNER_PREFIX } } })
  for (const l of demoLeads) {
    await prisma.leadDocument.deleteMany({ where: { leadId: l.id } })
    await prisma.leadActivity.deleteMany({ where: { leadId: l.id } })
    await prisma.contact.deleteMany({ where: { leadId: l.id } })
  }
  await prisma.lead.deleteMany({ where: { ownerCedula: { startsWith: LEAD_OWNER_PREFIX } } })

  const demoUsers = await prisma.user.findMany({ where: { cedula: { startsWith: STORE_OWNER_PREFIX } } })
  for (const u of demoUsers) {
    const store = await prisma.store.findUnique({ where: { userId: u.id } })
    if (store) {
      await prisma.employee.deleteMany({ where: { storeId: store.id } })
      await prisma.store.delete({ where: { id: store.id } }).catch(() => {})
    }
  }
  // Employee-only demo users (cajeros) — their Employee rows are already gone
  // via the cascading store deletion above, so the User itself is now free.
  await prisma.user.deleteMany({ where: { cedula: { startsWith: STORE_OWNER_PREFIX } } })
  await prisma.user.deleteMany({ where: { cedula: SUPERADMIN_CEDULA } })

  console.log('✅ Limpieza completada\n')
}

// =============================================================================
// Planes — idempotente: reutiliza los que ya existan (p.ej. de prisma/seed.ts)
// =============================================================================
async function ensurePlans(): Promise<Map<string, number>> {
  const map = new Map<string, number>()
  for (const plan of DEFAULT_PLANS as Array<Record<string, unknown>>) {
    const name = plan.name as string
    const existing = await prisma.plan.findFirst({ where: { name } })
    if (existing) {
      map.set(name, existing.id)
      continue
    }
    const created = await prisma.plan.create({
      data: {
        name,
        description: plan.description as string,
        price: plan.price as number,
        maxStores: plan.maxStores as number,
        maxEmployees: plan.maxEmployees as number,
        maxProducts: plan.maxProducts as number,
        sortOrder: plan.sortOrder as number,
        isActive: plan.isActive as boolean,
        features: JSON.stringify(plan.features),
      },
    })
    map.set(name, created.id)
  }
  console.log(`✅ Planes listos: ${[...map.keys()].join(', ')}`)
  return map
}

// =============================================================================
// Super Admin
// =============================================================================
async function createSuperAdmin() {
  const passwordHash = await bcrypt.hash('admin123', 10)
  const admin = await prisma.user.create({
    data: {
      cedula: SUPERADMIN_CEDULA,
      phone: '3000000000',
      email: 'superadmin@sebwen.demo',
      passwordHash,
      fullName: 'Super Admin (Demo)',
      role: 'SUPER_ADMIN',
    },
  })
  console.log(`✅ Super Admin: cédula ${admin.cedula} / contraseña admin123`)
  return admin
}

// =============================================================================
// Helper: crea Usuario+Tienda+Suscripción, con categorías/impuestos/roles base
// =============================================================================
interface StoreSpec {
  ownerCedula: string
  ownerName: string
  storeName: string
  nit: string
  cityName: string
  department: string
  planId: number
  planName: string
  subscription: {
    status: 'TRIAL' | 'ACTIVE' | 'PAST_DUE' | 'EXPIRED' | 'CANCELLED'
    startDate: Date
    endDate: Date | null
    trialEndDate?: Date | null
    graceEndDate?: Date | null
    cancelReason?: string
    billingPeriod: string
    billingPrice: number
  }
  resolutionEndDate?: Date | null
}

async function createDemoStore(spec: StoreSpec) {
  const passwordHash = await bcrypt.hash('demo123', 10)

  const user = await prisma.user.create({
    data: {
      cedula: spec.ownerCedula,
      phone: `30${spec.ownerCedula.slice(-8)}`,
      email: `${spec.storeName.toLowerCase().replace(/[^a-z0-9]+/g, '.')}@sebwen.demo`,
      passwordHash,
      fullName: spec.ownerName,
      role: 'OWNER',
      store: {
        create: {
          name: spec.storeName,
          legalName: `${spec.storeName} S.A.S`,
          nit: spec.nit,
          address: `Calle ${Math.floor(Math.random() * 90) + 10} # ${Math.floor(Math.random() * 40) + 1}-${Math.floor(Math.random() * 90) + 10}`,
          phone: `60${Math.floor(1000000 + Math.random() * 8999999)}`,
          currencyCode: 'COP',
          countryCode: 'CO',
          cityName: spec.cityName,
          resolutionEndDate: spec.resolutionEndDate ?? null,
          resolutionNumber: spec.resolutionEndDate ? '18760000001' : null,
          resolutionStartDate: spec.resolutionEndDate ? daysFromNow(-300) : null,
        },
      },
    },
    include: { store: true },
  })
  const storeId = user.store!.id

  await prisma.subscription.create({
    data: {
      storeId,
      planId: spec.planId,
      status: spec.subscription.status,
      startDate: spec.subscription.startDate,
      endDate: spec.subscription.endDate,
      trialEndDate: spec.subscription.trialEndDate ?? null,
      graceEndDate: spec.subscription.graceEndDate ?? null,
      cancelReason: spec.subscription.cancelReason ?? null,
      billingPeriod: spec.subscription.billingPeriod,
      billingPrice: spec.subscription.billingPrice,
    },
  })

  await prisma.ledgerAccount.createMany({
    data: [
      { storeId, name: 'Caja General', type: 'ASSET', isDefault: true },
      { storeId, name: 'Ventas', type: 'INCOME', isDefault: false },
      { storeId, name: 'Cuentas por Cobrar (Fiado)', type: 'ASSET', isDefault: false },
      { storeId, name: 'Gastos Operacionales', type: 'EXPENSE', isDefault: false },
    ],
  })

  await prisma.taxRate.createMany({
    data: [
      { storeId, name: 'IVA 19%', code: '01', rateType: 'PERCENTAGE', rate: 19, applyTo: 'BOTH', category: 'SALES_TAX', isActive: true, isDefault: true },
      { storeId, name: 'IVA 5%', code: '02', rateType: 'PERCENTAGE', rate: 5, applyTo: 'BOTH', category: 'SALES_TAX', isActive: true, isDefault: false },
      { storeId, name: 'IVA 0% Exento', code: '03', rateType: 'PERCENTAGE', rate: 0, applyTo: 'BOTH', category: 'SALES_TAX', isActive: true, isDefault: false },
    ],
  })

  const adminRole = await prisma.role.create({
    data: { storeId, name: 'Administrador', description: 'Acceso completo', permissions: ADMIN_PERMISSIONS, isDefault: false, isActive: true },
  })
  const cajeroRole = await prisma.role.create({
    data: { storeId, name: 'Cajero', description: 'Punto de venta', permissions: CAJERO_PERMISSIONS, isDefault: true, isActive: true },
  })

  console.log(`✅ Tienda: ${spec.storeName} (id=${storeId}) — plan ${spec.planName}, suscripción ${spec.subscription.status} — dueño cédula ${spec.ownerCedula} / contraseña demo123`)
  return { storeId, ownerId: user.id, adminRoleId: adminRole.id, cajeroRoleId: cajeroRole.id }
}

async function addProducts(storeId: number, categoryNames: string[], products: Array<{ name: string; salePrice: number; costPrice: number; stock: number; categoryIndex: number }>) {
  const categories = []
  for (const name of categoryNames) {
    categories.push(await prisma.category.create({ data: { storeId, name } }))
  }
  const created = []
  for (const p of products) {
    created.push(await prisma.product.create({
      data: {
        storeId,
        categoryId: categories[p.categoryIndex].id,
        name: p.name,
        salePrice: p.salePrice,
        costPrice: p.costPrice,
        currentStock: p.stock,
        minStock: 5,
        isActive: true,
      },
    }))
  }
  console.log(`   📦 ${created.length} productos en ${categories.length} categorías`)
  return created
}

async function addCustomers(storeId: number, customers: Array<{ name: string; phone: string; debt: number }>) {
  const created = []
  for (const c of customers) {
    created.push(await prisma.customer.create({ data: { storeId, name: c.name, phone: c.phone, totalDebt: c.debt } }))
  }
  console.log(`   👥 ${created.length} clientes`)
  return created
}

async function addOrders(storeId: number, products: Array<{ id: number; salePrice: number }>, count: number) {
  const paymentMethods = ['CASH', 'CARD', 'NEQUI']
  for (let i = 0; i < count; i++) {
    const item = products[Math.floor(Math.random() * products.length)]
    const qty = 1 + Math.floor(Math.random() * 3)
    const subtotal = item.salePrice * qty
    const daysAgo = Math.floor(Math.random() * 14)
    const order = await prisma.order.create({
      data: {
        storeId,
        orderNumber: `DEMO-${storeId}-${i + 1}`,
        subtotal,
        total: subtotal,
        status: 'COMPLETED',
        paymentMethod: paymentMethods[Math.floor(Math.random() * paymentMethods.length)],
        createdAt: daysFromNow(-daysAgo),
        updatedAt: daysFromNow(-daysAgo),
      },
    })
    await prisma.orderItem.create({
      data: { orderId: order.id, productId: item.id, quantity: qty, unitPrice: item.salePrice, totalRow: subtotal },
    })
  }
  console.log(`   🧾 ${count} órdenes`)
}

async function addPaymentReceipt(storeId: number, subscriptionId: number, opts: { amount: number; status: string; paymentMethod: string; reference?: string; reviewNotes?: string; daysAgo: number }) {
  const filePath = await saveReceiptFile({ base64Data: PLACEHOLDER_PNG, fileName: 'comprobante-demo.png', fileType: 'image/png' })
  await prisma.paymentReceipt.create({
    data: {
      storeId,
      subscriptionId,
      fileName: 'comprobante-demo.png',
      fileSize: 68,
      fileType: 'image/png',
      filePath,
      amount: opts.amount,
      paymentMethod: opts.paymentMethod,
      reference: opts.reference ?? null,
      status: opts.status,
      reviewNotes: opts.reviewNotes ?? null,
      reviewedBy: opts.status !== 'PENDING' ? 'SUPER_ADMIN' : null,
      reviewedAt: opts.status !== 'PENDING' ? daysFromNow(-opts.daysAgo + 1) : null,
      createdAt: daysFromNow(-opts.daysAgo),
    },
  })
}

// =============================================================================
// Leads — cubre cada combinación de stage/status/documentos que el CRM maneja
// =============================================================================
interface LeadSpec {
  ownerCedula: string
  ownerName: string
  ownerPhone: string
  ownerEmail?: string
  storeName: string
  nit: string
  legalName: string
  businessType: 'NATURAL' | 'JURIDICA'
  cityName: string
  department: string
  stage: string
  status: string
  source: string
  createdDaysAgo: number
  assignedToId?: number
  resolutionEndDate?: Date | null
  convertedStoreId?: number
  documents?: Array<{ type: string; status: 'PENDING' | 'APPROVED' | 'REJECTED'; rejectionReason?: string }>
}

async function createLead(spec: LeadSpec) {
  const passwordHash = await bcrypt.hash('demo123', 10)
  const lead = await prisma.lead.create({
    data: {
      ownerFullName: spec.ownerName,
      ownerCedula: spec.ownerCedula,
      ownerPhone: spec.ownerPhone,
      ownerEmail: spec.ownerEmail ?? null,
      ownerPassword: passwordHash,
      storeName: spec.storeName,
      nit: spec.nit,
      legalName: spec.legalName,
      businessType: spec.businessType,
      cityName: spec.cityName,
      department: spec.department,
      stage: spec.stage,
      status: spec.status,
      source: spec.source,
      assignedToId: spec.assignedToId ?? null,
      resolutionEndDate: spec.resolutionEndDate ?? null,
      resolutionNumber: spec.resolutionEndDate ? '18760000099' : null,
      resolutionStartDate: spec.resolutionEndDate ? daysFromNow(-300) : null,
      convertedStoreId: spec.convertedStoreId ?? null,
      createdAt: daysFromNow(-spec.createdDaysAgo),
    },
  })

  await prisma.leadActivity.create({
    data: { leadId: lead.id, type: 'NOTE', title: 'Lead creado (seed de prueba)', createdAt: daysFromNow(-spec.createdDaysAgo) },
  })

  for (const doc of spec.documents ?? []) {
    const filePath = await saveLeadDocumentFile({ base64Data: PLACEHOLDER_PNG, fileName: `${doc.type.toLowerCase()}-demo.png`, fileType: 'image/png' })
    await prisma.leadDocument.create({
      data: {
        leadId: lead.id,
        documentType: doc.type,
        filePath,
        fileName: `${doc.type.toLowerCase()}-demo.png`,
        fileSize: 68,
        fileType: 'image/png',
        status: doc.status,
        rejectionReason: doc.rejectionReason ?? null,
        version: 1,
      },
    })
  }

  console.log(`✅ Lead: ${spec.storeName} — etapa ${spec.stage} / estado ${spec.status}${spec.documents?.length ? ` (${spec.documents.length} documento(s))` : ''}`)
  return lead
}

// =============================================================================
// MAIN
// =============================================================================
async function main() {
  console.log('🌱 Sembrando datos de prueba para el panel de Super Admin...\n')

  await cleanupPreviousRun()
  const plans = await ensurePlans()
  const superAdmin = await createSuperAdmin()
  console.log('')

  // ── Tienda 1: Café Aroma — plan Pro, suscripción activa, la más completa ──
  const cafeAroma = await createDemoStore({
    ownerCedula: `${STORE_OWNER_PREFIX}1`, ownerName: 'Laura Jiménez', storeName: 'Café Aroma',
    nit: '900111001-1', cityName: 'Bogotá', department: 'Cundinamarca',
    planId: plans.get('Pro')!, planName: 'Pro',
    subscription: { status: 'ACTIVE', startDate: daysFromNow(-10), endDate: daysFromNow(20), billingPeriod: 'MONTHLY', billingPrice: 89900 },
    resolutionEndDate: daysFromNow(18), // vence pronto — prueba de Alertas DIAN
  })
  const cafeProducts = await addProducts(cafeAroma.storeId, ['Bebidas Calientes', 'Panadería', 'Snacks'], [
    { name: 'Café Americano', salePrice: 4500, costPrice: 1500, stock: 100, categoryIndex: 0 },
    { name: 'Cappuccino', salePrice: 6500, costPrice: 2200, stock: 100, categoryIndex: 0 },
    { name: 'Latte Vainilla', salePrice: 7000, costPrice: 2500, stock: 80, categoryIndex: 0 },
    { name: 'Chocolate Caliente', salePrice: 6000, costPrice: 2000, stock: 60, categoryIndex: 0 },
    { name: 'Croissant', salePrice: 5500, costPrice: 2000, stock: 30, categoryIndex: 1 },
    { name: 'Pan de Bono', salePrice: 3000, costPrice: 1000, stock: 40, categoryIndex: 1 },
    { name: 'Muffin Arándanos', salePrice: 6500, costPrice: 2300, stock: 25, categoryIndex: 1 },
    { name: 'Torta de Chocolate (porción)', salePrice: 8500, costPrice: 3000, stock: 15, categoryIndex: 1 },
    { name: 'Papas Fritas', salePrice: 4000, costPrice: 1500, stock: 50, categoryIndex: 2 },
    { name: 'Galletas Surtidas', salePrice: 3500, costPrice: 1200, stock: 40, categoryIndex: 2 },
    { name: 'Sandwich Jamón y Queso', salePrice: 9500, costPrice: 3800, stock: 20, categoryIndex: 2 },
    { name: 'Ensalada de Frutas', salePrice: 7500, costPrice: 3000, stock: 15, categoryIndex: 2 },
  ])
  await addCustomers(cafeAroma.storeId, [
    { name: 'Andrés Rojas', phone: '3111111111', debt: 0 },
    { name: 'Camila Torres', phone: '3122222222', debt: 25000 },
    { name: 'Julián Vargas', phone: '3133333333', debt: 0 },
    { name: 'Sofía Castro', phone: '3144444444', debt: 12000 },
  ])
  await addOrders(cafeAroma.storeId, cafeProducts, 15)
  const cafeSub = await prisma.subscription.findUnique({ where: { storeId: cafeAroma.storeId } })
  await addPaymentReceipt(cafeAroma.storeId, cafeSub!.id, { amount: 89900, status: 'APPROVED', paymentMethod: 'NEQUI', reference: '990011223', reviewNotes: 'Pago verificado en cuenta', daysAgo: 10 })
  console.log('')

  // ── Tienda 2: Ferretería El Tornillo — plan Básico, TRIAL por vencer ──
  const ferreteria = await createDemoStore({
    ownerCedula: `${STORE_OWNER_PREFIX}2`, ownerName: 'Ricardo Peña', storeName: 'Ferretería El Tornillo',
    nit: '900111002-2', cityName: 'Medellín', department: 'Antioquia',
    planId: plans.get('Básico')!, planName: 'Básico',
    subscription: { status: 'TRIAL', startDate: daysFromNow(-4), endDate: daysFromNow(3), trialEndDate: daysFromNow(3), billingPeriod: 'TRIAL', billingPrice: 0 },
  })
  const ferreteriaProducts = await addProducts(ferreteria.storeId, ['Herramientas', 'Tornillería'], [
    { name: 'Martillo 16oz', salePrice: 28000, costPrice: 15000, stock: 12, categoryIndex: 0 },
    { name: 'Destornillador Set x6', salePrice: 22000, costPrice: 11000, stock: 10, categoryIndex: 0 },
    { name: 'Taladro Eléctrico', salePrice: 185000, costPrice: 120000, stock: 4, categoryIndex: 0 },
    { name: 'Cinta Métrica 5m', salePrice: 12000, costPrice: 6000, stock: 20, categoryIndex: 0 },
    { name: 'Tornillos Autorroscantes x100', salePrice: 8500, costPrice: 4000, stock: 30, categoryIndex: 1 },
    { name: 'Tuercas Surtidas x50', salePrice: 6500, costPrice: 3000, stock: 25, categoryIndex: 1 },
    { name: 'Chazos Plásticos x100', salePrice: 5000, costPrice: 2200, stock: 35, categoryIndex: 1 },
    { name: 'Alambre Galvanizado 10m', salePrice: 9000, costPrice: 4500, stock: 18, categoryIndex: 1 },
  ])
  await addCustomers(ferreteria.storeId, [
    { name: 'Constructora Los Pinos', phone: '3155555555', debt: 0 },
    { name: 'Marco Gutiérrez', phone: '3166666666', debt: 0 },
  ])
  await addOrders(ferreteria.storeId, ferreteriaProducts, 5)
  const ferreteriaSub = await prisma.subscription.findUnique({ where: { storeId: ferreteria.storeId } })
  await addPaymentReceipt(ferreteria.storeId, ferreteriaSub!.id, { amount: 49900, status: 'PENDING', paymentMethod: 'BANCOLOMBIA', reference: '445566', daysAgo: 1 })
  console.log('')

  // ── Tienda 3: Panadería Delicias — plan Pro, PAST_DUE (en gracia) ──
  const panaderia = await createDemoStore({
    ownerCedula: `${STORE_OWNER_PREFIX}3`, ownerName: 'Diana Morales', storeName: 'Panadería Delicias',
    nit: '900111003-3', cityName: 'Cali', department: 'Valle del Cauca',
    planId: plans.get('Pro')!, planName: 'Pro',
    subscription: { status: 'PAST_DUE', startDate: daysFromNow(-40), endDate: daysFromNow(-3), graceEndDate: daysFromNow(2), billingPeriod: 'MONTHLY', billingPrice: 89900 },
  })
  const panaderiaProducts = await addProducts(panaderia.storeId, ['Panadería', 'Pastelería'], [
    { name: 'Pan Francés', salePrice: 1500, costPrice: 500, stock: 100, categoryIndex: 0 },
    { name: 'Pan Integral', salePrice: 2500, costPrice: 900, stock: 60, categoryIndex: 0 },
    { name: 'Almojábana', salePrice: 2000, costPrice: 700, stock: 50, categoryIndex: 0 },
    { name: 'Buñuelo', salePrice: 1800, costPrice: 600, stock: 50, categoryIndex: 0 },
    { name: 'Torta Tres Leches (porción)', salePrice: 7500, costPrice: 3000, stock: 12, categoryIndex: 1 },
    { name: 'Milhojas', salePrice: 6000, costPrice: 2500, stock: 15, categoryIndex: 1 },
    { name: 'Ponqué de Vainilla', salePrice: 35000, costPrice: 15000, stock: 6, categoryIndex: 1 },
    { name: 'Galletas de Avena x6', salePrice: 5000, costPrice: 2000, stock: 20, categoryIndex: 1 },
  ])
  await addCustomers(panaderia.storeId, [
    { name: 'Restaurante Buen Sabor', phone: '3177777777', debt: 45000 },
    { name: 'Elena Ríos', phone: '3188888888', debt: 0 },
  ])
  await addOrders(panaderia.storeId, panaderiaProducts, 10)
  const panaderiaSub = await prisma.subscription.findUnique({ where: { storeId: panaderia.storeId } })
  await addPaymentReceipt(panaderia.storeId, panaderiaSub!.id, { amount: 89900, status: 'PENDING', paymentMethod: 'NEQUI', reference: '778899', daysAgo: 0 })
  await addPaymentReceipt(panaderia.storeId, panaderiaSub!.id, { amount: 89900, status: 'REJECTED', paymentMethod: 'NEQUI', reference: '778812', reviewNotes: 'El monto no coincide con el plan', daysAgo: 15 })
  console.log('')

  // ── Tienda 4: Tienda Naturista Vida — plan Básico, EXPIRED ──
  const naturista = await createDemoStore({
    ownerCedula: `${STORE_OWNER_PREFIX}4`, ownerName: 'Fernando Silva', storeName: 'Tienda Naturista Vida',
    nit: '900111004-4', cityName: 'Barranquilla', department: 'Atlántico',
    planId: plans.get('Básico')!, planName: 'Básico',
    subscription: { status: 'EXPIRED', startDate: daysFromNow(-60), endDate: daysFromNow(-15), billingPeriod: 'MONTHLY', billingPrice: 49900 },
  })
  const naturistaProducts = await addProducts(naturista.storeId, ['Suplementos', 'Naturales'], [
    { name: 'Vitamina C 1000mg', salePrice: 32000, costPrice: 18000, stock: 15, categoryIndex: 0 },
    { name: 'Omega 3', salePrice: 45000, costPrice: 25000, stock: 10, categoryIndex: 0 },
    { name: 'Té Verde x20', salePrice: 12000, costPrice: 6000, stock: 20, categoryIndex: 1 },
    { name: 'Miel de Abeja 500g', salePrice: 18000, costPrice: 9000, stock: 12, categoryIndex: 1 },
    { name: 'Aceite de Coco 250ml', salePrice: 22000, costPrice: 11000, stock: 8, categoryIndex: 1 },
  ])
  await addCustomers(naturista.storeId, [{ name: 'Patricia Núñez', phone: '3199999999', debt: 0 }])
  const naturistaSub = await prisma.subscription.findUnique({ where: { storeId: naturista.storeId } })
  await addPaymentReceipt(naturista.storeId, naturistaSub!.id, { amount: 49900, status: 'REJECTED', paymentMethod: 'DAVIPLATA', reference: '112233', reviewNotes: 'Comprobante ilegible, favor reenviar', daysAgo: 20 })
  console.log('')

  // ── Tienda 5: Boutique Elegance — plan Empresarial, CANCELLED ──
  const boutique = await createDemoStore({
    ownerCedula: `${STORE_OWNER_PREFIX}5`, ownerName: 'Valentina Ospina', storeName: 'Boutique Elegance',
    nit: '900111005-5', cityName: 'Bogotá', department: 'Cundinamarca',
    planId: plans.get('Empresarial')!, planName: 'Empresarial',
    subscription: { status: 'CANCELLED', startDate: daysFromNow(-90), endDate: daysFromNow(-30), cancelReason: 'Cliente cerró el local físico', billingPeriod: 'MONTHLY', billingPrice: 249000 },
  })
  await addProducts(boutique.storeId, ['Ropa', 'Accesorios'], [
    { name: 'Vestido Casual', salePrice: 95000, costPrice: 45000, stock: 8, categoryIndex: 0 },
    { name: 'Blusa Elegante', salePrice: 65000, costPrice: 30000, stock: 10, categoryIndex: 0 },
    { name: 'Pantalón de Vestir', salePrice: 85000, costPrice: 40000, stock: 6, categoryIndex: 0 },
    { name: 'Bolso de Cuero', salePrice: 120000, costPrice: 60000, stock: 5, categoryIndex: 1 },
    { name: 'Bufanda', salePrice: 35000, costPrice: 15000, stock: 12, categoryIndex: 1 },
  ])
  console.log('')

  // =============================================================================
  // Leads — todas las combinaciones de etapa/estado/documentos del pipeline
  // =============================================================================
  console.log('📋 Creando leads de prueba...\n')

  await createLead({
    ownerCedula: `${LEAD_OWNER_PREFIX}1`, ownerName: 'Camilo Herrera', ownerPhone: '3200000001',
    ownerEmail: 'camilo.herrera@example.com', storeName: 'Distribuidora El Sol', nit: '901222001-1',
    legalName: 'Distribuidora El Sol S.A.S', businessType: 'JURIDICA', cityName: 'Bogotá', department: 'Cundinamarca',
    stage: 'LEAD', status: 'NEW', source: 'WEB', createdDaysAgo: 2,
  })

  await createLead({
    ownerCedula: `${LEAD_OWNER_PREFIX}2`, ownerName: 'Natalia Beltrán', ownerPhone: '3200000002',
    storeName: 'Restaurante Sabor Costeño', nit: '901222002-2', legalName: 'Sabor Costeño Ltda',
    businessType: 'JURIDICA', cityName: 'Cartagena', department: 'Bolívar',
    stage: 'CONTACTADO', status: 'CONTACTED', source: 'WHATSAPP', createdDaysAgo: 5, assignedToId: superAdmin.id,
  })

  await createLead({
    ownerCedula: `${LEAD_OWNER_PREFIX}3`, ownerName: 'Oscar Medina', ownerPhone: '3200000003',
    ownerEmail: 'oscar.medina@example.com', storeName: 'Minimercado La Esquina', nit: '901222003-3',
    legalName: 'Oscar Medina', businessType: 'NATURAL', cityName: 'Bucaramanga', department: 'Santander',
    stage: 'DOC_PENDIENTE', status: 'CONTACTED', source: 'QUICKSTART', createdDaysAgo: 4,
    documents: [{ type: 'RUT', status: 'PENDING' }],
  })

  await createLead({
    ownerCedula: `${LEAD_OWNER_PREFIX}4`, ownerName: 'Isabel Cárdenas', ownerPhone: '3200000004',
    ownerEmail: 'isabel.cardenas@example.com', storeName: 'Papelería Central', nit: '901222004-4',
    legalName: 'Papelería Central S.A.S', businessType: 'JURIDICA', cityName: 'Pereira', department: 'Risaralda',
    stage: 'VALIDACION_LEGAL', status: 'APPROVED', source: 'WEB', createdDaysAgo: 6,
    resolutionEndDate: daysFromNow(400),
    documents: [
      { type: 'RUT', status: 'APPROVED' },
      { type: 'CAMARA_COMERCIO', status: 'APPROVED' },
      { type: 'CEDULA_REPRESENTANTE', status: 'APPROVED' },
      { type: 'RESOLUCION_DIAN', status: 'APPROVED' },
    ],
  })
  console.log('   ⭐ Este lead está listo para "Convertir en Cuenta" desde el Pipeline')

  await createLead({
    ownerCedula: `${LEAD_OWNER_PREFIX}5`, ownerName: 'Tomás Guzmán', ownerPhone: '3200000005',
    storeName: 'Autopartes Rodríguez', nit: '901222005-5', legalName: 'Autopartes Rodríguez Ltda',
    businessType: 'JURIDICA', cityName: 'Bogotá', department: 'Cundinamarca',
    stage: 'VALIDACION_LEGAL', status: 'CONTACTED', source: 'REFERRAL', createdDaysAgo: 3,
    documents: [
      { type: 'RUT', status: 'REJECTED', rejectionReason: 'La imagen está borrosa, no se alcanza a leer el NIT' },
      { type: 'CAMARA_COMERCIO', status: 'APPROVED' },
      { type: 'CEDULA_REPRESENTANTE', status: 'APPROVED' },
      { type: 'RESOLUCION_DIAN', status: 'APPROVED' },
    ],
  })
  console.log('   ⚠️  Este lead tiene un documento rechazado — prueba el correo/WhatsApp automático')

  await createLead({
    ownerCedula: `${LEAD_OWNER_PREFIX}6`, ownerName: 'Gloria Páez', ownerPhone: '3200000006',
    storeName: 'Repuestos JM', nit: '901222006-6', legalName: 'Gloria Páez', businessType: 'NATURAL',
    cityName: 'Ibagué', department: 'Tolima',
    stage: 'RECHAZADO', status: 'REJECTED', source: 'MANUAL', createdDaysAgo: 10,
  })
  console.log('   🔁 Este lead prueba la sincronización status↔stage (debe verse rechazado en Lista Y en Pipeline)')

  await createLead({
    ownerCedula: `${LEAD_OWNER_PREFIX}7`, ownerName: 'Laura Jiménez', ownerPhone: '3211111111',
    storeName: 'Café Aroma', nit: '900111001-1', legalName: 'Café Aroma S.A.S', businessType: 'JURIDICA',
    cityName: 'Bogotá', department: 'Cundinamarca',
    stage: 'CLIENTE_ACTIVO', status: 'CONVERTED', source: 'WEB', createdDaysAgo: 30,
    convertedStoreId: cafeAroma.storeId,
  })
  console.log('   🔗 Este lead prueba el badge "CRM validado" en la tabla de Tiendas (vinculado a Café Aroma)')

  await createLead({
    ownerCedula: `${LEAD_OWNER_PREFIX}8`, ownerName: 'Sebastián Ortiz', ownerPhone: '3200000008',
    storeName: 'Ferretería Los Andes', nit: '901222008-8', legalName: 'Ferretería Los Andes S.A.S',
    businessType: 'JURIDICA', cityName: 'Manizales', department: 'Caldas',
    stage: 'LEAD', status: 'NEW', source: 'WEB', createdDaysAgo: 0,
    resolutionEndDate: daysFromNow(12),
  })
  console.log('   🔔 Este lead prueba las Alertas DIAN (resolución por vencer)')

  console.log('\n📊 === RESUMEN ===')
  console.log(`🔑 Super Admin → cédula ${SUPERADMIN_CEDULA} / contraseña admin123`)
  console.log('🏪 5 tiendas demo (TRIAL, ACTIVE, PAST_DUE, EXPIRED, CANCELLED) — todas con contraseña demo123')
  console.log('📋 8 leads cubriendo cada etapa, estado, y combinación de documentos del CRM')
  console.log('💳 5 comprobantes de pago (aprobados, pendientes, rechazados)')
  console.log('\n✅ ¡Siembra completada! Entra al panel de Super Admin con la cédula del Super Admin.\n')
}

main()
  .catch((e) => { console.error('❌ Error:', e); process.exit(1) })
  .finally(async () => { await prisma.$disconnect() })
