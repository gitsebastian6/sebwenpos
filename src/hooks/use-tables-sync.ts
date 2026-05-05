'use client'
// ---------------------------------------------------------------------------
// VentifyPOS — Tables Real-Time Sync Hook (Frontend)
// ---------------------------------------------------------------------------
// Connects to the tables-sync Socket.IO server and listens for events.
// When an event is received, it invalidates the relevant TanStack Query caches
// so all employees see changes instantly.
//
// Environments:
// - Sandbox (with Caddy): Uses XTransformPort query param through the gateway
// - Docker (direct): Connects directly to localhost:3005
// ---------------------------------------------------------------------------

import { useEffect, useRef, useState, useCallback } from 'react'
import { io, Socket } from 'socket.io-client'
import { useQueryClient } from '@tanstack/react-query'

// NEXT_PUBLIC_TABLES_SYNC_URL is set in docker-compose for Docker environments
// In sandbox, we use XTransformPort through the Caddy gateway
const SYNC_PORT = 3005
const SYNC_URL = process.env.NEXT_PUBLIC_TABLES_SYNC_URL || null

function getSocketUrl(): string {
  if (SYNC_URL) {
    // Docker: direct connection (e.g. http://localhost:3005)
    return SYNC_URL
  }
  // Sandbox: through Caddy gateway with XTransformPort
  return '/?XTransformPort=' + SYNC_PORT
}

interface SyncEvent {
  _sync: boolean
  _timestamp: number
  _storeId: number
}

export function useTablesSync(storeId: number | null | undefined) {
  const queryClient = useQueryClient()
  const socketRef = useRef<Socket | null>(null)
  const storeIdRef = useRef(storeId)
  const [isConnected, setIsConnected] = useState(false)

  // Keep ref in sync
  useEffect(() => {
    storeIdRef.current = storeId
  }, [storeId])

  // Connect / disconnect / rejoin on storeId change
  useEffect(() => {
    if (!storeId) return

    // Create socket connection
    const socket = io(getSocketUrl(), {
      transports: ['websocket', 'polling'],
      forceNew: true,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 10000,
    })

    socketRef.current = socket

    socket.on('connect', () => {
      setIsConnected(true)
      // Join the store room
      socket.emit('join-store', { storeId })
    })

    socket.on('joined', (data: { storeId: number; clientsCount: number }) => {
      console.log(`[TablesSync] Joined store:${data.storeId} (${data.clientsCount} clients online)`)
    })

    // ─── Listen for all table events ───────────────────────────────────

    // Session events — invalidate tables list + specific session
    socket.on('session:opened', (eventData: SyncEvent & { session: { id: number } }) => {
      invalidateTables(queryClient)
      // Pre-warm the session cache
      queryClient.invalidateQueries({
        queryKey: ['table-session', eventData.session.id],
      })
    })

    socket.on('session:closed', (eventData: SyncEvent & { session: { id: number } }) => {
      invalidateTables(queryClient)
      queryClient.invalidateQueries({
        queryKey: ['table-session', eventData.session.id],
      })
    })

    socket.on('session:updated', (eventData: SyncEvent & { session: { id: number } }) => {
      invalidateTables(queryClient)
      queryClient.invalidateQueries({
        queryKey: ['table-session', eventData.session.id],
      })
    })

    socket.on('session:deleted', (eventData: SyncEvent) => {
      invalidateTables(queryClient)
    })

    // Comanda events — invalidate tables list + specific session
    socket.on('comanda:items-added', (eventData: SyncEvent & { sessionId: number }) => {
      invalidateTables(queryClient)
      queryClient.invalidateQueries({
        queryKey: ['table-session', eventData.sessionId],
      })
    })

    socket.on('comanda:items-updated', (eventData: SyncEvent & { sessionId: number }) => {
      invalidateTables(queryClient)
      queryClient.invalidateQueries({
        queryKey: ['table-session', eventData.sessionId],
      })
    })

    socket.on('comanda:items-removed', (eventData: SyncEvent & { sessionId: number }) => {
      invalidateTables(queryClient)
      queryClient.invalidateQueries({
        queryKey: ['table-session', eventData.sessionId],
      })
    })

    // Payment event
    socket.on('payment:processed', (eventData: SyncEvent & { sessionId: number }) => {
      invalidateTables(queryClient)
      queryClient.invalidateQueries({
        queryKey: ['table-session', eventData.sessionId],
      })
      queryClient.invalidateQueries({
        queryKey: ['cash-registers'],
      })
    })

    // Table CRUD events
    socket.on('table:updated', () => invalidateTables(queryClient))
    socket.on('table:created', () => invalidateTables(queryClient))
    socket.on('table:deleted', () => invalidateTables(queryClient))

    // ─── Disconnect on unmount ─────────────────────────────────────────

    return () => {
      // Leave store room before disconnecting
      if (storeIdRef.current) {
        socket.emit('leave-store', { storeId: storeIdRef.current })
      }
      socket.disconnect()
      socketRef.current = null
    }
  }, [storeId, queryClient])

  return { isConnected }
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function invalidateTables(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ['tables'] })
}

// ─── Reusable manual invalidation callback ─────────────────────────────────

export function useTablesInvalidator() {
  const queryClient = useQueryClient()

  return useCallback(() => {
    invalidateTables(queryClient)
  }, [queryClient])
}
