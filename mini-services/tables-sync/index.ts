// ---------------------------------------------------------------------------
// SebwenPOS — Tables Real-Time Sync Mini-Service
// ---------------------------------------------------------------------------
// Port 3005: Socket.IO server (frontend connects via Caddy gateway)
// Port 3006: HTTP broadcast API (backend API routes call directly)
//
// This separation avoids Socket.IO intercepting HTTP requests.
// ---------------------------------------------------------------------------

import { createServer } from 'http'
import { Server } from 'socket.io'
import type { IncomingMessage, ServerResponse } from 'http'

const WS_PORT = 3005   // Socket.IO for frontend clients
const API_PORT = 3006  // HTTP broadcast API for backend

// ─── Track connections per store ────────────────────────────────────────────

const storeClients = new Map<number, Set<string>>()

// ─── Socket.IO Server (Port 3005) ──────────────────────────────────────────

const wsServer = createServer()
const io = new Server(wsServer, {
  path: '/',
  cors: { origin: '*', methods: ['GET', 'POST'] },
  pingTimeout: 60000,
  pingInterval: 25000,
})

io.on('connection', (socket) => {
  console.log(`[TablesSync] Client connected: ${socket.id}`)

  socket.on('join-store', (data: { storeId: number }) => {
    const { storeId } = data
    socket.join(`store:${storeId}`)

    if (!storeClients.has(storeId)) {
      storeClients.set(storeId, new Set())
    }
    storeClients.get(storeId)!.add(socket.id)

    const clientCount = storeClients.get(storeId)?.size ?? 0
    console.log(`[TablesSync] ${socket.id} → store:${storeId} (${clientCount} clients)`)
    socket.emit('joined', { storeId, clientsCount: clientCount })
  })

  socket.on('leave-store', (data: { storeId: number }) => {
    storeClients.get(data.storeId)?.delete(socket.id)
    if (storeClients.get(data.storeId)?.size === 0) storeClients.delete(data.storeId)
    socket.leave(`store:${data.storeId}`)
  })

  socket.on('ping', () => socket.emit('pong', { timestamp: Date.now() }))

  socket.on('disconnect', () => {
    for (const [sid, clients] of storeClients.entries()) {
      clients.delete(socket.id)
      if (clients.size === 0) storeClients.delete(sid)
    }
    console.log(`[TablesSync] Client disconnected: ${socket.id}`)
  })

  socket.on('error', (error) => {
    console.error(`[TablesSync] Socket error (${socket.id}):`, error)
  })
})

// ─── HTTP Broadcast API Server (Port 3006) ──────────────────────────────────

function getRequestBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk) => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

const apiServer = createServer(async (req, res) => {
  // CORS
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    })
    res.end()
    return
  }

  // Health check
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({
      status: 'ok',
      uptime: process.uptime(),
      connectedClients: io.sockets.sockets.size,
      storeRooms: Object.fromEntries(
        Array.from(storeClients.entries()).map(([k, v]) => [String(k), v.size])
      ),
    }))
    return
  }

  // Broadcast endpoint
  if (req.method === 'POST' && req.url === '/broadcast') {
    try {
      const body = await getRequestBody(req)
      const { storeId, event, data } = JSON.parse(body) as {
        storeId: number; event: string; data: unknown
      }

      if (!storeId || !event) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'storeId and event required' }))
        return
      }

      const room = `store:${storeId}`
      const roomSize = io.sockets.adapter.rooms.get(room)?.size ?? 0

      io.to(room).emit(event, {
        ...data,
        _sync: true,
        _timestamp: Date.now(),
        _storeId: storeId,
      })

      console.log(`[TablesSync] Broadcast "${event}" → store:${storeId} (${roomSize} clients)`)

      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ success: true, roomSize }))
    } catch (error: any) {
      console.error(`[TablesSync] /broadcast error:`, error?.message || error)
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Internal error' }))
    }
    return
  }

  res.writeHead(404, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ error: 'Not found' }))
})

// ─── Start both servers ────────────────────────────────────────────────────

wsServer.listen(WS_PORT, () => {
  console.log(`[TablesSync] Socket.IO server on port ${WS_PORT}`)
})

apiServer.listen(API_PORT, () => {
  console.log(`[TablesSync] HTTP API server on port ${API_PORT}`)
  console.log(`[TablesSync] Broadcast: POST http://localhost:${API_PORT}/broadcast`)
  console.log(`[TablesSync] Health: GET http://localhost:${API_PORT}/health`)
})

// Graceful shutdown
function shutdown() {
  console.log('[TablesSync] Shutting down...')
  wsServer.close(() => apiServer.close(() => process.exit(0)))
}
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
