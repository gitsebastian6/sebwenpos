/**
 * Migration script: Move PaymentReceipt base64 fileData to disk storage.
 *
 * This script:
 * 1. Finds all receipts with fileData but no filePath
 * 2. Decodes base64 data and saves to uploads/receipts/
 * 3. Updates the DB record with the filePath and clears fileData
 *
 * Usage: npx tsx scripts/migrate-receipts-to-files.ts
 */

import { PrismaClient } from '@prisma/client'
import { writeFile, mkdir } from 'fs/promises'
import { join, extname } from 'path'
import { randomUUID } from 'crypto'

const prisma = new PrismaClient()
const UPLOADS_DIR = join(process.cwd(), 'uploads')

function mimeTypeToExtension(mimeType: string): string {
  const map: Record<string, string> = {
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/jpg': '.jpg',
    'image/webp': '.webp',
    'image/heic': '.heic',
    'image/heif': '.heif',
    'application/pdf': '.pdf',
  }
  return map[mimeType] || '.bin'
}

async function migrate() {
  console.log('═══════════════════════════════════════════')
  console.log('  Receipt File Migration: base64 → disk')
  console.log('═══════════════════════════════════════════')

  // Find receipts with fileData but no filePath
  const receipts = await prisma.paymentReceipt.findMany({
    where: {
      fileData: { not: null },
      filePath: null,
    },
    select: {
      id: true,
      fileName: true,
      fileType: true,
      fileData: true,
      createdAt: true,
    },
  })

  console.log(`Found ${receipts.length} receipts to migrate`)

  if (receipts.length === 0) {
    console.log('Nothing to migrate. All receipts already use file storage.')
    return
  }

  let migrated = 0
  let failed = 0

  for (const receipt of receipts) {
    try {
      if (!receipt.fileData) continue

      // Decode base64
      const rawBase64 = receipt.fileData.replace(/^data:[^;]+;base64,/, '')
      const buffer = Buffer.from(rawBase64, 'base64')

      // Generate storage path: receipts/YYYY/MM/uuid.ext
      const date = new Date(receipt.createdAt)
      const year = date.getFullYear().toString()
      const month = (date.getMonth() + 1).toString().padStart(2, '0')
      const ext = extname(receipt.fileName) || mimeTypeToExtension(receipt.fileType)
      const storedName = `${randomUUID()}${ext}`
      const relativeDir = `receipts/${year}/${month}`
      const relativePath = `${relativeDir}/${storedName}`

      // Ensure directory exists
      const absoluteDir = join(UPLOADS_DIR, relativeDir)
      await mkdir(absoluteDir, { recursive: true })

      // Write file to disk
      const absolutePath = join(UPLOADS_DIR, relativePath)
      await writeFile(absolutePath, buffer)

      // Update DB record: set filePath, clear fileData
      await prisma.paymentReceipt.update({
        where: { id: receipt.id },
        data: {
          filePath: relativePath,
          fileData: null, // Clear the base64 data
        },
      })

      migrated++
      console.log(`  ✓ Receipt #${receipt.id}: ${buffer.length} bytes → ${relativePath}`)
    } catch (error) {
      failed++
      console.error(`  ✗ Receipt #${receipt.id}: Failed - ${error}`)
    }
  }

  console.log('')
  console.log('═══════════════════════════════════════════')
  console.log(`  Migration complete: ${migrated} migrated, ${failed} failed`)
  console.log('═══════════════════════════════════════════')

  // Show DB size before/after hint
  if (migrated > 0) {
    console.log('')
    console.log('💡 Tip: The database file may still be large due to SQLite WAL/pages.')
    console.log('   Run: VACUUM; to reclaim space (or use prisma db execute)')
    console.log('   PostgreSQL: VACUUM FULL payment_receipts;')
  }
}

migrate()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
