import { PrismaClient } from '@prisma/client'
import { registerDecimalSerialization } from './stock-math'

/**
 * Sebwen POS — Database Client (PostgreSQL)
 * ─────────────────────────────────────────────────────────
 * Dev:  local Postgres (`docker compose up -d postgres`)
 * Prod: Neon (managed) now, self-hosted VPS Postgres later.
 * Connection comes from DATABASE_URL. Prisma's built-in engine connects
 * directly; no driver adapter is wired (the app is a long-lived Node
 * server, not an edge/serverless runtime).
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
