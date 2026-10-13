import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { WebSocket } from 'ws'
import { createCafeVoice } from '../server/cafeVoice.ts'
import { createCampusRoom } from '../server/campusRoom.ts'
import { attachCampusServer } from '../server/campusServer.ts'
import { cafeSeatTable, parseCafeVoiceEvent } from '../src/lib/cafeVoiceProtocol.ts'
const identity = id => ({ id, name: id, role: 'member', expiresAt: Date.now() + 3600000 })
const boundary = [{ x: -100, z: -100 }, { x: 100, z: -100 }, { x: 100, z: 100 }, { x: -100, z: 100 }]
const seats = [0, 1, 2, 3].map(i => ({ id: `cafe-${i === 2 ? 1 : 0}-${i}`, x: 10 + i, z: 10, y: 0, yaw: 0, row: i === 2 ? 1 : 0, seatHeight: .44 }))
const pose = (seat, epoch = 1) => ({ x: seat.x, y: 0, z: seat.z, yaw: 0, epoch, active: true, visible: true, moving: false, running: false, vehicle: 'walk', space: 'outdoors' })
const until = async fn => { const deadline = Date.now() + 5000; while (Date.now() < deadline) { const v = fn(); if (v) return v; await new Promise(r => setTimeout(r, 10)) } throw new Error('Table voice timed out') }

test('table eligibility requires an actual accepted café seat, not proximity or claimed seat IDs; far tables can order and sip', () => {
  const room = createCampusRoom(boundary, seats, [{ id: 'cafe-terrace-0', x: 0, y: 0, z: 0, yaw: 0 }])
  room.add(identity('alice')); room.pose('alice', pose(seats[0]), 'walk', 1000)
  assert.equal(room.cafeTable('alice', 1100), null)
  assert.ok(room.cafe('alice', 'get', 'coffee', 1100).error)
  assert.deepEqual(room.social('alice', 'sit', seats[0].id, 1200), { ok: true })
  assert.deepEqual(room.cafeTable('alice', 1200), { table: 0, name: 'alice' })
  for (const time of [2000, 3000, 4000]) room.pose('alice', pose(seats[0], 2), 'walk', time)
  assert.deepEqual(room.cafe('alice', 'get', 'cold-coffee', 4100), { ok: true })
  for (const time of [5000, 6000, 7000]) room.pose('alice', pose(seats[0], 2), 'walk', time)
  assert.deepEqual(room.cafe('alice', 'sip', undefined, 7200), { ok: true })
  assert.equal(room.snapshot(7200).people[0].social.action, 'sit')
  assert.equal(room.snapshot(7200).people[0].drink.sipAt, 7200)
  assert.equal(room.cafeTable('alice', 9000), null, 'stale heartbeat releases seat and voice')
  assert.equal(cafeSeatTable('cafe-1-2'), 1)
  for (const id of ['cafe-9-0', 'cafe-0-8', 'cafe-0-0-extra', 'oat-0-0', null]) assert.equal(cafeSeatTable(id), null)
})

