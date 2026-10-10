import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { WebSocket } from 'ws'
import { createOatRoom } from '../server/oatRoom.ts'
import { attachOatServer } from '../server/oatServer.ts'
import { attachCampusServer } from '../server/campusServer.ts'
import { createConcertLayout, concertPlacement } from '../src/lib/concertSeating.ts'
import { seatConcertVisitors, publishedConcertLayout } from '../server/concertSeating.ts'
import { parseOatSnapshot } from '../src/lib/oatProtocol.ts'
import { parseCampusSnapshot } from '../src/lib/campusProtocol.ts'
import { campusSnapshotForViewer } from '../server/campusLocator.ts'

const layout = createConcertLayout({ center: { x: 0, z: 0 }, rotation: 1.3, widthScale: 1.7, depthScale: 3.5, elevation: 0 })
const pose = { x: 0, y: 0, z: 0, yaw: 0, epoch: 1, vehicle: 'walk', moving: false, running: false, active: true, visible: true, space: 'outdoors' }
const member = id => ({ id, name: id, handle: null, color: 'teal', avatarStyle: 'girl', activity: 'walk', pose: { ...pose } })

test('24 audience places are unique, stable through stage turns, and released only when their owner leaves', () => {
  const room = createOatRoom()
  for (let i = 0; i < 24; i++) room.add('person' + i, 1000)
  assert.equal(room.add('overflow'), null)
  const original = room.snapshot(1100)
  assert.ok(parseOatSnapshot(original))
  assert.deepEqual(original.participants.map(p => p.seat), Array.from({ length: 24 }, (_, i) => i))
  room.handle('person0', { type: 'stage' }, 1200)
  room.handle('person1', { type: 'stage' }, 1200)
  room.handle('person0', { type: 'leave-stage' }, 1300)
  const stageTurn = room.snapshot(1400)
  assert.equal(stageTurn.performerId, 'person1')
  assert.equal(concertPlacement(layout, stageTurn, 'person0').seat, 0)
  assert.equal(concertPlacement(layout, stageTurn, 'person1').role, 'performer')
  room.remove('person3', 1500); room.add('newcomer', 1600)
  const next = room.snapshot(1700)
  assert.equal(next.participants.find(p => p.id === 'newcomer').seat, 3)
  for (const p of next.participants.filter(p => p.id !== 'newcomer')) assert.equal(p.seat, original.participants.find(old => old.id === p.id).seat)
  assert.equal(parseOatSnapshot({ ...next, participants: next.participants.map(p => ({ ...p, seat: 0 })) }), null)
  assert.equal(parseOatSnapshot({ ...next, participants: [{ id: 'forged', name: 'forged', seat: 24 }] }), null)
})

test('listeners face the stage from real front-row benches and performer placement faces the audience', () => {
  assert.equal(layout.seats.length, 24)
  for (const seat of layout.seats) {
    assert.ok(seat.row < 3)
    const dx = layout.stage.x - seat.x, dz = layout.stage.z - seat.z
    assert.ok(-Math.sin(seat.yaw) * dx - Math.cos(seat.yaw) * dz > 0)
    assert.ok(Math.abs(seat.yaw) <= Math.PI)
  }
  const published = publishedConcertLayout()
  assert.equal(published.seats.length, 24)
  assert.ok(published.seats.every(seat => seat.row < 3))
  assert.equal(concertPlacement(layout, createOatRoom().snapshot(), 'outsider'), null)
})

test('only admitted concert members are seated, preserving profiles and removing stale ride/sit state', () => {
  const room = createOatRoom(); room.add('alice')
  const alice = { ...member('alice'), pose: { ...pose, vehicle: 'buggy' }, social: { action: 'sit', startedAt: 1000, until: 2000, seatId: 'oat-3-0' } }
  const passenger = { ...member('bob'), ride: { driverId: 'alice', seat: 1 } }
  const outsider = { ...member('outsider'), activity: 'concert' }
  const original = { type: 'campus-state', sequence: 1, serverTime: 1200, people: [alice, passenger, outsider] }
  const seated = seatConcertVisitors(original, room.snapshot(), layout)
  assert.ok(parseCampusSnapshot(seated))
  const first = seated.people[0]
  assert.deepEqual(first.concert, { role: 'audience', seat: 0 })
  assert.equal(first.social, undefined); assert.equal(first.pose.vehicle, 'walk')
  assert.equal(first.avatarStyle, 'girl'); assert.equal(first.pose.x, layout.seats[0].x)
  assert.equal(seated.people[1].ride, undefined)
  assert.equal(seated.people[2].concert, undefined)
  assert.equal(original.people[0].pose.vehicle, 'buggy', 'projection never mutates source physics state')
  room.remove('alice')
  assert.equal(seatConcertVisitors(original, room.snapshot(), layout).people[0].concert, undefined)
})

