/**
 * Sebwen POS — SQL snippet helpers for raw queries (PostgreSQL)
 * ─────────────────────────────────────────────────────────
 * The app runs on PostgreSQL only (dev + prod). This module used to branch
 * per dialect; it now just centralises a few Postgres-specific snippets so
 * raw queries stay consistent:
 *
 *   import { sql } from '@/lib/db-dialect'
 *   db.$queryRawUnsafe(`... WHERE created_at >= ${sql.timestamp(ms)} ...`)
 *   db.$queryRawUnsafe(`... GROUP BY ${sql.monthCol('created_at')} ...`)
 *
 * Note: `dateCol`/`monthCol` deliberately use TO_CHAR (returns TEXT) rather
 * than DATE()/date_trunc (returns a `date`/`timestamp` that node-pg turns
 * into a JS Date, breaking `.split('T')` consumers).
 */

export const sql = {
  /** Current SQL dialect — always 'postgresql'. */
  get dialect(): 'postgresql' {
    return 'postgresql'
  },

  /** JS Date or epoch-ms → a Postgres timestamp expression. */
  timestamp(dateOrMs: Date | number): string {
    const ms = typeof dateOrMs === 'number' ? dateOrMs : dateOrMs.getTime()
    return `to_timestamp(${ms} / 1000)`
  },

  /** Extract 'YYYY-MM-DD' TEXT from a timestamp column. */
  dateCol(column: string): string {
    return `TO_CHAR(${column}, 'YYYY-MM-DD')`
  },

  /** SQL boolean literal. */
  bool(value: boolean): boolean {
    return value
  },

  /** "now minus N days" expression. */
  nowMinusDays(days: number): string {
    return `NOW() - INTERVAL '${days} days'`
  },

  /** "now" expression. */
  now(): string {
    return 'NOW()'
  },

  /** Bucket a timestamp column into a 'YYYY-MM' TEXT month, for GROUP BY. */
  monthCol(column: string): string {
    return `TO_CHAR(${column}, 'YYYY-MM')`
  },
}
