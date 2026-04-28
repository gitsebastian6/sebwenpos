'use client'

import { useMutation } from '@tanstack/react-query'
import { mutationFetch, throwIfNotOk, queryFetch } from './query-helpers'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LoginResponse {
  user: { id: number; fullName?: string; cedula: string; phone?: string | null; email?: string | null; role?: string }
  store: { id: number; name: string; currencyCode: string }
  token: string
  csrfToken?: string
  permissions: string[]
  isSuperAdmin: boolean
  subscription?: { status: string; planName?: string; endDate?: string } | null
  availableStores?: Array<{ id: number; name: string }> | null
  error?: string
  subscriptionStatus?: string
  planName?: string
  endDate?: string
  retryAfter?: number
}

interface OtpStatusResponse {
  enabled: boolean
}

interface ResetStep1Response {
  userId: number
  question: string
  error?: string
}

interface ResetStep2Response {
  message?: string
  error?: string
}

interface SendOtpResponse {
  userId: number
  maskedPhone: string
  testCode?: string
  testMode?: boolean
  enabled?: boolean
  error?: string
}

interface VerifyOtpResponse {
  message?: string
  error?: string
}

interface SetupResponse {
  message?: string
  error?: string
}

// ---------------------------------------------------------------------------
// Mutation hooks
// ---------------------------------------------------------------------------

/**
 * Login mutation — caller handles onError for subscription blocking logic.
 */
export function useLogin() {
  return useMutation<LoginResponse, Error, { cedula: string; password: string }>({
    mutationFn: async ({ cedula, password }) => {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cedula, password }),
      })
      const data = await res.json()
      if (!res.ok) {
        // Preserve the raw error data so the caller can inspect subscriptionStatus, etc.
        const err = new Error(data.error || 'Error al iniciar sesión') as Error & { data: LoginResponse; status: number }
        ;(err as any).data = data
        ;(err as any).status = res.status
        throw err
      }
      return data as LoginResponse
    },
  })
}

/**
 * First-time admin setup.
 */
export function useSetup() {
  return useMutation<SetupResponse, Error, { cedula: string; password: string; fullName: string; email: string }>({
    mutationFn: async (body) => {
      return throwIfNotOk(
        await fetch('/api/auth/setup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      )
    },
  })
}

/**
 * Reset password step 1 — look up user by cedula, get security question.
 */
export function useResetPasswordStep1() {
  return useMutation<ResetStep1Response, Error, { cedula: string }>({
    mutationFn: async (body) => {
      return throwIfNotOk(
        await fetch('/api/auth/reset-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      )
    },
  })
}

/**
 * Reset password step 2 — verify answer and set new password.
 */
export function useResetPasswordStep2() {
  return useMutation<ResetStep2Response, Error, { userId: number; answer: string; newPassword: string }>({
    mutationFn: async (body) => {
      return throwIfNotOk(
        await fetch('/api/auth/reset-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      )
    },
  })
}

/**
 * Send WhatsApp OTP.
 */
export function useSendOtp() {
  return useMutation<SendOtpResponse, Error, { cedula: string }>({
    mutationFn: async (body) => {
      const res = await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) {
        // Preserve special fields for caller inspection (enabled=false, etc.)
        const err = new Error(data.error || 'Error al enviar código') as Error & { data: SendOtpResponse }
        ;(err as any).data = data
        throw err
      }
      return data as SendOtpResponse
    },
  })
}

/**
 * Verify WhatsApp OTP and reset password.
 */
export function useVerifyOtp() {
  return useMutation<VerifyOtpResponse, Error, { userId: number; otp: string; newPassword: string }>({
    mutationFn: async (body) => {
      return throwIfNotOk(
        await fetch('/api/auth/verify-otp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      )
    },
  })
}

// ---------------------------------------------------------------------------
// Query helpers (not hooks — used imperatively)
// ---------------------------------------------------------------------------

/**
 * Fetch OTP status (WhatsApp enabled/disabled).
 */
export async function fetchOtpStatus(): Promise<boolean> {
  try {
    const data = await queryFetch<OtpStatusResponse>('/api/auth/otp-status')
    return data.enabled === true
  } catch {
    return false
  }
}

/**
 * Fetch init status (needsSetup). Uses retry logic for server startup.
 */
export async function fetchAuthInit(): Promise<boolean> {
  try {
    const data = await queryFetch<{ needsSetup?: boolean }>('/api/auth/init')
    return data.needsSetup === true
  } catch {
    // API error (500) — server might be starting up. Retry once after 2s.
    await new Promise((resolve) => setTimeout(resolve, 2000))
    try {
      const data = await queryFetch<{ needsSetup?: boolean }>('/api/auth/init')
      return data.needsSetup === true
    } catch {
      return false
    }
  }
}
