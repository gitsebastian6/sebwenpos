import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { z } from 'zod'
import { logger } from '@/lib/logger'
import { hashPassword } from '@/lib/auth'

export const dynamic = 'force-dynamic'

const validStatuses = ['NEW', 'CONTACTED', 'APPROVED', 'REJECTED', 'CONVERTED'] as const
export const VALID_STAGES = ['LEAD', 'CONTACTADO', 'DOC_PENDIENTE', 'VALIDACION_LEGAL', 'CLIENTE_ACTIVO', 'RECHAZADO'] as const
const REQUIRED_DOC_TYPES = ['RUT', 'CAMARA_COMERCIO', 'CEDULA_REPRESENTANTE', 'RESOLUCION_DIAN'] as const

// For each required document type, keep only the latest version and count
// how many are uploaded vs. approved — used to render doc status in the leads table.
function computeDocStats(documents: { documentType: string; status: string; version: number }[]) {
  let uploaded = 0
  let approved = 0
  for (const type of REQUIRED_DOC_TYPES) {
    const versions = documents.filter((d) => d.documentType === type)
    if (versions.length === 0) continue
    uploaded++
    const latest = versions.reduce((a, b) => (b.version > a.version ? b : a))
    if (latest.status === 'APPROVED') approved++
  }
  return { uploaded, approved, total: REQUIRED_DOC_TYPES.length }
}

// ─── Schema for manual lead creation ───
const createLeadSchema = z.object({
  ownerFullName: z.string().min(2).max(100),
  ownerCedula: z.string().min(5).max(20),
  ownerEmail: z.string().email().optional().or(z.literal('')),
  ownerPhone: z.string().min(7).optional().or(z.literal('')),
  ownerPassword: z.string().min(6).max(64),
  storeName: z.string().min(2).max(100),
  nit: z.string().min(5).max(20),
  legalName: z.string().min(2).max(150),
  businessType: z.enum(['NATURAL', 'JURIDICA']).default('NATURAL'),
  storePhone: z.string().optional().or(z.literal('')),
  department: z.string().optional().or(z.literal('')),
  cityName: z.string().optional().or(z.literal('')),
  address: z.string().optional().or(z.literal('')),
  hasCamaraComercio: z.boolean().optional().default(false),
  registrationNumber: z.string().optional().or(z.literal('')),
})

/**
 * GET /api/super-admin/leads
 * Lists all leads with optional filters and status count stats
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const status = searchParams.get('status')
    const stage = searchParams.get('stage')
    const search = searchParams.get('search')
    const assignedToId = searchParams.get('assignedToId')

    // ─── Build where clause ───
    const where: Record<string, unknown> = {}

    if (status && validStatuses.includes(status as typeof validStatuses[number])) {
      where.status = status
    }
    if (stage && VALID_STAGES.includes(stage as typeof VALID_STAGES[number])) {
      where.stage = stage
    }
    if (assignedToId) {
      where.assignedToId = Number(assignedToId)
    }

    if (search) {
      const searchStr = search.trim()
      where.OR = [
        { ownerFullName: { contains: searchStr } },
        { ownerCedula: { contains: searchStr } },
        { nit: { contains: searchStr } },
        { storeName: { contains: searchStr } },
      ]
    }

    // ─── Fetch leads and stats in parallel ───
    const [leads, statsNew, statsContacted, statsApproved, statsRejected, statsConverted, stageCounts] = await Promise.all([
      db.lead.findMany({
        where: Object.keys(where).length > 0 ? where : undefined,
        orderBy: { createdAt: 'desc' },
        include: {
          assignedTo: { select: { id: true, fullName: true } },
          documents: { select: { documentType: true, status: true, version: true } },
        },
      }),
      db.lead.count({ where: { status: 'NEW' } }),
      db.lead.count({ where: { status: 'CONTACTED' } }),
      db.lead.count({ where: { status: 'APPROVED' } }),
      db.lead.count({ where: { status: 'REJECTED' } }),
      db.lead.count({ where: { status: 'CONVERTED' } }),
      db.lead.groupBy({ by: ['stage'], _count: { id: true } }),
    ])

    const total = statsNew + statsContacted + statsApproved + statsRejected + statsConverted
    const byStage: Record<string, number> = Object.fromEntries(VALID_STAGES.map((s) => [s, 0]))
    for (const row of stageCounts) byStage[row.stage] = row._count.id

    const leadsWithDocStats = leads.map(({ documents, ...lead }) => ({
      ...lead,
      docStats: computeDocStats(documents),
    }))

    return NextResponse.json({
      leads: leadsWithDocStats,
      stats: {
        new: statsNew,
        contacted: statsContacted,
        approved: statsApproved,
        rejected: statsRejected,
        converted: statsConverted,
        total,
      },
      stageStats: byStage,
    })
  } catch (error) {
    logger.error('[SuperAdmin] Error listing leads:', error)
    return NextResponse.json({ error: 'Error al listar leads' }, { status: 500 })
  }
}

/**
 * POST /api/super-admin/leads
 * Manual lead creation by super admin (source = 'MANUAL')
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const data = createLeadSchema.parse(body)

    // Check for duplicate cedula in existing leads or users
    const existingUser = await db.user.findUnique({
      where: { cedula: data.ownerCedula.trim() },
    })
    if (existingUser) {
      return NextResponse.json(
        { error: 'Esta identificación ya tiene una cuenta registrada.' },
        { status: 409 },
      )
    }

    const existingLead = await db.lead.findFirst({
      where: {
        ownerCedula: data.ownerCedula.trim(),
        status: { in: ['NEW', 'CONTACTED', 'APPROVED'] },
      },
    })
    if (existingLead) {
      return NextResponse.json(
        { error: 'Ya existe un lead pendiente con esta cédula.' },
        { status: 409 },
      )
    }

    // ownerPassword must be hashed before storage — approve/route.ts copies it
    // as-is into User.passwordHash when the lead is converted into an account.
    const ownerPasswordHash = await hashPassword(data.ownerPassword)

    const lead = await db.lead.create({
      data: {
        ownerFullName: data.ownerFullName.trim(),
        ownerCedula: data.ownerCedula.trim(),
        ownerEmail: data.ownerEmail?.trim() || null,
        ownerPhone: data.ownerPhone?.trim() || null,
        ownerPassword: ownerPasswordHash,
        storeName: data.storeName.trim(),
        nit: data.nit.trim(),
        legalName: data.legalName.trim(),
        businessType: data.businessType,
        storePhone: data.storePhone?.trim() || null,
        department: data.department || null,
        cityName: data.cityName?.trim() || null,
        address: data.address?.trim() || null,
        hasCamaraComercio: data.hasCamaraComercio,
        registrationNumber: data.registrationNumber?.trim() || null,
        status: 'NEW',
        source: 'MANUAL',
      },
    })

    logger.info(`[SuperAdmin] Manual lead created: ${lead.storeName}, cedula=${lead.ownerCedula}`)

    return NextResponse.json({ lead }, { status: 201 })
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 })
    }
    logger.error('[SuperAdmin] Error creating lead:', error)
    return NextResponse.json({ error: 'Error al crear lead' }, { status: 500 })
  }
}
