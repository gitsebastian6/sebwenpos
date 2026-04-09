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

export function formatCurrency(amount: number, currencyCode: string = 'COP'): string {
  // COP (and most LatAm currencies) don't use centavos in practice.
  // Prices are stored as whole pesos — no division needed.
  // For USD/EUR, prices would need to be in cents and divided by 100.
  const needsCentsConversion = ['USD', 'EUR', 'GBP', 'MXN'].includes(currencyCode)
  const value = needsCentsConversion ? amount / 100 : amount
  const localeMap: Record<string, string> = {
    COP: 'es-CO',
    MXN: 'es-MX',
    USD: 'en-US',
    EUR: 'es-ES',
  }
  const locale = localeMap[currencyCode] || 'es-CO'
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currencyCode,
    minimumFractionDigits: needsCentsConversion ? 2 : 0,
    maximumFractionDigits: needsCentsConversion ? 2 : 0,
  }).format(value)
}

export function generateOrderNumber(): string {
  const now = new Date()
  const dateStr = now.getFullYear().toString().slice(2) +
    (now.getMonth() + 1).toString().padStart(2, '0') +
    now.getDate().toString().padStart(2, '0')
  const rand = Math.floor(Math.random() * 10000).toString().padStart(4, '0')
  return `TK-${dateStr}-${rand}`
}
