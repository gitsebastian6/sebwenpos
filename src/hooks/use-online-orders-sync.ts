'use client'
// ---------------------------------------------------------------------------
// Pedidos en línea — sync en tiempo real (reusa el mini-servicio socket.io
// de mesas, puerto 3005/3006). Es un canal de aviso: la fuente de verdad es
// la query, que además hace polling de respaldo (ver use-online-orders).
// ---------------------------------------------------------------------------

import { useEffect, useRef } from 'react'
import { io, Socket } from 'socket.io-client'
import { useQueryClient } from '@tanstack/react-query'
import { playSaleSuccess } from '@/lib/pos-sounds'

const SYNC_PORT = 3005
const SYNC_URL = process.env.NEXT_PUBLIC_TABLES_SYNC_URL || null

function getSocketUrl(): string {
  if (SYNC_URL) return SYNC_URL
  return '/?XTransformPort=' + SYNC_PORT
}

export function useOnlineOrdersSync(storeId: number | null | undefined, opts?: { onNew?: () => void }) {
  const queryClient = useQueryClient()
  const onNewRef = useRef(opts?.onNew)
  useEffect(() => { onNewRef.current = opts?.onNew }, [opts?.onNew])

  useEffect(() => {
    if (!storeId) return

    const socket: Socket = io(getSocketUrl(), {
      transports: ['websocket', 'polling'],
      forceNew: true,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 10000,
    })

    socket.on('connect', () => socket.emit('join-store', { storeId }))

    socket.on('onlineorder:created', () => {
      queryClient.invalidateQueries({ queryKey: ['online-orders'] })
      try { playSaleSuccess() } catch { /* audio opcional */ }
      onNewRef.current?.()
    })

    socket.on('onlineorder:updated', () => {
      queryClient.invalidateQueries({ queryKey: ['online-orders'] })
    })

    return () => {
      socket.emit('leave-store', { storeId })
      socket.disconnect()
    }
  }, [storeId, queryClient])
}
