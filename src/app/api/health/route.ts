import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

/**
 * GET /api/health
 * 
 * Health check endpoint for monitoring and load balancers.
 * Checks:
 *   - Application is running
 *   - Database connection is alive
 *   - Response time is acceptable
 */
export async function GET() {
  const startTime = Date.now()
  let dbStatus = 'ok'
  let dbLatency = 0

  try {
    const dbStart = Date.now()
    await db.$queryRaw`SELECT 1`
    dbLatency = Date.now() - dbStart
  } catch (error) {
    dbStatus = 'error'
    dbLatency = -1
    console.error('[Health Check] Database connection failed:', error)
  }

  const totalLatency = Date.now() - startTime
  const isHealthy = dbStatus === 'ok' && totalLatency < 5000

  return NextResponse.json(
    {
      status: isHealthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      latency: {
        total: totalLatency,
        database: dbLatency,
      },
      checks: {
        database: dbStatus,
      },
      version: process.env.npm_package_version || '1.0.0',
    },
    {
      status: isHealthy ? 200 : 503,
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    }
  )
}
