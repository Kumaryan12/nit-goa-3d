import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { WebSocket } from 'ws'
import { CampusStream, LIVE_KEEPALIVE_MS } from '../server/campusStream.ts'
import { campusWireSnapshot, applyCampusDelta } from '../src/lib/campusWire.ts'
import { parseCampusSnapshot } from '../src/lib/campusProtocol.ts'
import { campusSnapshotForViewer } from '../server/campusLocator.ts'
import { attachCampusServer } from '../server/campusServer.ts'
import { LiveStateCadence } from '../server/liveBandwidth.ts'

const pose = extra => ({ x: 0, y: 0, z: 0, yaw: 0, epoch: 1, moving: false, running: false, active: true, visible: true, vehicle: 'walk', airborne: false, pitch: 0, space: 'outdoors', ...extra })
const person = (id, extra = {}) => ({ id, name: id, handle: null, color: 'forest', activity: 'walk', pose: pose(), ...extra })
const state = (sequence, people) => ({ type: 'campus-state', sequence, serverTime: 10000 + sequence * 100, people })
const decode = (message, previous = null) => { const value = JSON.parse(message); return value.type === 'campus-delta' ? applyCampusDelta(value, previous) : parseCampusSnapshot(value) }

test('compact campus frames preserve motion, metadata changes, joining, disappearing, vehicles and teleports', () => {
  const stream = new CampusStream()
  let before = null, time = 0
  const scenes = [
    state(1, [person('alice'), person('bob')]),
    state(2, [person('alice'), person('bob', { pose: pose({ x: .4123456, y: .0245123, yaw: .401223, moving: true }) })]),
    state(3, [person('alice', { name: 'New name' }), person('bob', { pose: pose({ x: 10, epoch: 2, vehicle: 'buggy', impactAck: 2 }) })]),
    state(4, [person('alice'), person('bob', { pose: pose({ space: 'seminar:0', y: 4, epoch: 3 }) }), person('charlie')]),
    state(5, [person('alice'), person('bob', { pose: null })]),
    state(6, [person('alice'), person('bob', { pose: pose({ space: 'hostel:1', y: 8, epoch: 4, yaw: Math.PI }) })]),
  ]
  for (const next of scenes) {
    const encoded = stream.next(next, true, time += 100)
    const decoded = decode(encoded, before)
    assert.deepEqual(decoded, campusWireSnapshot(next)); before = decoded
  }
})

test('idle clients receive bounded keepalives and sparse changes retain their last sent baseline', () => {
  for (const compact of [false, true]) {
    const stream = new CampusStream(), first = state(1, [person('alice'), person('bob')])
    const before = decode(stream.next(first, compact, 0))
    for (let i = 2; i < 50; i++) assert.equal(stream.next(state(i, first.people), compact, i * 100), null)
    const heartbeat = stream.next(state(50, first.people), compact, LIVE_KEEPALIVE_MS)
    const after = decode(heartbeat, before)
    assert.ok(after); assert.equal(after.sequence, 50)
    // Skipping a tick (e.g. socket backpressure) must not create a missing base.
    const changed = state(80, [person('alice'), person('bob', { pose: pose({ x: 1, moving: true }) })])
    const next = stream.next(changed, compact, 5100)
    assert.deepEqual(decode(next, after), campusWireSnapshot(changed))
    assert.equal(JSON.parse(stream.next(state(81, changed.people), compact, 5200, true)).type, 'campus-state')
    assert.equal(JSON.parse(stream.next(state(400, changed.people), compact, 40000)).type, 'campus-state')
  }
})

test('delta decoding rejects missing baselines, duplicate identities, invalid poses and forged activity state', () => {
  const stream = new CampusStream(), before = decode(stream.next(state(1, [person('alice'), person('bob')]), true, 0))
  const patch = JSON.parse(stream.next(state(2, [person('alice'), person('bob', { pose: pose({ x: 1, moving: true }) })]), true, 100))
  assert.equal(patch.type, 'campus-delta'); assert.ok(applyCampusDelta(patch, before))
  assert.equal(applyCampusDelta(patch, null), null)
  for (const bad of [
    { baseSequence: 0 }, { sequence: 1 }, { serverTime: Infinity }, { removed: ['unknown'] },
    { people: [person('bob')], poses: patch.poses }, { poses: [patch.poses[0], patch.poses[0]] },
    { poses: [['unknown', null]] }, { poses: [['bob', null, 1]] },
    { poses: [['bob', 0, 0, 0, 0, 128, 'outdoors', 1, null, null]] },
    { poses: [['bob', 0, 0, 0, 0, 96, 'outdoors', 1, null, null]] },
    { poses: [['bob', 0, 0, 0, 0, 12, 'hostel:99', 1, null, null]] },
    { poses: [['bob', 1500, 0, 0, 0, 12, 'outdoors', 1, null, null]] },
    { people: [person('bob', { social: { action: 'sit', seatId: 'chapora-0-0', seatHeight: .56, startedAt: 1000, until: 5000 } })], poses: [] },
  ]) assert.equal(applyCampusDelta({ ...patch, ...bad }, before), null, JSON.stringify(bad))
  assert.equal(before.people[1].pose.x, 0, 'bad patches cannot mutate the current scene')
})

