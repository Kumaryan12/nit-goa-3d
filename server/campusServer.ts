import { createCafeVoice } from './cafeVoice.ts'
import type { OatVoiceService } from './oatVoiceService.ts'
import { campusSnapshotForViewer } from './campusLocator.ts'
import type { SiteOrigins } from './siteOrigins.ts'
import type { EventEmitter } from 'node:events'
import { WebSocketServer, WebSocket } from 'ws'
import type { VerifyAccess } from './access.ts'
import { attachLiveAccess } from './liveAccess.ts'
import { createCampusRoom, publishedCampusBoundary } from './campusRoom.ts'
import { CAMPUS_CAPACITY, parseCampusPose } from '../src/lib/campusProtocol.ts'
import type { LocalCoordinate } from '../src/lib/geo.ts'
import { publishedSocialSeats } from './socialSeats.ts'
import type { SocialSeat } from '../src/lib/social.ts'
import { seatConcertVisitors } from './concertSeating.ts'
import type { ConcertLayout } from '../src/lib/concertSeating.ts'
import type { OatSnapshot } from '../src/lib/oatProtocol.ts'
import { legacySocialSnapshot } from './socialCompatibility.ts'
import { publishedCafeCounters } from './cafeCounters.ts'
import type { CafeCounter } from '../src/lib/cafeDrinks.ts'
import { createScreeningRoom, publishedScreeningLayout } from './screening.ts'

