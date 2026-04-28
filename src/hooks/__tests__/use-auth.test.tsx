// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React, { type ReactNode } from 'react'
import {
  useLogin,
  useSetup,
  useResetPasswordStep1,
  useResetPasswordStep2,
  useSendOtp,
  useVerifyOtp,
  fetchOtpStatus,
  fetchAuthInit,
} from '../api/use-auth'

// ─── Test Wrapper ────────────────────────────────────────────────────────────

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 0, gcTime: 0 },
      mutations: { retry: false },
    },
  })
  return function Wrapper({ children }: { children: ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children)
  }
}

// ─── Mock data ───────────────────────────────────────────────────────────────

const mockLoginResponse = {
  user: { id: 1, fullName: 'Admin', cedula: '1234567890', role: 'OWNER' },
  store: { id: 1, name: 'Mi Tienda', currencyCode: 'COP' },
  token: 'v1.mocktoken',
  permissions: ['orders:read', 'orders:write'],
  isSuperAdmin: false,
  subscription: { status: 'ACTIVE', planName: 'Pro', endDate: '2025-12-31' },
}

const mockSetupResponse = { message: 'Admin creado exitosamente' }

// ─── useLogin ────────────────────────────────────────────────────────────────

describe('useLogin', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('logs in successfully and returns user data', async () => {
    ;(globalThis.fetch as any).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockLoginResponse),
    })

    const { result } = renderHook(() => useLogin(), { wrapper: createWrapper() })

    result.current.mutate({ cedula: '1234567890', password: 'password123' })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data).toEqual(mockLoginResponse)
    expect(result.current.data?.token).toBe('v1.mocktoken')
    expect(result.current.data?.isSuperAdmin).toBe(false)
  })

  it('sends POST to /api/auth/login with credentials', async () => {
    ;(globalThis.fetch as any).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockLoginResponse),
    })

    const { result } = renderHook(() => useLogin(), { wrapper: createWrapper() })

    result.current.mutate({ cedula: '1234567890', password: 'mypassword' })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/auth/login',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ cedula: '1234567890', password: 'mypassword' }),
      }),
    )
  })

  it('handles login error with error data preserved', async () => {
    const errorResponse = {
      error: 'Credenciales inválidas',
      subscriptionStatus: 'EXPIRED',
      retryAfter: 3600,
    }
    ;(globalThis.fetch as any).mockResolvedValue({
      ok: false,
      status: 401,
      json: () => Promise.resolve(errorResponse),
    })

    const { result } = renderHook(() => useLogin(), { wrapper: createWrapper() })

    result.current.mutate({ cedula: '1234567890', password: 'wrong' })

    await waitFor(() => expect(result.current.isError).toBe(true))

    // The error should contain the error message
    expect(result.current.error?.message).toContain('Credenciales')
    // The error should also have the raw data attached (subscriptionStatus, etc.)
    expect((result.current.error as any)?.data).toBeDefined()
    expect((result.current.error as any)?.data?.subscriptionStatus).toBe('EXPIRED')
  })

  it('preserves HTTP status on error', async () => {
    ;(globalThis.fetch as any).mockResolvedValue({
      ok: false,
      status: 429,
      json: () => Promise.resolve({ error: 'Demasiados intentos' }),
    })

    const { result } = renderHook(() => useLogin(), { wrapper: createWrapper() })

    result.current.mutate({ cedula: '1234567890', password: 'test' })

    await waitFor(() => expect(result.current.isError).toBe(true))

    expect((result.current.error as any)?.status).toBe(429)
  })
})

// ─── useSetup ────────────────────────────────────────────────────────────────

describe('useSetup', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('creates initial admin via POST', async () => {
    ;(globalThis.fetch as any).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockSetupResponse),
    })

    const { result } = renderHook(() => useSetup(), { wrapper: createWrapper() })

    result.current.mutate({
      cedula: '1234567890',
      password: 'SecurePass123',
      fullName: 'Admin Principal',
      email: 'admin@test.com',
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data).toEqual(mockSetupResponse)
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/auth/setup',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('handles setup error (already exists)', async () => {
    ;(globalThis.fetch as any).mockResolvedValue({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
      json: () => Promise.resolve({ error: 'ya está configurado' }),
    })

    const { result } = renderHook(() => useSetup(), { wrapper: createWrapper() })

    result.current.mutate({
      cedula: '1234567890',
      password: 'pass',
      fullName: 'Admin',
      email: 'admin@test.com',
    })

    await waitFor(() => expect(result.current.isError).toBe(true))

    expect(result.current.error?.message).toContain('ya está configurado')
  })
})

// ─── useResetPasswordStep1 ───────────────────────────────────────────────────

