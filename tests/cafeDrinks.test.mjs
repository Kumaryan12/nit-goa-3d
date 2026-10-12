import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { WebSocket } from 'ws'
import { CAFE_DRINKS, DRINK_LIFETIME, SIP_DURATION, parseCafeDrink, nearbyCafeCounter, cafeDrinkArm } from '../src/lib/cafeDrinks.ts'
import { createCafeDrinkGeometry } from '../src/lib/cafeDrinkGeometry.ts'
import { createCampusRoom } from '../server/campusRoom.ts'
import { attachCampusServer } from '../server/campusServer.ts'
import { parseCampusSnapshot } from '../src/lib/campusProtocol.ts'

const boundary = [{ x: -100, z: -100 }, { x: 100, z: -100 }, { x: 100, z: 100 }, { x: -100, z: 100 }, { x: -100, z: -100 }]
const counters = [{ id: 'cafe-terrace-0', x: 0, y: 0, z: 0, yaw: 0 }]
const seats = [{ id: 'cafe-0-0', x: 2, y: 0, z: 2, yaw: 1, row: 0, seatHeight: .44 }]
const identity = id => ({ id, name: id, role: 'member', expiresAt: Date.now() + 3600000 })
const pose = (changes = {}) => ({ x: 0, y: 0, z: 1, yaw: 0, epoch: 1, active: true, visible: true, moving: false, running: false, space: 'outdoors', vehicle: 'walk', ...changes })
const fixture = (changes = {}, activity = 'walk') => {
  const room = createCampusRoom(boundary, seats, counters)
  room.add(identity('alice')); room.pose('alice', pose(changes), activity, 1000); return room
}
test('drink parsing has bounded lifetimes and sip timestamps, and counter access stays outside on the correct level', () => {
  const drink = { kind: 'coffee', takenAt: 1000, until: 1000 + DRINK_LIFETIME, sipAt: 5000 }
  assert.deepEqual(parseCafeDrink({ ...drink, admin: true }), drink)
  for (const change of [{ kind: 'wine' }, { until: Infinity }, { takenAt: NaN }, { until: drink.until + 1 }, { sipAt: 999 }, { sipAt: drink.until }]) assert.equal(parseCafeDrink({ ...drink, ...change }), null)
  assert.equal(nearbyCafeCounter(counters, pose()).id, counters[0].id)
  for (const change of [{ z: -1 }, { y: 4 }, { z: 5 }, { space: 'hostel:0' }]) assert.equal(nearbyCafeCounter(counters, pose(change)), null)
})
test('server checks location, identity, activity and freshness before dispensing a server-timed drink', () => {
  for (const [changes, activity] of [[{ x: 20 }, 'walk'], [{ z: -1 }, 'walk'], [{ y: 8 }, 'walk'], [{ airborne: true }, 'walk'], [{ vehicle: 'bicycle' }, 'walk'], [{ visible: false }, 'walk'], [{ space: 'hostel:0' }, 'walk'], [{}, 'football']]) {
    const room = fixture(changes, activity)
    assert.ok(room.cafe('alice', 'get', 'coffee', 1100).error)
    assert.equal(room.snapshot(1100).people[0].drink, undefined)
  }
  const moving = fixture(); assert.ok(moving.pose('alice', pose({ x: .1 }), 'walk', 1100))
  assert.ok(moving.cafe('alice', 'get', 'coffee', 1200).error, 'actual moving walker must stop')
  assert.ok(fixture().cafe('nobody', 'get', 'coffee', 1100).error)
  assert.ok(fixture().cafe('alice', 'get', 'coffee', 3100).error, 'stale walker cannot order')
  assert.ok(fixture().cafe('alice', 'get', 'anything', 1100).error)
  const room = fixture()
  assert.deepEqual(room.cafe('alice', 'get', 'cold-coffee', 1100), { ok: true })
  const accepted = room.snapshot(1100)
  assert.ok(parseCampusSnapshot(accepted))
  assert.deepEqual(accepted.people[0].drink, { kind: 'cold-coffee', takenAt: 1100, until: 1100 + DRINK_LIFETIME })
  accepted.people[0].drink.kind = 'water'
  assert.equal(room.snapshot(1200).people[0].drink.kind, 'cold-coffee', 'snapshots do not expose mutable room drink state')
  assert.ok(room.cafe('alice', 'get', 'water', 1200).error, 'orders are throttled')
})
test('drinks persist while sitting and sipping, then put-away, activity changes, expiry and departure clean them up', () => {
  const room = fixture()
  room.cafe('alice', 'get', 'coffee', 1100)
  assert.deepEqual(room.social('alice', 'sit', seats[0].id, 1800), { ok: true })
  room.pose('alice', pose({ x: 2, z: 2, epoch: 2 }), 'walk', 2500)
  room.pose('alice', pose({ x: 2, z: 2, epoch: 2 }), 'walk', 3800)
  room.pose('alice', pose({ x: 2, z: 2, epoch: 2 }), 'walk', 4100)
  assert.deepEqual(room.cafe('alice', 'sip', undefined, 4200), { ok: true })
  const snapshot = room.snapshot(4200)
  assert.equal(snapshot.people[0].social.action, 'sit')
  assert.equal(snapshot.people[0].drink.sipAt, 4200)
  assert.deepEqual(room.cafe('alice', 'put-away', undefined, 4300), { ok: true })
  assert.equal(room.snapshot(4300).people[0].drink, undefined)
  assert.equal(room.snapshot(4300).people[0].social.action, 'sit', 'putting away a drink does not stand the avatar up')
  for (const [changes, activity] of [[{ vehicle: 'buggy' }, 'walk'], [{}, 'football'], [{ space: 'hostel:0' }, 'walk']]) {
    const next = fixture(); next.cafe('alice', 'get', 'water', 1100)
    assert.ok(next.pose('alice', pose({ ...changes, epoch: 2 }), activity, 2200))
    assert.equal(next.snapshot(2200).people[0].drink, undefined)
  }
  const expired = fixture(); expired.cafe('alice', 'get', 'coffee', 1100)
  assert.equal(expired.snapshot(1100 + DRINK_LIFETIME).people[0].drink, undefined)
  expired.remove('alice'); assert.equal(expired.snapshot().people.length, 0)
})
test('sip poses remain finite, ease in and out, respect reduced motion and use one tiny mesh per drink', () => {
  const d = { kind: 'coffee', takenAt: 1000, until: 1000 + DRINK_LIFETIME, sipAt: 4000 }
  const rest = cafeDrinkArm({ ...d, sipAt: undefined }, 4000)
  assert.deepEqual(cafeDrinkArm(d, 4000), rest)
  assert.deepEqual(cafeDrinkArm(d, 4000 + SIP_DURATION), rest)
  assert.ok(cafeDrinkArm(d, 4000 + SIP_DURATION / 2).elbow > rest.elbow)
  for (let time = 4000; time < 4000 + SIP_DURATION; time += 16) {
    assert.ok(Object.values(cafeDrinkArm(d, time)).every(n => Number.isFinite(n) && Math.abs(n) < Math.PI))
    assert.deepEqual(cafeDrinkArm(d, time, true), rest)
  }
  assert.equal(cafeDrinkArm(d, d.until), null)
  for (const kind of CAFE_DRINKS) {
    const geometry = createCafeDrinkGeometry(kind)
    try { assert.ok(geometry.index.count / 3 < 600); assert.ok(geometry.boundingSphere.radius < .2); assert.ok([...geometry.getAttribute('position').array].every(Number.isFinite)) }
    finally { geometry.dispose() }
  }
})
const waitFor = async condition => {
  const end = Date.now() + 6000
  while (Date.now() < end) { const result = condition(); if (result) return result; await new Promise(resolve => setTimeout(resolve, 15)) }
  throw new Error('Café drink multiplayer timed out')
}
test('two authenticated peers see the same drink and sip; spoofed identity, timestamps and order locations are ignored', async t => {
  const http = createServer((_req, res) => res.end('campus'))
  const live = attachCampusServer(http, undefined, async id => identity(id), boundary, seats, undefined, counters), peers = []
  t.after(async () => { peers.forEach(p => p.ws.terminate()); live.close(); await new Promise(resolve => http.close(resolve)) })
  http.listen(0, '127.0.0.1'); await once(http, 'listening')
  const origin = `http://127.0.0.1:${http.address().port}`
  for (const id of ['alice', 'bob']) {
    const ws = new WebSocket(origin.replace('http:', 'ws:') + '/presence', { origin }), messages = []
    ws.on('error', () => {}); ws.on('message', bytes => messages.push(JSON.parse(bytes.toString())))
    ws.on('open', () => ws.send(JSON.stringify({ type: 'authenticate', token: id }))); peers.push({ id, ws, messages })
  }
  await waitFor(() => peers.every(p => p.messages.some(m => m.type === 'campus-welcome')))
  peers[0].ws.send(JSON.stringify({ type: 'pose', activity: 'walk', pose: pose() }))
  peers[1].ws.send(JSON.stringify({ type: 'pose', activity: 'walk', pose: pose({ x: 40 }) }))
  await waitFor(() => live.room.snapshot().people.every(p => p.pose))
  peers[0].ws.send(JSON.stringify({ type: 'cafe-drink', action: 'get', kind: 'coffee', id: 'bob', until: Infinity, takenAt: 1 }))
  const shared = await waitFor(() => peers[1].messages.find(m => m.type === 'campus-state' && m.people.some(p => p.id === 'alice' && p.drink)))
  assert.ok(parseCampusSnapshot(shared))
  assert.equal(shared.people.find(p => p.id === 'bob').drink, undefined)
  assert.ok(shared.people.find(p => p.id === 'alice').drink.takenAt > 1)
  peers[1].ws.send(JSON.stringify({ type: 'cafe-drink', action: 'get', kind: 'water', counter: counters[0] }))
  await waitFor(() => peers[1].messages.some(m => m.type === 'cafe-result' && /vending window/.test(m.error)))
  await new Promise(resolve => setTimeout(resolve, 3100))
  peers[0].ws.send(JSON.stringify({ type: 'pose', activity: 'walk', pose: pose() }))
  peers[0].ws.send(JSON.stringify({ type: 'cafe-drink', action: 'sip' }))
  await waitFor(() => peers[1].messages.some(m => m.type === 'campus-state' && m.people.some(p => p.id === 'alice' && p.drink?.sipAt)))
  peers[0].ws.send(JSON.stringify({ type: 'cafe-drink', action: 'put-away' }))
  await waitFor(() => !live.room.snapshot().people.find(p => p.id === 'alice').drink)
})
