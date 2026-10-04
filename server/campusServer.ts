import type { EventEmitter } from 'node:events'
import { WebSocketServer, WebSocket } from 'ws'
import type { VerifyAccess } from './access.ts'
import { attachLiveAccess } from './liveAccess.ts'
import { createCampusRoom, publishedCampusBoundary } from './campusRoom.ts'
import { CAMPUS_CAPACITY } from '../src/lib/campusProtocol.ts'
import type { LocalCoordinate } from '../src/lib/geo.ts'

export function attachCampusServer(server: EventEmitter, origin?: string, verify?: VerifyAccess, boundary: LocalCoordinate[] = publishedCampusBoundary()) {
  const room = createCampusRoom(boundary), sockets = new Map<string, WebSocket>()
  const wss = new WebSocketServer({ noServer: true, maxPayload: 16384, perMessageDeflate: false })
  const access = attachLiveAccess(server, wss, '/presence', origin, CAMPUS_CAPACITY, verify)
  const send = (ws: WebSocket, value: unknown) => { if (ws.readyState === WebSocket.OPEN && ws.bufferedAmount < 65536) ws.send(JSON.stringify(value)) }
  access.onAdmit((ws, identity) => {
    if (!room.add(identity)) { ws.close(1013, 'Campus full'); return }
    sockets.set(identity.id, ws)
    send(ws, { type: 'campus-welcome', id: identity.id, history: room.history() })
    send(ws, room.snapshot())
    ws.on('message', (bytes, binary) => {
      if (binary || ws.readyState !== WebSocket.OPEN || !access.isAdmitted(ws)) return
      let msg
      try { msg = JSON.parse(bytes.toString()) } catch { return }
      if (!msg || typeof msg !== 'object') return
      if (msg.type === 'pose') room.pose(identity.id, msg.pose, msg.activity)
      if (msg.type === 'buggy-ride') {
        const result = room.ride(identity.id, msg.driverId)
        send(ws, { type: 'buggy-result', ...result })
      }
      if (msg.type === 'chat') {
        const result = room.chat(identity.id, msg.text, msg.scope)
        if ('error' in result) send(ws, { type: 'notice', message: result.error })
        else for (const id of result.recipients) { const target = sockets.get(id); if (target) send(target, result.message) }
      }
    })
    ws.on('close', () => { sockets.delete(identity.id); room.remove(identity.id); if (!sockets.size) for (const m of room.history()) room.removeMessages(m.sender) })
  })
  const timer = setInterval(() => {
    for (const [id, ws] of sockets) { const identity = access.identity(ws); if (identity) room.updateIdentity(identity); else { room.remove(id); sockets.delete(id) } }
    if (!sockets.size) return
    const snapshot = room.snapshot()
    for (const ws of sockets.values()) send(ws, snapshot)
  }, 100)
  timer.unref()
  let closed = false
  const close = () => { if (closed) return; closed = true; clearInterval(timer); access.close() }
  server.once('close', close)
  return { access, room, close, removeMessages(id: string) { room.removeMessages(id); for (const ws of sockets.values()) send(ws, { type: 'chat-remove', sender: id }) } }
}
