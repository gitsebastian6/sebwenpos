import { PrismaClient } from '@prisma/client'

/**
 * Viva POS — Database Client (SQLite)
 * ─────────────────────────────────────────────────────────
 * Development: SQLite (file-based, zero config)
 * Production:  Change provider in schema.prisma + DATABASE_URL in .env
 */

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
