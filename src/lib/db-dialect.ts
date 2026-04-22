/**
 * Ventify POS — Database Dialect Helper
 * ─────────────────────────────────────────────────────────
 * Provides SQL dialect functions for both SQLite and PostgreSQL.
 * The active dialect is determined by DATABASE_URL at startup.
 *
 * Usage in raw queries:
 *   import { sql } from '@/lib/db-dialect'
 *   db.$queryRawUnsafe(`... WHERE created_at >= ${sql.timestamp(ms)} ...`)
 *   db.$queryRawUnsafe(`... WHERE is_active = ${sql.bool(true)} ...`)
 *   db.$queryRawUnsafe(`... GROUP BY ${sql.dateCol('created_at')} ...`)
 */

type Dialect = 'postgresql' | 'sqlite'

function detectDialect(): Dialect {
  const url = process.env.DATABASE_URL || ''
  return url.startsWith('postgresql://') || url.startsWith('postgres://')
    ? 'postgresql'
    : 'sqlite'
}

import { logger } from '@/lib/logger'

const dialect = detectDialect()

logger.info(`[DB] Dialect: ${dialect.toUpperCase()} (from DATABASE_URL)`)

/**
 * SQL dialect helpers — use these in $queryRawUnsafe calls
 * to keep queries compatible with both SQLite and PostgreSQL.
 */
export const sql = {
  /** Get current dialect name */
  get dialect(): Dialect { return dialect },

  /**
   * Convert a JS Date or epoch-ms to a SQL timestamp literal.
   * - PostgreSQL: to_timestamp(epoch / 1000)   (seconds)
   * - SQLite: epoch                           (stored as INTEGER ms, compared as number)
   */
  timestamp(dateOrMs: Date | number): number | string {
    const ms = typeof dateOrMs === 'number' ? dateOrMs : dateOrMs.getTime()
    if (dialect === 'postgresql') {
      return `to_timestamp(${ms} / 1000)`
    }
    return ms
  },

  /**
   * SQL expression to extract DATE from a timestamp column.
   * - PostgreSQL: DATE(created_at)
   * - SQLite: date(created_at / 1000, 'unixepoch')
   */
  dateCol(column: string): string {
    if (dialect === 'postgresql') {
      return `DATE(${column})`
    }
    return `date(${column} / 1000, 'unixepoch')`
  },

  /**
   * SQL boolean literal.
   * - PostgreSQL: true / false
   * - SQLite: 1 / 0
   */
  bool(value: boolean): boolean | number {
    if (dialect === 'postgresql') return value
    return value ? 1 : 0
  },

  /**
   * SQL expression for "now minus N days".
   * - PostgreSQL: NOW() - INTERVAL 'N days'
   * - SQLite: strftime('%s', 'now', 'localtime', '-N days') * 1000
   */
  nowMinusDays(days: number): string {
    if (dialect === 'postgresql') {
      return `NOW() - INTERVAL '${days} days'`
    }
    return `strftime('%s', 'now', 'localtime', '-${days} days') * 1000`
  },

  /**
   * SQL expression for "now".
   * - PostgreSQL: NOW()
   * - SQLite: (strftime('%s', 'now') * 1000)
   */
  now(): string {
    if (dialect === 'postgresql') return 'NOW()'
    return "(strftime('%s', 'now') * 1000)"
  },
}

/**
 * Build a timestamp comparison string for a WHERE clause.
 * Usage: `WHERE ${sql.tsGte('created_at', startDate)}`
 */
export function tsGte(column: string, dateOrMs: Date | number): string {
  const ts = sql.timestamp(dateOrMs)
  if (dialect === 'postgresql') {
    return `${column} >= ${ts}`
  }
  return `${column} >= ${ts}`
}

export function tsLte(column: string, dateOrMs: Date | number): string {
  const ts = sql.timestamp(dateOrMs)
  if (dialect === 'postgresql') {
    return `${column} <= ${ts}`
  }
  return `${column} <= ${ts}`
}
