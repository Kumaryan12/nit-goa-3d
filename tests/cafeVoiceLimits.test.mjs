import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createCafeVoice } from '../server/cafeVoice.ts'
import { attachCampusServer } from '../server/campusServer.ts'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { WebSocket } from 'ws'
import { CAFE_VOICE_LIMIT_MS as LIMIT, CAFE_VOICE_WARNING_MS as WARNING, CAFE_VOICE_COOLDOWN_MS as COOLDOWN, CafeVoiceClock, parseCafeVoiceTiming, cafeVoiceTime } from '../src/lib/cafeVoiceLimits.ts'
import { parseCafeVoiceEvent } from '../src/lib/cafeVoiceProtocol.ts'
const tick = () => new Promise(r => setImmediate(r))
const timing = (serverTime, expiresAt) => ({ serverTime, expiresAt, cooldownUntil: expiresAt + COOLDOWN })
function fixture() {
  let now = 1000, calls = 0
  const seats = new Map([['alice', 0], ['bob', 0]])
  const packets = []
  const voice = createCafeVoice(id => seats.has(id) ? { table: seats.get(id), name: id } : null, (id, value) => packets.push({ id, ...value }), { iceProvider: async () => { calls++; return { iceServers: [{ urls: ['stun:stun.test'] }], expiresAt: now + LIMIT } } }, () => now)
  return { voice, seats, packets, state: id => packets.findLast(p => p.id === id && p.type === 'cafe-voice-state'), at: t => { now = t }, calls: () => calls }
}
test('server assigns a ten-minute deadline, warns once at nine minutes, and rejects signals after expiry', async t => {
  const f = fixture(); t.after(() => f.voice.close())
  f.voice.handle('alice', { type: 'cafe-voice-join', expiresAt: Infinity, cooldownUntil: 0 })
  f.voice.handle('bob', { type: 'cafe-voice-join' }); await tick()
  const old = f.state('alice'), bob = f.state('bob')
  assert.deepEqual(old.timing, timing(1000, 1000 + LIMIT))
  assert.ok(parseCafeVoiceEvent(old))
  f.at(1000 + LIMIT - WARNING - 1); const before = f.packets.length; f.voice.reconcile(); assert.equal(f.packets.length, before)
  f.at(1000 + LIMIT - WARNING); f.voice.reconcile(); assert.equal(f.packets.length, before + 2)
  f.voice.reconcile(); assert.equal(f.packets.length, before + 2, 'the warning is sent once per caller')
  f.at(1000 + LIMIT); f.voice.reconcile()
  assert.equal(f.state('alice').table, null); assert.equal(f.state('bob').table, null)
  assert.equal(f.state('alice').reason, 'limit'); assert.equal(f.state('alice').timing.cooldownUntil, 1000 + LIMIT + COOLDOWN)
  const delivered = f.packets.filter(p => p.type === 'cafe-voice-signal').length
  f.voice.handle('alice', { type: 'cafe-voice-signal', sessionId: old.sessionId, to: 'bob', toSessionId: bob.sessionId, signal: { kind: 'offer', sdp: 'audio', connectionId: 'old-call' } })
  assert.equal(f.packets.filter(p => p.type === 'cafe-voice-signal').length, delivered)
})
test('early leaving, disconnects and changing tables start a cooldown that cannot be reset by rejoining or forged timestamps', async t => {
  for (const method of ['leave', 'disconnect', 'change-table']) {
    const f = fixture(); t.after(() => f.voice.close())
    f.voice.handle('alice', { type: 'cafe-voice-join' }); await tick()
    const first = f.state('alice').sessionId
    f.at(5000)
    if (method === 'leave') f.voice.handle('alice', { type: 'cafe-voice-leave' })
    if (method === 'disconnect') f.voice.remove('alice')
    if (method === 'change-table') { f.seats.set('alice', 1); f.voice.reconcile() }
    assert.equal(f.state('alice').timing.expiresAt, 5000)
    f.at(5000 + COOLDOWN - 1)
    f.voice.handle('alice', { type: 'cafe-voice-join', id: 'another-account', serverTime: Infinity, cooldownUntil: 0 })
    assert.equal(f.state('alice').sessionId, null); assert.equal(f.calls(), 1, 'cooldown issues no relay credentials')
    f.voice.handle('alice', { type: 'cafe-voice-status' })
    assert.equal(f.packets.at(-1).timing.cooldownUntil, 5000 + COOLDOWN)
    f.at(5000 + COOLDOWN)
    f.voice.handle('alice', { type: 'cafe-voice-join' }); await tick()
    assert.notEqual(f.state('alice').sessionId, first)
    assert.equal(f.state('alice').timing.expiresAt, 5000 + COOLDOWN + LIMIT)
  }
})
test('muting, roster changes and duplicate joins preserve each person’s deadline; late joiners receive their own ten minutes', async t => {
  const f = fixture(); t.after(() => f.voice.close()); f.voice.handle('alice', { type: 'cafe-voice-join' }); await tick()
  const first = f.state('alice')
  f.at(1000 + 300000); f.voice.handle('bob', { type: 'cafe-voice-join' }); await tick()
  f.voice.handle('alice', { type: 'cafe-voice-mic', sessionId: first.sessionId, mic: true })
  f.voice.handle('alice', { type: 'cafe-voice-join' })
  assert.equal(f.state('alice').timing.expiresAt, 1000 + LIMIT)
  assert.equal(f.state('bob').timing.expiresAt, 301000 + LIMIT)
  f.at(1000 + LIMIT); f.voice.reconcile()
  assert.equal(f.state('alice').table, null); assert.equal(f.state('bob').table, 0)
})
test('relative clock survives device-clock skew and delayed snapshots; cooldown and formatting have exact boundaries', () => {
  let now = 3000
  const clock = new CafeVoiceClock(() => now)
  clock.sync(timing(1_000_000, 1_000_000 + LIMIT)); assert.equal(clock.read().remainingMs, LIMIT)
  now += LIMIT - WARNING; assert.equal(clock.read().remainingMs, WARNING)
  // Receiving an older, delayed snapshot must never grant more time.
  clock.sync(timing(1_000_000, 1_000_000 + LIMIT)); assert.equal(clock.read().remainingMs, WARNING)
  now += WARNING; assert.deepEqual(clock.read(), { remainingMs: 0, cooldownMs: COOLDOWN })
  now += COOLDOWN; assert.deepEqual(clock.read(), { remainingMs: 0, cooldownMs: 0 })
  assert.equal(cafeVoiceTime(LIMIT), '10:00'); assert.equal(cafeVoiceTime(59001), '1:00'); assert.equal(cafeVoiceTime(-1), '0:00')
  const good = timing(1000, 1000 + LIMIT)
  for (const bad of [{ ...good, serverTime: NaN }, { ...good, cooldownUntil: Infinity }, { ...good, expiresAt: good.expiresAt + 1 }, { ...good, cooldownUntil: good.cooldownUntil + 1 }]) assert.equal(parseCafeVoiceTiming(bad), null)
  assert.equal(parseCafeVoiceEvent({ type: 'cafe-voice-limits', timing: { ...good, cooldownUntil: 0 } }), null)
})
const until = async check => { const end = Date.now() + 5000; while (Date.now() < end) { const value = check(); if (value) return value; await new Promise(r => setTimeout(r, 10)) } throw new Error('Timed out') }
test('real socket expiry stops voice while retaining café seating and drinks, with authenticated cooldown on reconnect', async t => {
  let offset = 0
  const voiceNow = () => Date.now() + offset
  const boundary = [{ x: -100, z: -100 }, { x: 100, z: -100 }, { x: 100, z: 100 }, { x: -100, z: 100 }]
  const seats = [{ id: 'cafe-0-0', x: 10, y: 0, z: 10, row: 0, yaw: 0, seatHeight: .44 }]
  const http = createServer((_req, res) => res.end('fixture')), peers = []
  const live = attachCampusServer(http, undefined, async id => ({ id, name: id, role: 'member', expiresAt: Date.now() + 3600000 }), boundary, seats, undefined, [], {}, voiceNow)
  let heartbeat
  t.after(async () => { clearInterval(heartbeat); peers.forEach(p => p.ws.terminate()); live.close(); await new Promise(r => http.close(r)) })
  http.listen(0, '127.0.0.1'); await once(http, 'listening')
  const origin = `http://127.0.0.1:${http.address().port}`
  const connect = async () => {
    const ws = new WebSocket(origin.replace('http:', 'ws:') + '/presence', { origin }), packets = []
    ws.on('error', () => {}); ws.on('message', b => packets.push(JSON.parse(b.toString()))); ws.on('open', () => ws.send(JSON.stringify({ type: 'authenticate', token: 'alice' })))
    const p = { ws, packets, send: msg => ws.send(JSON.stringify(msg)) }; peers.push(p)
    await until(() => packets.some(m => m.type === 'campus-welcome')); return p
  }
  const first = await connect()
  const pose = { ...seats[0], epoch: 1, active: true, visible: true, moving: false, running: false, space: 'outdoors', vehicle: 'walk' }
  first.send({ type: 'pose', activity: 'walk', pose }); await until(() => live.room.poseFor('alice'))
  first.send({ type: 'social-action', action: 'sit', seatId: seats[0].id }); await until(() => live.room.snapshot().people[0].social)
  heartbeat = setInterval(() => { if (first.ws.readyState === WebSocket.OPEN) first.send({ type: 'pose', activity: 'walk', pose: live.room.poseFor('alice') }) }, 100)
  first.send({ type: 'cafe-drink', action: 'get', kind: 'coffee' }); await until(() => live.room.snapshot().people[0].drink)
  first.send({ type: 'cafe-voice-join', mic: false }); const joined = await until(() => first.packets.find(m => m.type === 'cafe-voice-state' && m.sessionId))
  offset = LIMIT; await until(() => first.packets.some(m => m.type === 'cafe-voice-state' && m.reason === 'limit'))
  const person = live.room.snapshot().people[0]
  assert.equal(person.social.action, 'sit'); assert.equal(person.drink.kind, 'coffee')
  first.ws.terminate(); clearInterval(heartbeat); await until(() => !live.room.poseFor('alice'))
  const next = await connect()
  next.send({ type: 'pose', activity: 'walk', pose }); await until(() => live.room.poseFor('alice'))
  // Respect the existing social-action rate limit across reconnects.
  await new Promise(r => setTimeout(r, 700))
  next.send({ type: 'social-action', action: 'sit', seatId: seats[0].id }); await until(() => live.room.snapshot().people[0].social)
  next.send({ type: 'cafe-voice-join', expiresAt: Date.now() + LIMIT, cooldownUntil: 0 })
  const blocked = await until(() => next.packets.find(m => m.type === 'cafe-voice-state'))
  assert.equal(blocked.sessionId, null); assert.equal(blocked.timing.cooldownUntil, joined.timing.expiresAt + COOLDOWN)
})

test('a clock tick between server reads cannot produce an invalid cooldown timestamp', async t => {
  let now = 1000, state
  const voice = createCafeVoice(() => ({ table: 0, name: 'Alice' }), (_id, packet) => { if (packet.type === 'cafe-voice-state') state = packet }, {}, () => now++)
  t.after(() => voice.close()); voice.handle('alice', { type: 'cafe-voice-join' }); await tick()
  assert.ok(parseCafeVoiceEvent(state))
  assert.equal(state.timing.cooldownUntil - state.timing.expiresAt, COOLDOWN)
})
