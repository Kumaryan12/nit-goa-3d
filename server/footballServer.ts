import { attachLiveAccess } from './liveAccess.ts'
import type { VerifyAccess } from './access.ts'
import type { EventEmitter } from 'node:events'
import { WebSocketServer, WebSocket } from 'ws'
import { createFootballRoom } from './footballRoom.ts'

export function attachFootballServer(
  server: EventEmitter,
  origin?: string,
  verify?: VerifyAccess,
) {
  const room = createFootballRoom(),
    wss = new WebSocketServer({
      noServer: true,
      maxPayload: 16384,
      perMessageDeflate: false,
    })
  const alive = new WeakSet<WebSocket>()
  const access = attachLiveAccess(server, wss, '/football', origin, 24, verify)
  access.onAdmit((ws, identity) => {
    const id = identity.id,
      player = room.add(id)
    if (!player) {
      ws.close(1013, 'Pitch full')
      return
    }
    alive.add(ws)
    ws.on('pong', () => alive.add(ws))
    ws.on('error', () => undefined)
    ws.send(JSON.stringify({ type: 'welcome', id, player }))
    ws.send(JSON.stringify(room.snapshot()))
    ws.on('message', (bytes, binary) => {
      if (ws.readyState !== WebSocket.OPEN) return
      if (!binary) {
        try {
          room.handle(id, JSON.parse(bytes.toString()))
        } catch {
          /* Ignore malformed game messages. */
        }
      }
    })
    ws.on('close', () => room.remove(id))
  })
  let lastTick = performance.now()
  const timer = setInterval(() => {
    const now = performance.now()
    room.tick((now - lastTick) / 1000)
    lastTick = now
    if (!wss.clients.size) return
    const message = JSON.stringify(room.snapshot())
    for (const ws of wss.clients)
      if (
        access.isAdmitted(ws) &&
        ws.readyState === WebSocket.OPEN &&
        ws.bufferedAmount < 65536
      )
        ws.send(message)
  }, 50)
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!alive.has(ws)) ws.terminate()
      else {
        alive.delete(ws)
        ws.ping()
      }
    }
  }, 30000)
  timer.unref()
  heartbeat.unref()
  let closed = false
  const close = () => {
    if (closed) return
    closed = true
    clearInterval(timer)
    clearInterval(heartbeat)
    access.close()
  }
  server.once('close', close)
  return { close, room, access }
}