export function attachCampusServer(server: EventEmitter, origin?: SiteOrigins, verify?: VerifyAccess, boundary: LocalCoordinate[] = publishedCampusBoundary(), seats: SocialSeat[] = publishedSocialSeats(), concert?: { snapshot: () => OatSnapshot; layout: ConcertLayout }, counters: CafeCounter[] = publishedCafeCounters(), relay?: OatVoiceService, voiceNow: () => number = Date.now) {
  const room = createCampusRoom(boundary, seats, counters), sockets = new Map<string, WebSocket>(), spawnSlots = new Map<string, number>()
  const wss = new WebSocketServer({ noServer: true, maxPayload: 16384, perMessageDeflate: false })
  const access = attachLiveAccess(server, wss, '/presence', origin, CAMPUS_CAPACITY, verify)
  const cafeSupport = new WeakSet<WebSocket>()
  const send = (ws: WebSocket, value: unknown) => { if (ws.readyState === WebSocket.OPEN && ws.bufferedAmount < 65536) ws.send(JSON.stringify(value)) }
  const screening = createScreeningRoom(publishedScreeningLayout())
  const screeningFor = (id: string) => { const state = screening.snapshot(); return screening.has(id) ? state : { ...state, messages: [] } }
  const publishScreening = () => { for (const [id, ws] of sockets) send(ws, screeningFor(id)) }
  const voice = createCafeVoice(id => room.cafeTable(id), (id, value) => { const ws = sockets.get(id); if (ws) send(ws, value) }, relay, voiceNow)
  const snapshot = () => screening.seatVisitors(concert ? seatConcertVisitors(room.snapshot(), concert.snapshot(), concert.layout) : room.snapshot())
  access.onAdmit((ws, identity) => {
    if (!room.add(identity)) { ws.close(1013, 'Campus full'); return }
    sockets.set(identity.id, ws)
    let spawnSlot = 0
    while ([...spawnSlots.values()].includes(spawnSlot)) spawnSlot++
    spawnSlots.set(identity.id, spawnSlot)
    send(ws, { type: 'campus-welcome', id: identity.id, spawnSlot, history: room.history() })
    screening.connected(identity); publishScreening()
    send(ws, legacySocialSnapshot(campusSnapshotForViewer(snapshot(), identity.id)))
    let correctedAt = 0
    ws.on('message', (bytes, binary) => {
      if (binary || ws.readyState !== WebSocket.OPEN || !access.isAdmitted(ws)) return
      let msg
      try { msg = JSON.parse(bytes.toString()) } catch { return }
      if (!msg || typeof msg !== 'object') return
      if (msg.type === 'screening') {
        const current = access.identity(ws)
        if (!current) return
        if (msg.action === 'join' && concert?.snapshot().participants.some(p => p.id === identity.id)) { send(ws, { type: 'screening-result', action: msg.action, error: 'Leave the OAT concert before joining a screening.' }); return }
        const result = screening.handle(current, msg)
        if (result.ok && msg.action === 'join') room.social(identity.id, 'stop')
        send(ws, { type: 'screening-result', action: msg.action, ...result })
        if (result.changed) publishScreening()
        else if (msg.action === 'sync') send(ws, screeningFor(identity.id))
        return
      }
      if (screening.has(identity.id) && ['social-action', 'buggy-ride', 'cafe-drink'].includes(msg.type)) { send(ws, { type: `${msg.type === 'social-action' ? 'social' : msg.type === 'buggy-ride' ? 'buggy' : 'cafe'}-result`, error: 'Leave the screening before using another activity.' }); return }
      if (screening.has(identity.id) && msg.type === 'pose' && ['football', 'concert', 'overview'].includes(msg.activity)) { screening.remove(identity.id); publishScreening() }
      if (voice.handle(identity.id, msg)) return
      if (msg.type === 'social-capabilities' && msg.cafeSeats === true && !cafeSupport.has(ws)) {
        cafeSupport.add(ws); send(ws, campusSnapshotForViewer(snapshot(), identity.id))
      }
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
      if (msg.type === 'locator-visibility') send(ws, { type: 'locator-result', ok: room.locatorVisibility(identity.id, msg.visible), visible: msg.visible === true })
      if (msg.type === 'social-action') send(ws, { type: 'social-result', ...room.social(identity.id, msg.action, msg.seatId) })
      voice.reconcile()
      if (msg.type === 'cafe-drink') send(ws, { type: 'cafe-result', ...room.cafe(identity.id, msg.action, msg.kind) })
      if (msg.type === 'buggy-ride') {
        const result = room.ride(identity.id, msg.driverId)
        send(ws, { type: 'buggy-result', ...result })
        if ('ok' in result) { const state = campusSnapshotForViewer(snapshot(), identity.id); send(ws, cafeSupport.has(ws) ? state : legacySocialSnapshot(state)) }
      }
      if (msg.type === 'chat') {
        const result = room.chat(identity.id, msg.text, msg.scope)
        if ('error' in result) send(ws, { type: 'notice', message: result.error })
        else for (const id of result.recipients) { const target = sockets.get(id); if (target) send(target, result.message) }
      }
    })
    ws.on('close', () => { if (sockets.get(identity.id) !== ws) return; sockets.delete(identity.id); spawnSlots.delete(identity.id); room.remove(identity.id); voice.remove(identity.id); if (screening.remove(identity.id)) publishScreening(); if (!sockets.size) for (const m of room.history()) room.removeMessages(m.sender) })
  })
  const timer = setInterval(() => {
    const screeningRevision = screening.snapshot().revision
    for (const [id, ws] of sockets) { const identity = access.identity(ws); if (identity) { room.updateIdentity(identity); screening.connected(identity) } else { room.remove(id); sockets.delete(id); spawnSlots.delete(id); screening.remove(id) } }
    screening.reconcile()
    if (screening.snapshot().revision !== screeningRevision) publishScreening()
    voice.reconcile()
    if (!sockets.size) return
    const state = snapshot(), legacy = legacySocialSnapshot(state), encoded = JSON.stringify(state), oldEncoded = legacy === state ? encoded : JSON.stringify(legacy), privateMarkers = state.people.some(p => p.locatorVisible === false)
    for (const [id, ws] of sockets) if (ws.readyState === WebSocket.OPEN && ws.bufferedAmount < 65536) {
      const selected = cafeSupport.has(ws) ? state : legacy
      ws.send(privateMarkers ? JSON.stringify(campusSnapshotForViewer(selected, id)) : cafeSupport.has(ws) ? encoded : oldEncoded)
    }
  }, 100)
  timer.unref()
  let closed = false
  const close = () => { if (closed) return; closed = true; clearInterval(timer); voice.close(); access.close() }
  server.once('close', close)
  return { access, room, screening, close, removeMessages(id: string) { room.removeMessages(id); if (screening.removeMessages(id)) publishScreening(); for (const ws of sockets.values()) send(ws, { type: 'chat-remove', sender: id }) } }
}