describe('useResetPasswordStep1', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('sends cedula and gets security question back', async () => {
    const mockResponse = { userId: 5, question: '¿Nombre de tu mascota?' }
    ;(globalThis.fetch as any).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    })

    const { result } = renderHook(() => useResetPasswordStep1(), { wrapper: createWrapper() })

    result.current.mutate({ cedula: '1234567890' })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data?.userId).toBe(5)
    expect(result.current.data?.question).toContain('mascota')
  })

  it('handles user not found error', async () => {
    ;(globalThis.fetch as any).mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      json: () => Promise.resolve({ error: 'Usuario no encontrado' }),
    })

    const { result } = renderHook(() => useResetPasswordStep1(), { wrapper: createWrapper() })

    result.current.mutate({ cedula: '0000000000' })

    await waitFor(() => expect(result.current.isError).toBe(true))

    expect(result.current.error?.message).toContain('Usuario no encontrado')
  })
})

// ─── useResetPasswordStep2 ───────────────────────────────────────────────────

describe('useResetPasswordStep2', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('verifies answer and resets password', async () => {
    ;(globalThis.fetch as any).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ message: 'Contraseña actualizada' }),
    })

    const { result } = renderHook(() => useResetPasswordStep2(), { wrapper: createWrapper() })

    result.current.mutate({ userId: 5, answer: 'Firulais', newPassword: 'NewPass123' })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/auth/reset-password',
      expect.objectContaining({ method: 'POST' }),
    )
  })
})

// ─── useSendOtp ──────────────────────────────────────────────────────────────

describe('useSendOtp', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('sends OTP and returns masked phone', async () => {
    const mockResponse = { userId: 5, maskedPhone: '***1234', testMode: true, testCode: '1234' }
    ;(globalThis.fetch as any).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    })

    const { result } = renderHook(() => useSendOtp(), { wrapper: createWrapper() })

    result.current.mutate({ cedula: '1234567890' })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data?.maskedPhone).toBe('***1234')
  })

  it('handles OTP disabled error with data preserved', async () => {
    const errorResponse = { error: 'WhatsApp no configurado', enabled: false }
    ;(globalThis.fetch as any).mockResolvedValue({
      ok: false,
      status: 400,
      json: () => Promise.resolve(errorResponse),
    })

    const { result } = renderHook(() => useSendOtp(), { wrapper: createWrapper() })

    result.current.mutate({ cedula: '1234567890' })

    await waitFor(() => expect(result.current.isError).toBe(true))

    // Error data should be preserved for caller inspection (enabled=false)
    expect((result.current.error as any)?.data?.enabled).toBe(false)
  })
})

// ─── useVerifyOtp ────────────────────────────────────────────────────────────

describe('useVerifyOtp', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('verifies OTP and resets password', async () => {
    ;(globalThis.fetch as any).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ message: 'Contraseña restablecida' }),
    })

    const { result } = renderHook(() => useVerifyOtp(), { wrapper: createWrapper() })

    result.current.mutate({ userId: 5, otp: '1234', newPassword: 'NewPass456' })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/auth/verify-otp',
      expect.objectContaining({ method: 'POST' }),
    )
  })
})

// ─── fetchOtpStatus (imperative helper, not a hook) ──────────────────────────

describe('fetchOtpStatus', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns true when OTP is enabled', async () => {
    ;(globalThis.fetch as any).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ enabled: true }),
    })

    const result = await fetchOtpStatus()
    expect(result).toBe(true)
  })

  it('returns false when OTP is disabled', async () => {
    ;(globalThis.fetch as any).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ enabled: false }),
    })

    const result = await fetchOtpStatus()
    expect(result).toBe(false)
  })

  it('returns false on fetch error', async () => {
    ;(globalThis.fetch as any).mockRejectedValue(new Error('Network error'))

    const result = await fetchOtpStatus()
    expect(result).toBe(false)
  })
})

// ─── fetchAuthInit (imperative helper, not a hook) ───────────────────────────

describe('fetchAuthInit', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns true when setup is needed', async () => {
    ;(globalThis.fetch as any).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ needsSetup: true }),
    })

    const result = await fetchAuthInit()
    expect(result).toBe(true)
  })

  it('returns false when setup is not needed', async () => {
    ;(globalThis.fetch as any).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ needsSetup: false }),
    })

    const result = await fetchAuthInit()
    expect(result).toBe(false)
  })

  it('retries once on network error then returns false', async () => {
    ;(globalThis.fetch as any).mockRejectedValue(new Error('Network error'))

    // This will take ~2 seconds due to the retry delay
    const result = await fetchAuthInit()
    expect(result).toBe(false)
    // Should have been called twice (initial + 1 retry)
    expect(globalThis.fetch).toHaveBeenCalledTimes(2)
  }, 10_000)
})