test('viewer-specific baselines erase opted-out coordinates and restore them only within permitted range', () => {
  const stream = new CampusStream(), alice = person('alice'), bob = person('bob', { locatorVisible: false, pose: pose({ x: 1 }) })
  let before = decode(stream.next(campusSnapshotForViewer(state(1, [alice, bob]), 'alice'), true, 0))
  const hidden = campusSnapshotForViewer(state(2, [alice, { ...bob, pose: pose({ x: 200 }) }]), 'alice')
  const packet = stream.next(hidden, true, 100)
  assert.deepEqual(JSON.parse(packet).poses.find(row => row[0] === 'bob'), ['bob', null], 'hidden coordinates never enter a delta')
  before = decode(packet, before); assert.equal(before.people[1].pose, null)
  const visible = campusSnapshotForViewer(state(3, [alice, bob]), 'alice')
  before = decode(stream.next(visible, true, 200), before)
  assert.equal(before.people[1].pose.x, 1)
})

test('football idle suppression keeps changed acknowledgements and shared state immediate', () => {
  const cadence = new LiveStateCadence(), base = { sequence: 1, serverTime: 1, ball: { x: 0 }, players: [{ id: 'alice', poseSequence: 1 }] }
  assert.equal(cadence.shouldSend(base, 0), true)
  assert.equal(cadence.shouldSend({ ...base, sequence: 2, serverTime: 100 }, 100), false)
  assert.equal(cadence.shouldSend({ ...base, players: [{ id: 'alice', poseSequence: 2 }] }, 200), true)
  assert.equal(cadence.shouldSend({ ...base, players: [{ id: 'alice', poseSequence: 2 }] }, 5200), true)
})

const waitFor = async fn => { const end = Date.now() + 6000; while (Date.now() < end) { const value = fn(); if (value) return value; await new Promise(r => setTimeout(r, 15)) } throw Error('Timed out waiting for compact presence') }
test('negotiated WebSocket compression and deltas work alongside legacy clients and recover an explicit sync', async t => {
  const server = createServer(), sockets = [], wire = new Map()
  server.on('upgrade', req => { wire.set(req.socket.remotePort, req.socket) })
  const campus = attachCampusServer(server, undefined, async id => ({ id, name: id, role: 'member', expiresAt: Date.now() + 60000 }), [{ x: -200, z: -200 }, { x: 200, z: -200 }, { x: 200, z: 200 }, { x: -200, z: 200 }, { x: -200, z: -200 }], [])
  server.listen(0, '127.0.0.1'); await once(server, 'listening')
  t.after(async () => { sockets.forEach(p => p.ws.terminate()); campus.close(); await new Promise(r => server.close(r)) })
  const connect = id => {
    const ws = new WebSocket(`ws://127.0.0.1:${server.address().port}/presence`, { origin: `http://127.0.0.1:${server.address().port}`, perMessageDeflate: id !== 'legacy' }), messages = []
    const peer = { ws, messages, state: null, invalid: 0 }
    sockets.push(peer); ws.on('error', () => {})
    ws.on('open', () => ws.send(JSON.stringify({ type: 'authenticate', token: id })))
    ws.on('message', bytes => {
      const message = JSON.parse(bytes.toString()); messages.push(message)
      if (message.type === 'campus-welcome') {
        if (id !== 'legacy') ws.send(JSON.stringify({ type: 'social-capabilities', cafeSeats: true, chaporaSeats: true, campusDelta: 1 }))
        ws.send(JSON.stringify({ type: 'pose', activity: 'walk', pose: pose() }))
      }
      if (message.type === 'campus-state' || message.type === 'campus-delta') {
        const next = decode(bytes.toString(), peer.state)
        if (!next) peer.invalid++; else peer.state = next
      }
    })
    return peer
  }
  const modern = connect('modern'), old = connect('legacy')
  await waitFor(() => sockets.every(p => p.state?.people.length === 2 && p.state.people.every(p => p.pose)))
  assert.equal(modern.ws.extensions, 'permessage-deflate'); assert.equal(old.ws.extensions, '')
  await new Promise(r => setTimeout(r, 150))
  modern.ws.send(JSON.stringify({ type: 'pose', activity: 'walk', pose: pose({ x: .3 }) }))
  await waitFor(() => sockets.every(p => p.state.people.find(p => p.id === 'modern').pose.x === .3))
  assert.ok(modern.messages.some(m => m.type === 'campus-delta'))
  assert.ok(!old.messages.some(m => m.type === 'campus-delta'))
  const index = modern.messages.length
  modern.ws.send(JSON.stringify({ type: 'campus-sync' }))
  await waitFor(() => modern.messages.slice(index).some(m => m.type === 'campus-state'))
  assert.ok(sockets.every(p => p.invalid === 0))
  old.ws.close(); await waitFor(() => modern.state.people.length === 1)
  assert.equal(modern.state.people[0].id, 'modern')
})
