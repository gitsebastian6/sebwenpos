import { db } from '@/lib/db'
import crypto from 'crypto'

const OTP_TTL_MS = 5 * 60 * 1000 // 5 minutes
const OTP_LENGTH = 6

function generateOTP(): string {
  const min = Math.pow(10, OTP_LENGTH - 1)
  const max = Math.pow(10, OTP_LENGTH) - 1
  return crypto.randomInt(min, max).toString()
}

function normalizePhone(phone: string): string {
  // Colombian phone normalization: 3001234567 or +573001234567
  let cleaned = phone.replace(/[\s\-\(\)\.]/g, '')
  if (cleaned.startsWith('+57')) cleaned = cleaned.substring(3)
  if (cleaned.startsWith('57') && cleaned.length === 12) cleaned = cleaned.substring(2)
  if (cleaned.startsWith('0')) cleaned = cleaned.substring(1)
  // Ensure 10 digits
  if (cleaned.length === 10) return `57${cleaned}`
  return cleaned
}

export interface MessageBirdConfig {
  apiKey: string
  phoneNumber: string
  enabled: boolean
  templateText: string
  testMode: boolean
}

export async function getMessageBirdConfig(): Promise<MessageBirdConfig> {
  const rows = await db.systemSetting.findMany({
    where: { key: { in: ['messagebird_api_key', 'messagebird_phone', 'messagebird_enabled', 'messagebird_template', 'messagebird_test_mode'] } },
  })
  const map = Object.fromEntries(rows.map(r => [r.key, r.value]))
  return {
    apiKey: map['messagebird_api_key'] || '',
    phoneNumber: map['messagebird_phone'] || '',
    enabled: map['messagebird_enabled'] === 'true',
    templateText: map['messagebird_template'] || `Tu código de verificación para Sebwen POS es: {{code}}. Válido por ${OTP_TTL_MS / 60000} minutos. No lo compartas con nadie.`,
    testMode: map['messagebird_test_mode'] === 'true',
  }
}

export async function isWhatsAppOTPEnabled(): Promise<boolean> {
  const config = await getMessageBirdConfig()
  // Test mode ON implicitly enables the feature (user wants to test)
  if (config.testMode) return true
  // Otherwise, respect the main toggle
  return config.enabled
}

export async function sendOTPViaWhatsApp(phone: string, userId: number): Promise<{ success: boolean; error?: string; maskedPhone?: string; testCode?: string }> {
  const config = await getMessageBirdConfig()

  // Test mode bypasses the enabled check (user wants to test)
  if (!config.testMode && !config.enabled) {
    return { success: false, error: 'WhatsApp OTP no está habilitado. Contacta al soporte.' }
  }

  if (!config.testMode && (!config.apiKey || !config.phoneNumber)) {
    return { success: false, error: 'WhatsApp OTP no está configurado correctamente. Contacta al soporte.' }
  }

  if (!phone || phone.trim().length < 7) {
    return { success: false, error: 'El usuario no tiene un número de teléfono válido.' }
  }

  const normalizedPhone = normalizePhone(phone)
  if (normalizedPhone.length < 10) {
    return { success: false, error: 'Número de teléfono no válido.' }
  }

  const otp = generateOTP()

  // ── Purge any previous unverified OTPs for this user ──
  await db.otpToken.deleteMany({
    where: { userId, verified: false },
  })

  // ── Store OTP in database (persists across restarts) ──
  await db.otpToken.create({
    data: {
      userId,
      phone: normalizedPhone,
      code: otp,
      expiresAt: new Date(Date.now() + OTP_TTL_MS),
    },
  })

  // ── TEST MODE: Skip actual API call, return the code for testing ──
  if (config.testMode) {
    const maskedPhone = normalizedPhone.length > 4 ? `***${normalizedPhone.slice(-4)}` : `***${normalizedPhone}`
    return { success: true, maskedPhone, testCode: otp }
  }

  // ── PRODUCTION MODE: Send via MessageBird Conversations API ──
  // Replace template placeholder
  const message = config.templateText.replace('{{code}}', otp)

  try {
    const fromPhone = normalizePhone(config.phoneNumber)

    const response = await fetch('https://conversations.messagebird.com/v1/messages', {
      method: 'POST',
      headers: {
        'Authorization': `AccessKey ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: `+${normalizedPhone}`,
        from: `+${fromPhone}`,
        type: 'text',
        content: {
          text: message,
        },
      }),
    })

    if (!response.ok) {
      const errorData = await response.text()
      console.error('MessageBird API error:', response.status, errorData)
      return { success: false, error: 'Error al enviar el código por WhatsApp. Intenta de nuevo.' }
    }

    // Mask phone for display
    const maskedPhone = `***${normalizedPhone.slice(-4)}`
    return { success: true, maskedPhone }
  } catch (error) {
    console.error('MessageBird request error:', error)
    return { success: false, error: 'Error de conexión con el servicio de WhatsApp. Intenta de nuevo.' }
  }
}

export async function verifyOTP(userId: number, phone: string, code: string): Promise<{ valid: boolean; error?: string }> {
  if (!code || code.length !== OTP_LENGTH) {
    return { valid: false, error: 'El código debe tener 6 dígitos.' }
  }

  const normalizedPhone = normalizePhone(phone)

  // Find latest unverified OTP for this user (not expired)
  const stored = await db.otpToken.findFirst({
    where: {
      userId,
      phone: normalizedPhone,
      verified: false,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: 'desc' },
  })

  if (!stored) {
    return { valid: false, error: 'No se encontró un código activo. Solicita uno nuevo.' }
  }

  if (stored.code !== code.trim()) {
    return { valid: false, error: 'Código incorrecto. Verifica e intenta de nuevo.' }
  }

  // Mark as verified (keeps record for audit) and delete
  await db.otpToken.update({
    where: { id: stored.id },
    data: { verified: true },
  })

  return { valid: true }
}

// ── Periodic cleanup of expired OTPs (runs in server context) ──
export async function cleanupExpiredOTPs(): Promise<number> {
  const result = await db.otpToken.deleteMany({
    where: {
      expiresAt: { lt: new Date() },
    },
  })
  return result.count
}

// Cleanup expired OTPs periodically (server-side only)
if (typeof globalThis !== 'undefined') {
  setInterval(async () => {
    try {
      const deleted = await cleanupExpiredOTPs()
      if (deleted > 0) {
        console.log(`[OTP Cleanup] Deleted ${deleted} expired OTP(s)`)
      }
    } catch {
      // Silent fail — cleanup is non-critical
    }
  }, 60_000) // every minute
}
