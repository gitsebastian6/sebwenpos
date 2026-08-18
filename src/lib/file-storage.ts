import { writeFile, mkdir, readFile, unlink } from 'fs/promises'
import { join, extname } from 'path'
import { randomUUID } from 'crypto'
import { logger } from './logger'

const UPLOADS_DIR = join(process.cwd(), 'uploads')

/**
 * Save a base64-encoded file to disk and return the relative path.
 * Files are stored in: uploads/{category}/YYYY/MM/uuid.ext
 */
export async function saveCategorizedFile(params: {
  base64Data: string
  fileName: string
  fileType: string
  category: string
}): Promise<string> {
  const { base64Data, fileName, fileType, category } = params

  // Strip data URL prefix if present (data:image/png;base64,...)
  const rawBase64 = base64Data.replace(/^data:[^;]+;base64,/, '')

  // Decode base64 to buffer
  const buffer = Buffer.from(rawBase64, 'base64')

  // Generate storage path: {category}/YYYY/MM/uuid.ext
  const now = new Date()
  const year = now.getFullYear().toString()
  const month = (now.getMonth() + 1).toString().padStart(2, '0')
  const ext = extname(fileName) || mimeTypeToExtension(fileType)
  const storedName = `${randomUUID()}${ext}`
  const relativeDir = `${category}/${year}/${month}`
  const relativePath = `${relativeDir}/${storedName}`

  // Ensure directory exists
  const absoluteDir = join(UPLOADS_DIR, relativeDir)
  await mkdir(absoluteDir, { recursive: true })

  // Write file
  const absolutePath = join(UPLOADS_DIR, relativePath)
  await writeFile(absolutePath, buffer)

  logger.info(`[file-storage] Saved ${category} file: ${relativePath} (${buffer.length} bytes)`)

  return relativePath
}

/**
 * Save a base64-encoded file to disk and return the relative path.
 * Files are stored in: uploads/receipts/YYYY/MM/uuid.ext
 */
export async function saveReceiptFile(params: {
  base64Data: string
  fileName: string
  fileType: string
}): Promise<string> {
  return saveCategorizedFile({ ...params, category: 'receipts' })
}

/**
 * Save a base64-encoded legal document (RUT, Cámara de Comercio, cédula,
 * resolución DIAN) uploaded during CRM lead onboarding.
 * Files are stored in: uploads/lead-docs/YYYY/MM/uuid.ext
 */
export async function saveLeadDocumentFile(params: {
  base64Data: string
  fileName: string
  fileType: string
}): Promise<string> {
  return saveCategorizedFile({ ...params, category: 'lead-docs' })
}

/**
 * Save a base64-encoded product photo uploaded from the product form.
 * Files are stored in: uploads/products/YYYY/MM/uuid.ext
 * Unlike receipts/lead-docs, these are served publicly (see
 * /api/public/uploads/products/[...path]) since they show up on the
 * unauthenticated Tienda Virtual storefront.
 */
export async function saveProductImageFile(params: {
  base64Data: string
  fileName: string
  fileType: string
}): Promise<string> {
  return saveCategorizedFile({ ...params, category: 'products' })
}

/**
 * Read a file from disk by its relative path.
 * Returns null if the file does not exist or cannot be read.
 */
export async function readReceiptFile(relativePath: string): Promise<Buffer | null> {
  const absolutePath = join(UPLOADS_DIR, relativePath)
  try {
    // Read directly — no TOCTOU race condition with access() + readFile()
    return await readFile(absolutePath)
  } catch (error: unknown) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ENOENT' || code === 'ENOTDIR' || code === 'EACCES') {
      logger.warn(`[file-storage] File not found or inaccessible: ${relativePath} (code=${code})`)
      return null
    }
    // Unexpected errors — log but don't throw, return null so callers get 404 instead of 500
    logger.error(`[file-storage] Unexpected error reading file ${relativePath}:`, error)
    return null
  }
}

/**
 * Delete a file from disk by its relative path.
 */
export async function deleteReceiptFile(relativePath: string): Promise<void> {
  try {
    const absolutePath = join(UPLOADS_DIR, relativePath)
    await unlink(absolutePath)
    logger.info(`[file-storage] Deleted receipt file: ${relativePath}`)
  } catch (error) {
    logger.warn(`[file-storage] Failed to delete file ${relativePath}:`, error)
  }
}

/**
 * Convert MIME type to file extension.
 */
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

/**
 * Get the absolute path for the uploads directory.
 * Useful for Docker volume mounts.
 */
export function getUploadsDir(): string {
  return UPLOADS_DIR
}
