import bcrypt from 'bcryptjs'
import type { User } from '@prisma/client'

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12)
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

export function sanitizeUser(user: User) {
  const { passwordHash, ...safeUser } = user
  return safeUser
}

export function formatCurrency(amountInCents: number, currencyCode: string = 'MXN'): string {
  const amount = amountInCents / 100
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: currencyCode,
  }).format(amount)
}

export function generateOrderNumber(): string {
  const now = new Date()
  const dateStr = now.getFullYear().toString().slice(2) +
    (now.getMonth() + 1).toString().padStart(2, '0') +
    now.getDate().toString().padStart(2, '0')
  const rand = Math.floor(Math.random() * 10000).toString().padStart(4, '0')
  return `TK-${dateStr}-${rand}`
}
