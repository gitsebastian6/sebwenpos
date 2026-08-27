import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { verifyCronSecret } from '../cron-auth'
import type { NextRequest } from 'next/server'

function fakeReq(opts: { auth?: string; secret?: string }): NextRequest {
  return {
    headers: new Headers(opts.auth ? { authorization: opts.auth } : {}),
    nextUrl: { searchParams: new URLSearchParams(opts.secret ? { secret: opts.secret } : {}) },
  } as unknown as NextRequest
}

describe('verifyCronSecret — auth de entry points automáticos', () => {
  const SECRET = 'test-cron-secret'

  beforeEach(() => { process.env.CRON_SECRET = SECRET })
  afterEach(() => { delete process.env.CRON_SECRET })

  it('acepta Authorization Bearer correcto', () => {
    expect(verifyCronSecret(fakeReq({ auth: `Bearer ${SECRET}` }))).toBe(true)
  })

  it('acepta ?secret= durante migración del scheduler', () => {
    expect(verifyCronSecret(fakeReq({ secret: SECRET }))).toBe(true)
  })

  it('rechaza secret incorrecto', () => {
    expect(verifyCronSecret(fakeReq({ auth: 'Bearer wrong' }))).toBe(false)
    expect(verifyCronSecret(fakeReq({}))).toBe(false)
  })

  it('fail-closed: sin CRON_SECRET configurado rechaza todo', () => {
    delete process.env.CRON_SECRET
    expect(verifyCronSecret(fakeReq({ auth: `Bearer ${SECRET}` }))).toBe(false)
  })
})
