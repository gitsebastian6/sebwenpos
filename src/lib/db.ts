import { PrismaClient } from '@prisma/client'
import { registerDecimalSerialization } from './stock-math'

/**
 * Sebwen POS — Database Client (SQLite)
 * ─────────────────────────────────────────────────────────
 * Development: SQLite (file-based, zero config)
 * Production:  Change provider in schema.prisma + DATABASE_URL in .env
 */

// Serializa Prisma.Decimal → number en NextResponse.json() para TODAS las
// rutas API que importan `db` (idempotente). Sin esto, los campos Decimal
// se serializarían como string y romperían el frontend.
registerDecimalSerialization()

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function createPrismaClient(): PrismaClient {
  return new PrismaClient({
    log: process.env.NODE_ENV === 'production'
      ? ['error', 'warn']
      : ['query', 'error', 'warn'],
  })
}

export const db = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