test('location hiding removes concert placement for distant viewers without breaking the roster parser', () => {
  const room = createOatRoom(); room.add('alice')
  const source = { type: 'campus-state', sequence: 1, serverTime: 1200, people: [{ ...member('alice'), locatorVisible: false }, { ...member('viewer'), pose: { ...pose, x: 300 } }] }
  const hidden = campusSnapshotForViewer(seatConcertVisitors(source, room.snapshot(), layout), 'viewer')
  assert.equal(hidden.people[0].pose, null); assert.equal(hidden.people[0].concert, undefined)
  assert.ok(parseCampusSnapshot(hidden))
})

const wait = async callback => {
  const deadline = Date.now() + 4000
  while (Date.now() < deadline) { const value = callback(); if (value) return value; await new Promise(resolve => setTimeout(resolve, 10)) }
  throw new Error('Concert seating timed out')
}
test('live campus bystanders see seated listeners, stage changes and departures across authenticated sockets', async () => {
  const server = createServer(), verify = async id => ({ id, name: id, role: 'member', expiresAt: Date.now() + 60000 })
  const oat = attachOatServer(server, undefined, verify, {})
  const campus = attachCampusServer(server, undefined, verify, [{ x: -400, z: -400 }, { x: 400, z: -400 }, { x: 400, z: 400 }, { x: -400, z: 400 }, { x: -400, z: -400 }], [], { snapshot: () => oat.room.snapshot(), layout })
  server.listen(0, '127.0.0.1'); await once(server, 'listening')
  const origin = `http://127.0.0.1:${server.address().port}`, sockets = []
  async function connect(path, id) {
    const messages = [], ws = new WebSocket(origin.replace('http:', 'ws:') + path, { origin }); sockets.push(ws)
    ws.on('message', bytes => messages.push(JSON.parse(bytes.toString())))
    await once(ws, 'open'); ws.send(JSON.stringify({ type: 'authenticate', token: id }))
    return { ws, messages }
  }
  try {
    const walker = await connect('/presence', 'alice'), spectator = await connect('/presence', 'spectator')
    await wait(() => walker.messages.find(m => m.type === 'campus-welcome'))
    walker.ws.send(JSON.stringify({ type: 'pose', activity: 'walk', pose }))
    const concert = await connect('/oat', 'alice')
    const seated = await wait(() => spectator.messages.find(m => m.people?.some(p => p.id === 'alice' && p.concert?.role === 'audience')))
    assert.ok(parseCampusSnapshot(seated))
    assert.equal(seated.people.filter(p => p.id === 'alice').length, 1)
    concert.ws.send(JSON.stringify({ type: 'stage' }))
    const stage = await wait(() => spectator.messages.find(m => m.people?.some(p => p.id === 'alice' && p.concert?.role === 'performer')))
    assert.equal(stage.people.find(p => p.id === 'alice').pose.x, layout.stage.x)
    concert.ws.send(JSON.stringify({ type: 'leave-stage' }))
    await wait(() => spectator.messages.find(m => m.sequence > stage.sequence && m.people?.some(p => p.id === 'alice' && p.concert?.role === 'audience')))
    concert.ws.close(); await once(concert.ws, 'close')
    const gone = await wait(() => spectator.messages.find(m => m.sequence > stage.sequence && m.people?.some(p => p.id === 'alice' && !p.concert)))
    assert.ok(parseCampusSnapshot(gone))
  } finally { sockets.forEach(ws => ws.terminate()); campus.close(); oat.close(); await new Promise(resolve => server.close(resolve)) }
})
