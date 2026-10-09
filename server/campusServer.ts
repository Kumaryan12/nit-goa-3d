import type { EventEmitter } from 'node:events'
import { WebSocketServer, WebSocket } from 'ws'
import type { VerifyAccess } from './access.ts'
import { attachLiveAccess } from './liveAccess.ts'
import { createCampusRoom, publishedCampusBoundary } from './campusRoom.ts'
import { CAMPUS_CAPACITY, parseCampusPose } from '../src/lib/campusProtocol.ts'
import type { LocalCoordinate } from '../src/lib/geo.ts'
import { publishedSocialSeats } from './socialSeats.ts'
import type { SocialSeat } from '../src/lib/social.ts'

export function attachCampusServer(server: EventEmitter, origin?: string, verify?: VerifyAccess, boundary: LocalCoordinate[] = publishedCampusBoundary(), seats: SocialSeat[] = publishedSocialSeats()) {
  const room = createCampusRoom(boundary, seats), sockets = new Map<string, WebSocket>(), spawnSlots = new Map<string, number>()
  const wss = new WebSocketServer({ noServer: true, maxPayload: 16384, perMessageDeflate: false })
  const access = attachLiveAccess(server, wss, '/presence', origin, CAMPUS_CAPACITY, verify)
  const send = (ws: WebSocket, value: unknown) => { if (ws.readyState === WebSocket.OPEN && ws.bufferedAmount < 65536) ws.send(JSON.stringify(value)) }
  access.onAdmit((ws, identity) => {
    if (!room.add(identity)) { ws.close(1013, 'Campus full'); return }
    sockets.set(identity.id, ws)
    let spawnSlot = 0
    while ([...spawnSlots.values()].includes(spawnSlot)) spawnSlot++
    spawnSlots.set(identity.id, spawnSlot)
    send(ws, { type: 'campus-welcome', id: identity.id, spawnSlot, history: room.history() })
    send(ws, room.snapshot())
    let correctedAt = 0
    ws.on('message', (bytes, binary) => {
      if (binary || ws.readyState !== WebSocket.OPEN || !access.isAdmitted(ws)) return
      let msg
      try { msg = JSON.parse(bytes.toString()) } catch { return }
      if (!msg || typeof msg !== 'object') return
      if (msg.type === 'pose' && room.updatePose(identity.id, msg.pose, msg.activity) === 'invalid' && Date.now() - correctedAt >= 1000) {
        const incoming = parseCampusPose(msg.pose), accepted = room.poseFor(identity.id)
        // Throttled burst packets are not movement violations and must not
        // reset client momentum. Give a genuinely invalid/stalled client the
        // accepted position so it cannot remain invisible/desynced forever.
        if (incoming && accepted && incoming.epoch === accepted.epoch && (Math.hypot(incoming.x - accepted.x, incoming.z - accepted.z) > 2 || Math.abs(incoming.y - accepted.y) > 1.5)) {
          correctedAt = Date.now(); send(ws, { type: 'pose-correction', pose: accepted })
        }
      }
      for (const { id, impact } of room.takeImpacts()) { const target = sockets.get(id); if (target) send(target, { type: 'buggy-impact', serverTime: Date.now(), impact }) }
      if (msg.type === 'social-action') send(ws, { type: 'social-result', ...room.social(identity.id, msg.action, msg.seatId) })
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
    ws.on('close', () => { if (sockets.get(identity.id) !== ws) return; sockets.delete(identity.id); spawnSlots.delete(identity.id); room.remove(identity.id); if (!sockets.size) for (const m of room.history()) room.removeMessages(m.sender) })
  })
  const timer = setInterval(() => {
    for (const [id, ws] of sockets) { const identity = access.identity(ws); if (identity) room.updateIdentity(identity); else { room.remove(id); sockets.delete(id); spawnSlots.delete(id) } }
    if (!sockets.size) return
    const snapshot = JSON.stringify(room.snapshot())
    for (const ws of sockets.values()) if (ws.readyState === WebSocket.OPEN && ws.bufferedAmount < 65536) ws.send(snapshot)
  }, 100)
  timer.unref()
  let closed = false
  const close = () => { if (closed) return; closed = true; clearInterval(timer); access.close() }
  server.once('close', close)
  return { access, room, close, removeMessages(id: string) { room.removeMessages(id); for (const ws of sockets.values()) send(ws, { type: 'chat-remove', sender: id }) } }
}
