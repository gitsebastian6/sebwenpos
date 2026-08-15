/**
 * Viva POS — SQLite → PostgreSQL Migration Script
 * 
 * Reads ALL data from SQLite (bun:sqlite) and inserts into PostgreSQL (pg).
 * Handles boolean conversion (0/1 → true/false) and preserves ISO8601 date strings.
 * Uses PostgreSQL transactions for atomicity.
 * Resets autoincrement sequences after insertion.
 * 
 * Usage: cd /home/z/my-project && bun run prisma/migrate-sqlite-to-pg.ts
 */

import { Database } from "bun:sqlite";
import { Pool, Client } from "pg";

// ─── Configuration ───────────────────────────────────────────────────────────

const SQLITE_PATH = "db/custom.db";
const PG_CONFIG = {
  host: "127.0.0.1",
  port: 5432,
  user: "z",
  database: "viva",
};

// ─── Column metadata: which columns are BOOLEAN and DATETIME ─────────────────

const BOOLEAN_COLUMNS: Record<string, string[]> = {
  bar_tables: ["is_active"],
  contingency_invoices: ["test_mode"],
  credit_notes: ["test_mode"],
  employees: ["is_active"],
  invoices: ["test_mode"],
  ledger_accounts: ["is_default"],
  plans: ["is_active"],
  products: ["is_active"],
  providers: ["is_active"],
  roles: ["is_default", "is_active"],
  services: ["is_active"],
  stores: [
    "invoice_test_mode",
    "invoice_enabled",
    "certificate_uploaded",
  ],
  tax_rates: ["is_active", "is_default"],
};

const DATETIME_COLUMNS: Record<string, string[]> = {
  bar_tables: ["created_at", "updatedAt"],
  cash_registers: ["opened_at", "closed_at"],
  categories: ["created_at", "updatedAt"],
  comanda_items: ["created_at"],
  contingency_invoices: [
    "contingency_start",
    "contingency_end",
    "retransmitted_at",
    "created_at",
    "updatedAt",
  ],
  credit_notes: [
    "resolution_date",
    "start_date",
    "end_date",
    "sent_at",
    "validated_at",
    "emailed_at",
    "created_at",
    "updatedAt",
  ],
  customers: ["created_at", "updatedAt"],
  employees: ["created_at", "updatedAt"],
  expenses: ["date", "created_at", "updatedAt"],
  inventory_movements: ["created_at"],
  invoices: [
    "resolution_date",
    "start_date",
    "end_date",
    "sent_at",
    "validated_at",
    "emailed_at",
    "created_at",
    "updatedAt",
  ],
  journal_entries: ["created_at"],
  ledger_accounts: ["created_at", "updatedAt"],
  orders: ["created_at", "updatedAt"],
  order_items: [],
  payment_receipts: ["reviewed_at", "created_at", "updatedAt"],
  plans: ["created_at", "updatedAt"],
  products: ["created_at", "updatedAt"],
  providers: ["created_at", "updatedAt"],
  purchase_items: [],
  purchases: ["date", "created_at", "updatedAt"],
  quotation_items: [],
  quotations: ["valid_until", "created_at", "updatedAt"],
  roles: ["created_at", "updatedAt"],
  service_transactions: ["created_at", "updatedAt"],
  services: ["created_at", "updatedAt"],
  stores: [
    "resolution_start_date",
    "resolution_end_date",
    "created_at",
    "updatedAt",
  ],
  subscriptions: [
    "start_date",
    "end_date",
    "trial_end_date",
    "last_billed_at",
    "next_billing_at",
    "created_at",
    "updatedAt",
  ],
  table_sessions: ["started_at", "closed_at"],
  tax_rates: ["created_at", "updatedAt"],
  users: ["created_at", "updatedAt"],
};

// ─── Tables in dependency order ──────────────────────────────────────────────

const MIGRATION_ORDER = [
  "users",
  "plans",
  "stores",
  "subscriptions",
  "categories",
  "providers",
  "tax_rates",
  "products",
  "customers",
  "bar_tables",
  "table_sessions",
  "services",
  "cash_registers",
  "orders",
  "order_items",
  "comanda_items",
  "service_transactions",
  "inventory_movements",
  "purchases",
  "purchase_items",
  "expenses",
  "ledger_accounts",
  "journal_entries",
  "roles",
  "employees",
  "invoices",
  "credit_notes",
  "contingency_invoices",
  "quotations",
  "quotation_items",
  "payment_receipts",
];

// ─── Helper: convert a SQLite row value for PostgreSQL ───────────────────────

function convertValue(
  value: any,
  table: string,
  column: string
): any {
  if (value === null || value === undefined) return null;

  // Boolean conversion: SQLite stores 0/1
  const boolCols = BOOLEAN_COLUMNS[table];
  if (boolCols && boolCols.includes(column)) {
    return value === 1 || value === true ? true : false;
  }

  // DateTime columns: keep as ISO string (PostgreSQL can parse ISO8601 into TIMESTAMPTZ)
  const dtCols = DATETIME_COLUMNS[table];
  if (dtCols && dtCols.includes(column)) {
    // Ensure it's a valid string; SQLite stores as ISO8601 text
    if (typeof value === "string") return value;
    if (typeof value === "number") return new Date(value).toISOString();
    return value;
  }

  return value;
}

// ─── Helper: build INSERT query for a table ──────────────────────────────────

