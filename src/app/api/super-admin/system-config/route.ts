import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { z } from 'zod'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

const configKeys = [
  'messagebird_api_key',
  'messagebird_phone',
  'messagebird_enabled',
  'messagebird_template',
  'messagebird_test_mode',
  'wompi_demo_visible',
  'wompi_enabled',
] as const

const updateConfigSchema = z.object({
  messagebird: z.object({
    apiKey: z.string().optional(),
    phoneNumber: z.string().optional(),
    enabled: z.boolean().optional(),
    template: z.string().max(500, 'Máximo 500 caracteres').optional(),
    testMode: z.boolean().optional(),
  }).optional(),
  wompi: z.object({
    demoVisible: z.boolean().optional(),
    enabled: z.boolean().optional(),
  }).optional(),
})

// Helper: get or create a setting
async function getSetting(key: string): Promise<string> {
  try {
    const setting = await db.systemSetting.findUnique({ where: { key } })
    return setting?.value ?? ''
  } catch {
    return ''
  }
}

async function setSetting(key: string, value: string) {
  await db.systemSetting.upsert({
    where: { key },
    create: { key, value },
    update: { value },
  })
}

export async function GET() {
  try {
    const settings: Record<string, string> = {}
    for (const key of configKeys) {
      settings[key] = await getSetting(key)
    }

    return NextResponse.json({
      messagebird: {
        apiKey: settings['messagebird_api_key'] || '',
        phoneNumber: settings['messagebird_phone'] || '',
        enabled: settings['messagebird_enabled'] === 'true',
        template: settings['messagebird_template'] || 'Tu código de verificación para Sebwen POS es: {{code}}. Válido por 5 minutos. No lo compartas con nadie.',
        testMode: settings['messagebird_test_mode'] === 'true',
      },
      wompi: {
        demoVisible: settings['wompi_demo_visible'] === 'true',
        enabled: settings['wompi_enabled'] === 'true',
      },
    })
  } catch (error) {
    logger.error('Get system config error:', error)
    return NextResponse.json({ error: 'Error al obtener configuración' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json()
    const data = updateConfigSchema.parse(body)
    const mb = data.messagebird
    const wp = data.wompi

    if (!mb && !wp) {
      return NextResponse.json({ error: 'Se requiere al menos un objeto de configuración' }, { status: 400 })
    }

    // Update MessageBird settings
    if (mb) {
      if (mb.apiKey !== undefined) {
        await setSetting('messagebird_api_key', mb.apiKey)
      }
      if (mb.phoneNumber !== undefined) {
        await setSetting('messagebird_phone', mb.phoneNumber)
      }
      if (mb.enabled !== undefined) {
        await setSetting('messagebird_enabled', mb.enabled.toString())
      }
      if (mb.template !== undefined) {
        await setSetting('messagebird_template', mb.template)
      }
      if (mb.testMode !== undefined) {
        await setSetting('messagebird_test_mode', mb.testMode.toString())
      }
    }

    // Update Wompi settings
    if (wp) {
      if (wp.demoVisible !== undefined) {
        await setSetting('wompi_demo_visible', wp.demoVisible.toString())
      }
      if (wp.enabled !== undefined) {
        await setSetting('wompi_enabled', wp.enabled.toString())
      }
    }

    logger.info('System config updated by Super Admin')

    return NextResponse.json({
      success: true,
      message: 'Configuración actualizada exitosamente.',
    })
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 })
    }
    logger.error('Update system config error:', error)
    return NextResponse.json({ error: 'Error al guardar configuración' }, { status: 500 })
  }
}
