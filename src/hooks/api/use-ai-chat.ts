'use client'

import { useMutation } from '@tanstack/react-query'
import { mutationFetch } from './query-helpers'

// ---------------------------------------------------------------------------
// AI Chat — TanStack Query hooks
// ---------------------------------------------------------------------------

interface AiChatRequest {
  message: string
  sessionId?: string | null
  currentPage?: string | null
  subscriptionStatus?: string | null
  planName?: string | null
}

interface AiChatResponse {
  success: boolean
  message: string
  sessionId: string
  usage: {
    remaining: number
    usedToday: number
    tokensThisMessage: number
  }
  error?: string
}

/**
 * Send a message to the AI chat assistant.
 * Uses TanStack Query mutation with auto-retry and error handling.
 */
export function useAiChat() {
  return useMutation<AiChatResponse, Error, AiChatRequest>({
    mutationFn: async (body) => {
      return mutationFetch<AiChatResponse>(
        '/api/ai/chat',
        'POST',
        body as unknown as Record<string, unknown>
      )
    },
    retry: 1,
  })
}

/**
 * Clear an AI chat session.
 */
export function useAiChatClear() {
  return useMutation<{ success: boolean }, Error, string>({
    mutationFn: async (sessionId) => {
      return mutationFetch<{ success: boolean }>(
        `/api/ai/chat?sessionId=${encodeURIComponent(sessionId)}`,
        'DELETE'
      )
    },
  })
}