function buildInsertQuery(
  tableName: string,
  columns: string[]
): { sql: string; paramPlaceholders: string[] } {
  const colList = columns.map((c) => `"${c}"`).join(", ");
  const paramList = columns.map((_, i) => `$${i + 1}`).join(", ");
  const sql = `INSERT INTO "${tableName}" (${colList}) VALUES (${paramList})`;
  return { sql, paramPlaceholders: columns.map((_, i) => `$${i + 1}`) };
}

// ─── Main migration function ─────────────────────────────────────────────────

async function migrate() {
  console.log("═══════════════════════════════════════════════════════");
  console.log("  Viva POS — SQLite → PostgreSQL Migration");
  console.log("═══════════════════════════════════════════════════════");
  console.log();

  // Open SQLite (read-only)
  console.log(`📂 Opening SQLite: ${SQLITE_PATH}`);
  const sqlite = new Database(SQLITE_PATH, { readonly: true });

  // Open PostgreSQL
  console.log(`🐘 Connecting to PostgreSQL: ${PG_CONFIG.host}:${PG_CONFIG.port}/${PG_CONFIG.database}`);
  const pgPool = new Pool(PG_CONFIG);
  const pgClient = await pgPool.connect();

  const results: Record<string, { sqlite: number; pg: number }> = {};
  const errors: string[] = [];

  try {
    // Start PostgreSQL transaction
    await pgClient.query("BEGIN");
    console.log("✅ PostgreSQL transaction started\n");

    // Disable triggers temporarily for speed
    await pgClient.query("SET session_replication_role = 'replica'");

    for (const tableName of MIGRATION_ORDER) {
      // Get column names from SQLite
      const colInfo = sqlite
        .query(`PRAGMA table_info("${tableName}")`)
        .all() as Array<{ name: string }>;
      const columns = colInfo.map((c) => c.name);

      if (columns.length === 0) {
        console.log(`⚠️  ${tableName}: no columns found, skipping`);
        continue;
      }

      // Read all rows from SQLite
      const rows = sqlite.query(`SELECT * FROM "${tableName}"`).all() as Array<
        Record<string, any>
      >;
      const sqliteCount = rows.length;

      if (sqliteCount === 0) {
        console.log(`   ${tableName}: 0 rows (empty, skipping)`);
        results[tableName] = { sqlite: 0, pg: 0 };
        continue;
      }

      // Build INSERT query
      const { sql } = buildInsertQuery(tableName, columns);

      // Insert each row into PostgreSQL
      let insertedCount = 0;
      for (const row of rows) {
        const values = columns.map((col) => convertValue(row[col], tableName, col));
        try {
          await pgClient.query(sql, values);
          insertedCount++;
        } catch (err: any) {
          const errMsg = `${tableName} row insert failed: ${err.message} | Data: ${JSON.stringify(row)}`;
          errors.push(errMsg);
          console.error(`   ❌ ${errMsg}`);
        }
      }

      results[tableName] = { sqlite: sqliteCount, pg: insertedCount };
      const status =
        sqliteCount === insertedCount
          ? "✅"
          : "⚠️ ";
      console.log(
        `   ${status} ${tableName}: ${insertedCount}/${sqliteCount} rows migrated`
      );
    }

    // Re-enable triggers
    await pgClient.query("SET session_replication_role = 'origin'");

    // Reset autoincrement sequences for ALL tables
    console.log("\n🔄 Resetting autoincrement sequences...");
    const sequenceTables = MIGRATION_ORDER.filter((t) => {
      // Only tables with autoincrement id
      return true;
    });

    for (const tableName of sequenceTables) {
      // Find the sequence name for this table's id column
      const seqRes = await pgClient.query(
        `SELECT pg_get_serial_sequence('"${tableName}"', 'id') as seq_name`
      );
      const seqName = seqRes.rows[0]?.seq_name;

      if (seqName) {
        await pgClient.query(
          `SELECT setval('${seqName}', COALESCE((SELECT MAX("id") FROM "${tableName}"), 1), COALESCE((SELECT MAX("id") FROM "${tableName}") > 0, false))`
        );
      }
    }
    console.log("   ✅ All sequences reset");

    // Commit transaction
    await pgClient.query("COMMIT");
    console.log("\n✅ PostgreSQL transaction committed");

  } catch (err: any) {
    console.error(`\n❌ FATAL ERROR: ${err.message}`);
    await pgClient.query("ROLLBACK").catch(() => {});
    process.exit(1);
  } finally {
    pgClient.release();
    await pgPool.end();
    sqlite.close();
  }

  // ─── Summary ──────────────────────────────────────────────────────────────

  console.log("\n═══════════════════════════════════════════════════════");
  console.log("  MIGRATION SUMMARY");
  console.log("═══════════════════════════════════════════════════════");

  let totalSqlite = 0;
  let totalPg = 0;
  for (const [table, counts] of Object.entries(results)) {
    totalSqlite += counts.sqlite;
    totalPg += counts.pg;
    if (counts.sqlite > 0) {
      const status =
        counts.sqlite === counts.pg ? "✅" : "⚠️ ";
      console.log(
        `  ${status} ${table.padEnd(30)} ${String(counts.pg).padStart(5)} / ${counts.sqlite}`
      );
    }
  }

  console.log("  " + "─".repeat(47));
  console.log(
    `  📊 TOTAL: ${totalPg} / ${totalSqlite} rows migrated`
  );

  if (errors.length > 0) {
    console.log(`\n⚠️  ${errors.length} error(s) encountered:`);
    for (const err of errors) {
      console.log(`  ❌ ${err}`);
    }
  } else {
    console.log("\n🎉 Migration completed successfully with no errors!");
  }

  console.log("═══════════════════════════════════════════════════════");
}

// Run
migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