function fixture(provider) {
  let now = 1000, allowed = true, listener
  const tables = new Map([['alice', 0], ['bob', 0], ['cara', 1]])
  const packets = []
  const budget = { allowed: () => allowed, snapshot: () => undefined, refresh: async () => {}, subscribe: fn => { listener = fn; return () => { listener = undefined } } }
  const voice = createCafeVoice(id => tables.has(id) ? { table: tables.get(id), name: id } : null, (id, value) => packets.push({ id, value }), { budget, iceProvider: provider }, () => now)
  const state = id => packets.findLast(p => p.id === id && p.value.type === 'cafe-voice-state')?.value
  return { voice, packets, tables, state, tick: t => { now = t }, quota: () => { allowed = false; listener?.() } }
}
const signal = (f, from, to, changes = {}) => ({ type: 'cafe-voice-signal', sessionId: f.state(from).sessionId, to, toSessionId: f.state(to).sessionId, signal: { kind: 'offer', sdp: 'audio', connectionId: 'connection-1' }, ...changes })
test('voice is opt-in and signalling stays in the same table with server identity and current join sessions', async () => {
  const f = fixture()
  for (const id of ['alice', 'bob', 'cara']) f.voice.handle(id, { type: 'cafe-voice-join', table: 99, id: 'mallory', mic: false })
  await new Promise(r => setImmediate(r))
  assert.equal(f.state('alice').table, 0)
  assert.deepEqual(f.state('alice').members.map(m => m.id), ['alice', 'bob'])
  assert.equal(f.state('cara').members.length, 1)
  f.voice.handle('eve', { type: 'cafe-voice-join', table: 0 }); assert.ok(f.packets.find(p => p.id === 'eve' && p.value.type === 'cafe-voice-error'))
  f.packets.length = 0
  // Keep authoritative states separately: clearing packet history doesn't clear membership.
  f.voice.handle('alice', { type: 'cafe-voice-join' }); f.voice.handle('bob', { type: 'cafe-voice-join' }); f.voice.handle('cara', { type: 'cafe-voice-join' })
  const valid = signal(f, 'alice', 'bob', { from: 'cara' })
  f.voice.handle('alice', valid)
  const delivered = f.packets.findLast(p => p.value.type === 'cafe-voice-signal')
  assert.equal(delivered.id, 'bob'); assert.equal(delivered.value.from, 'alice')
  const before = f.packets.filter(p => p.value.type === 'cafe-voice-signal').length
  f.voice.handle('alice', signal(f, 'alice', 'cara'))
  f.voice.handle('alice', { ...valid, sessionId: 'forged-session' })
  f.voice.handle('alice', { ...valid, toSessionId: 'stale-join' })
  assert.equal(f.packets.filter(p => p.value.type === 'cafe-voice-signal').length, before)
  f.voice.handle('bob', { type: 'cafe-voice-leave' }); f.tick(3000); f.voice.handle('bob', { type: 'cafe-voice-join' })
  assert.notEqual(f.state('bob').sessionId, valid.toSessionId)
  f.voice.handle('alice', valid)
  assert.equal(f.packets.filter(p => p.value.type === 'cafe-voice-signal').length, before, 'late packets cannot enter a new join')
  f.tables.set('alice', 1); f.voice.reconcile(); assert.equal(f.state('alice').sessionId, null)
  f.voice.close()
})
test('ICE delivery is scoped, single-flight, discarded after standing up; quota closes all table voice', async () => {
  let finish, requests = 0
  const f = fixture(() => { requests++; return new Promise(r => { finish = r }) })
  f.voice.handle('alice', { type: 'cafe-voice-join' })
  await new Promise(r => setImmediate(r))
  const sessionId = f.state('alice').sessionId
  for (let i = 0; i < 10; i++) f.voice.handle('alice', { type: 'cafe-voice-ice-request', sessionId })
  assert.equal(requests, 1)
  f.tables.delete('alice'); f.voice.reconcile()
  finish({ iceServers: [{ urls: ['turn:relay.test'], username: 'private', credential: 'private' }], expiresAt: 600000 })
  await new Promise(r => setImmediate(r))
  assert.equal(f.packets.some(p => p.value.type === 'cafe-voice-ice'), false)
  for (const id of ['bob', 'cara']) f.voice.handle(id, { type: 'cafe-voice-join' })
  f.quota(); assert.equal(f.state('bob').table, null); assert.equal(f.state('cara').table, null)
  f.voice.handle('bob', { type: 'cafe-voice-join' }); assert.match(f.packets.at(-1).value.message, /usage limit/)
  f.voice.close()
})
test('signal rate and protocol bounds reject floods, oversized SDP and malformed memberships', async () => {
  const f = fixture(); f.voice.handle('alice', { type: 'cafe-voice-join' }); f.voice.handle('bob', { type: 'cafe-voice-join' })
  await new Promise(r => setImmediate(r))
  const packet = signal(f, 'alice', 'bob')
  f.voice.handle('alice', { ...packet, signal: { ...packet.signal, sdp: 'x'.repeat(12001) } })
  f.voice.handle('alice', { ...packet, signal: { ...packet.signal, sdp: 'v=0\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\n' } })
  for (let i = 0; i < 400; i++) f.voice.handle('alice', packet)
  assert.equal(f.packets.filter(p => p.value.type === 'cafe-voice-signal').length, 238)
  const state = f.state('alice'); assert.ok(parseCafeVoiceEvent(state))
  assert.ok(parseCafeVoiceEvent({ ...state, members: state.members.map(m => ({ ...m, name: 'N'.repeat(80) })) }), 'campus display names support up to 80 characters')
  assert.equal(parseCafeVoiceEvent({ ...state, members: state.members.map(m => ({ ...m, name: 'N'.repeat(81) })) }), null)
  assert.equal(parseCafeVoiceEvent({ ...state, members: [...state.members, ...state.members] }), null)
  assert.equal(parseCafeVoiceEvent({ ...state, table: null }), null)
  assert.equal(parseCafeVoiceEvent({ type: 'cafe-voice-signal', from: 'bob', fromSessionId: 'b', sessionId: 'a', signal: { kind: 'offer', sdp: 'audio' } }), null)
  f.voice.close()
})
test('real authenticated presence sockets share table voice and drinks; other tables and standing players receive no signals', async t => {
  const http = createServer((_req, res) => res.end('campus')), peers = []
  const live = attachCampusServer(http, undefined, async id => identity(id), boundary, seats, undefined, [], { iceProvider: async () => ({ iceServers: [{ urls: ['stun:stun.test'] }], expiresAt: Date.now() + 600000 }) })
  t.after(async () => { peers.forEach(p => p.ws.terminate()); live.close(); await new Promise(r => http.close(r)) })
  http.listen(0, '127.0.0.1'); await once(http, 'listening')
  const url = `ws://127.0.0.1:${http.address().port}/presence`
  for (const id of ['alice', 'bob', 'cara', 'dan']) {
    const ws = new WebSocket(url, { origin: url.replace('ws:', 'http:').replace('/presence', '') }), messages = []; ws.on('error', () => {}); ws.on('message', b => messages.push(JSON.parse(b.toString())))
    ws.on('open', () => ws.send(JSON.stringify({ type: 'authenticate', token: id }))); peers.push({ id, ws, messages, send: msg => ws.send(JSON.stringify(msg)) })
  }
  await until(() => peers.every(p => p.messages.some(m => m.type === 'campus-welcome')))
  peers.forEach((p, i) => p.send({ type: 'pose', activity: 'walk', pose: pose(seats[i]) }))
  await until(() => live.room.snapshot().people.every(p => p.pose))
  peers.slice(0, 3).forEach((p, i) => p.send({ type: 'social-action', action: 'sit', seatId: seats[i].id }))
  await until(() => live.room.snapshot().people.filter(p => p.social?.action === 'sit').length === 3)
  peers.forEach(p => p.send({ type: 'cafe-voice-join', mic: false, table: 0 }))
  const state = p => p.messages.findLast(m => m.type === 'cafe-voice-state')
  await until(() => peers.slice(0, 3).every(p => p.messages.some(m => m.type === 'cafe-voice-ice')))
  assert.ok(peers[3].messages.some(m => m.type === 'cafe-voice-error'))
  const [alice, bob, cara, dan] = peers
  alice.send({ type: 'cafe-drink', action: 'get', kind: 'coffee' })
  await until(() => live.room.snapshot().people.find(p => p.id === 'alice').drink)
  assert.equal(live.room.snapshot().people.find(p => p.id === 'alice').social.action, 'sit')
  const packet = { type: 'cafe-voice-signal', sessionId: state(alice).sessionId, to: 'bob', toSessionId: state(bob).sessionId, signal: { kind: 'offer', sdp: 'audio', connectionId: 'actual-room-1' }, from: 'cara' }
  alice.send(packet)
  await until(() => bob.messages.some(m => m.type === 'cafe-voice-signal'))
  assert.equal(bob.messages.find(m => m.type === 'cafe-voice-signal').from, 'alice')
  alice.send({ ...packet, to: 'cara', toSessionId: state(cara).sessionId })
  bob.send({ type: 'social-action', action: 'stop' })
  await until(() => state(bob)?.table === null)
  alice.send(packet)
  await new Promise(r => setTimeout(r, 100))
  assert.equal(bob.messages.filter(m => m.type === 'cafe-voice-signal').length, 1)
  assert.equal(cara.messages.some(m => m.type === 'cafe-voice-signal'), false)
  assert.equal(dan.messages.some(m => m.type === 'cafe-voice-signal'), false)
})
