import { writeFile, mkdir, readFile, unlink, access } from 'fs/promises'
import { join, extname } from 'path'
import { randomUUID } from 'crypto'
import { logger } from './logger'

const UPLOADS_DIR = join(process.cwd(), 'uploads')

/**
 * Save a base64-encoded file to disk and return the relative path.
 * Files are stored in: uploads/receipts/YYYY/MM/uuid.ext
 */
export async function saveReceiptFile(params: {
  base64Data: string
  fileName: string
  fileType: string
}): Promise<string> {
  const { base64Data, fileName, fileType } = params

  // Strip data URL prefix if present (data:image/png;base64,...)
  const rawBase64 = base64Data.replace(/^data:[^;]+;base64,/, '')

  // Decode base64 to buffer
  const buffer = Buffer.from(rawBase64, 'base64')

  // Generate storage path: receipts/YYYY/MM/uuid.ext
  const now = new Date()
  const year = now.getFullYear().toString()
  const month = (now.getMonth() + 1).toString().padStart(2, '0')
  const ext = extname(fileName) || mimeTypeToExtension(fileType)
  const storedName = `${randomUUID()}${ext}`
  const relativeDir = `receipts/${year}/${month}`
  const relativePath = `${relativeDir}/${storedName}`

  // Ensure directory exists
  const absoluteDir = join(UPLOADS_DIR, relativeDir)
  await mkdir(absoluteDir, { recursive: true })

  // Write file
  const absolutePath = join(UPLOADS_DIR, relativePath)
  await writeFile(absolutePath, buffer)

  logger.info(`[file-storage] Saved receipt file: ${relativePath} (${buffer.length} bytes)`)

  return relativePath
}

/**
 * Read a file from disk by its relative path.
 * Returns null if the file does not exist.
 */
export async function readReceiptFile(relativePath: string): Promise<Buffer | null> {
  const absolutePath = join(UPLOADS_DIR, relativePath)
  try {
    // Check file exists before reading
    await access(absolutePath)
    return readFile(absolutePath)
  } catch (error: unknown) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ENOENT' || code === 'ENOTDIR') {
      logger.warn(`[file-storage] File not found: ${relativePath}`)
      return null
    }
    throw error
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
