import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { WebSocket } from 'ws'
import { createCampusRoom } from '../server/campusRoom.ts'
import { attachCampusServer } from '../server/campusServer.ts'
import { parseCampusPose, parseCampusSnapshot, publishedCampusPose } from '../src/lib/campusProtocol.ts'
import { SOCIAL_DURATION } from '../src/lib/social.ts'
import { buildSocialSeats } from '../scripts/build-social-seats.mjs'

const boundary = [{ x: -200, z: -200 }, { x: 200, z: -200 }, { x: 200, z: 200 }, { x: -200, z: 200 }, { x: -200, z: -200 }]
const seats = [{ id: 'oat-3-0', x: 1.5, y: .3, z: 0, yaw: 1, row: 3 }, { id: 'oat-3-1', x: 2.5, y: .3, z: 0, yaw: 1, row: 3 }]
const identity = id => ({ id, name: id, role: 'member', expiresAt: Date.now() + 3600000 })
const pose = (extra = {}) => ({ x: 0, y: 0, z: 0, yaw: 0, epoch: 1, moving: false, running: false, active: true, visible: true, space: 'outdoors', ...extra })
const person = (room, id = 'alice', now = 1100) => room.snapshot(now).people.find(p => p.id === id)
const fixture = (p = pose(), activity = 'walk') => {
  const room = createCampusRoom(boundary, seats); room.add(identity('alice')); room.pose('alice', p, activity, 1000)
  return room
}

test('concert presence remains active before walking, while background and overview presence cannot emote', () => {
  const current = pose({ yaw: Math.PI * 3, moving: true })
  const concert = publishedCampusPose(current, false, 'concert', true)
  assert.equal(concert.visible, false); assert.equal(concert.active, true); assert.equal(concert.moving, false)
  assert.ok(parseCampusPose(concert))
  assert.deepEqual(fixture(concert, 'concert').social('alice', 'applause', undefined, 1100), { ok: true })
  for (const [walking, activity, focused] of [[false, 'overview', true], [false, 'concert', false], [true, 'walk', false]]) {
    const inactive = publishedCampusPose(current, walking, activity, focused)
    assert.equal(inactive.active, false)
    assert.ok(fixture(inactive, activity).social('alice', 'wave', undefined, 1100).error)
  }
})

test('social actions are server-timed, bounded, rate limited and always stoppable', () => {
  const room = fixture()
  assert.ok(room.social('unknown', 'wave', undefined, 1100).error)
  assert.deepEqual(room.social('alice', 'wave', undefined, 1100), { ok: true })
  assert.deepEqual(person(room).social, { action: 'wave', startedAt: 1100, until: 1100 + SOCIAL_DURATION.wave })
  assert.ok(room.social('alice', 'dance', undefined, 1200).error)
  assert.deepEqual(room.social('alice', 'stop', undefined, 1201), { ok: true })
  assert.equal(person(room, 'alice', 1201).social, undefined)
  assert.ok(room.social('alice', 'dance', undefined, 1202).error, 'stop cannot bypass the start cooldown')
  assert.ok(room.social('alice', 'forged-action', undefined, 1800).error)
  assert.ok(room.social('alice', 'heart', 'oat-3-0', 2500).error, 'only sitting accepts a seat identifier')
  room.pose('alice', pose(), 'walk', 3100)
  assert.deepEqual(room.social('alice', 'dance', undefined, 3200), { ok: true })
  assert.equal(person(room, 'alice', 3200).social.until, 3200 + SOCIAL_DURATION.dance)
  const copy = person(room, 'alice', 3200); copy.social.action = 'forged'
  assert.equal(person(room, 'alice', 3200).social.action, 'dance', 'snapshots cannot mutate room state')
})

test('social action bursts remain limited through stop and reconnect', () => {
  const room = fixture()
  for (let i = 0; i < 8; i++) {
    const now = 1100 + i * 700
    room.pose('alice', pose(), 'walk', now)
    assert.deepEqual(room.social('alice', 'wave', undefined, now), { ok: true })
    assert.deepEqual(room.social('alice', 'stop', undefined, now + 1), { ok: true })
  }
  room.remove('alice'); room.add(identity('alice')); room.pose('alice', pose(), 'walk', 7000)
  assert.ok(room.social('alice', 'wave', undefined, 7000).error)
  room.pose('alice', pose(), 'walk', 12000)
  assert.deepEqual(room.social('alice', 'wave', undefined, 12000), { ok: true })
})

test('actions expire, become inactive with stale presence and cancel on movement, jump or activity changes', () => {
  const room = fixture(); room.social('alice', 'wave', undefined, 1100)
  for (const now of [2000, 3000, 4000]) room.pose('alice', pose(), 'walk', now)
  assert.equal(person(room, 'alice', 4599).social.action, 'wave')
  assert.equal(person(room, 'alice', 4600).social, undefined)
  const stale = fixture(); stale.social('alice', 'dance', undefined, 1100)
  assert.equal(person(stale, 'alice', 3000).social, undefined)
  for (const [change, activity] of [[{ x: .2 }, 'walk'], [{ airborne: true }, 'walk'], [{ y: .2 }, 'walk'], [{ vehicle: 'bicycle' }, 'walk'], [{ space: 'gyan:0' }, 'walk'], [{ active: false }, 'walk'], [{ visible: false }, 'overview'], [{}, 'football']]) {
    const current = fixture(); current.social('alice', 'dance', undefined, 1100)
    assert.equal(current.pose('alice', pose(change), activity, 1200), true)
    assert.equal(person(current, 'alice', 1200).social, undefined, JSON.stringify({ change, activity }))
  }
})

test('actions require a fresh stationary walker or concert participant; seat restrictions remain stricter', () => {
  for (const [change, activity] of [[{ vehicle: 'bicycle' }, 'walk'], [{ vehicle: 'buggy' }, 'walk'], [{ airborne: true }, 'walk'], [{ active: false }, 'walk'], [{ visible: false }, 'overview'], [{}, 'football']]) {
    const room = fixture(pose(change), activity)
    assert.ok(room.social('alice', 'wave', undefined, 1100).error)
  }
  const moving = fixture(); moving.pose('alice', pose({ x: .2 }), 'walk', 1100)
  assert.ok(moving.social('alice', 'wave', undefined, 1200).error)
  const stale = fixture(); assert.ok(stale.social('alice', 'wave', undefined, 3100).error)
  const concert = fixture(pose({ visible: false }), 'concert')
  assert.deepEqual(concert.social('alice', 'applause', undefined, 1100), { ok: true })
  assert.ok(concert.social('alice', 'sit', seats[0].id, 1800).error)
})

test('bench seats are exclusive server positions; forged movement cannot move a seated avatar', () => {
  const room = fixture(); room.add(identity('bob')); room.pose('bob', pose(), 'walk', 1000)
  assert.ok(room.social('alice', 'sit', 'oat-5-7', 1100).error, 'unknown seat coordinates cannot be supplied')
  assert.deepEqual(room.social('alice', 'sit', seats[0].id, 1800), { ok: true })
  const seated = person(room, 'alice', 1800)
  assert.deepEqual([seated.pose.x, seated.pose.y, seated.pose.z, seated.pose.yaw], [1.5, .3, 0, 1])
  assert.equal(seated.pose.epoch, 2)
  assert.ok(room.social('bob', 'sit', seats[0].id, 1800).error, 'only one person can claim a seat')
  assert.equal(room.pose('alice', pose({ x: 100, y: 20, epoch: 99, moving: true, airborne: true }), 'walk', 1900), true)
  assert.deepEqual(person(room, 'alice', 1900).pose, seated.pose)
  assert.ok(room.social('alice', 'wave', undefined, 2500).error, 'standing is explicit before another action')
  assert.deepEqual(room.social('alice', 'stop', undefined, 2501), { ok: true })
  const standing = person(room, 'alice', 2501)
  assert.equal(standing.social, undefined)
  assert.deepEqual([standing.pose.x, standing.pose.y, standing.pose.z], [0, 0, 0])
  assert.equal(standing.pose.epoch, 3)
  room.pose('bob', pose(), 'walk', 2501)
  assert.deepEqual(room.social('bob', 'sit', seats[0].id, 2502), { ok: true })
})

test('sitting requires proximity and height, and hidden, stale or departed visitors release seats', () => {
  for (const p of [pose({ x: -2 }), pose({ y: -1 }), pose({ space: 'gyan:0' })]) {
    const room = fixture(p); assert.ok(room.social('alice', 'sit', seats[0].id, 1100).error)
  }
  for (const reason of ['hidden', 'inactive', 'activity', 'stale', 'disconnect']) {
    const room = fixture(); room.add(identity('bob')); room.pose('bob', pose(), 'walk', 1000)
    room.social('alice', 'sit', seats[0].id, 1100)
    if (reason === 'disconnect') room.remove('alice')
    else if (reason === 'stale') room.snapshot(3100)
    else room.pose('alice', pose({ x: 100, epoch: 2, ...(reason === 'hidden' ? { visible: false } : {}), ...(reason === 'inactive' ? { active: false } : {}) }), reason === 'activity' ? 'concert' : 'walk', 1200)
    const now = reason === 'stale' ? 3200 : 1400
    const own = person(room, 'alice', now)
    assert.equal(own?.social, undefined)
    if (own) assert.equal(own.pose.x, 0, 'leave restores origin instead of accepting a forged position')
    room.pose('bob', pose(), 'walk', now)
    assert.deepEqual(room.social('bob', 'sit', seats[0].id, now), { ok: true }, reason)
  }
})

test('buggy passengers cannot emote and boarding clears a walking emote', () => {
  const room = fixture(); room.add(identity('driver')); room.pose('driver', pose({ vehicle: 'buggy', x: 1 }), 'walk', 1000)
  room.social('alice', 'wave', undefined, 1100)
  assert.deepEqual(room.ride('alice', 'driver', 1200), { ok: true })
  assert.equal(person(room, 'alice', 1200).social, undefined)
  assert.ok(room.social('alice', 'dance', undefined, 1800).error)
})

test('snapshot parsing preserves only valid social state and boolean airborne flags', () => {
  assert.equal(parseCampusPose(pose({ airborne: 'true' })), null)
  assert.equal(parseCampusPose(pose({ airborne: true, secret: 'discard' })).airborne, true)
  const room = fixture(); room.social('alice', 'sit', seats[0].id, 1100)
  const snapshot = room.snapshot(1100), valid = snapshot.people[0]
  assert.equal(parseCampusSnapshot(snapshot).people[0].social.seatId, seats[0].id)
  for (const social of [{ ...valid.social, action: 'fly' }, { ...valid.social, until: Infinity }, { ...valid.social, startedAt: NaN }, { ...valid.social, seatId: '../../private' }, { action: 'wave', startedAt: 1100, until: 1100 + SOCIAL_DURATION.wave + 1 }]) assert.equal(parseCampusSnapshot({ ...snapshot, people: [{ ...valid, social }] }), null)
  for (const change of [{ ride: { driverId: 'bob', seat: 1 } }, { activity: 'football' }, { pose: { ...valid.pose, vehicle: 'buggy' } }, { pose: { ...valid.pose, airborne: true } }]) assert.equal(parseCampusSnapshot({ ...snapshot, people: [{ ...valid, ...change }] }), null)
  assert.equal(parseCampusSnapshot({ ...snapshot, people: [valid, { ...valid, id: 'bob' }] }), null, 'duplicate bench occupancy is invalid')
  const parsed = parseCampusSnapshot({ ...snapshot, people: [{ ...valid, social: { ...valid.social, admin: true } }] })
  assert.equal(parsed.people[0].social.admin, undefined)
})

test('published walk-up seats follow the saved theatre terrain and reserve the concert rows', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'nitg-social-seats-'))
  try {
    const target = join(directory, 'map/seats.json'), published = await buildSocialSeats(target)
    assert.equal(published.length, 24)
    assert.equal(new Set(published.map(seat => seat.id)).size, 24)
    assert.ok(published.every(seat => seat.row >= 3 && seat.row <= 5 && Number.isFinite(seat.y)))
    assert.ok(published.every(seat => seat.y > 10), 'use the raised OAT terrace instead of zero-height seating')
    assert.deepEqual(JSON.parse(await readFile(target, 'utf8')), published)
  } finally { await rm(directory, { recursive: true, force: true }) }
})

const waitFor = async condition => {
  const end = Date.now() + 6000
  while (Date.now() < end) { const value = condition(); if (value) return value; await new Promise(resolve => setTimeout(resolve, 15)) }
  throw new Error('Timed out waiting for a shared social action')
}
test('two authenticated WebSocket peers see the same action and exclusive seat without identity spoofing', async t => {
  const http = createServer((_req, res) => res.end('campus'))
  const campus = attachCampusServer(http, undefined, async token => identity(token), boundary, seats), peers = []
  http.listen(0, '127.0.0.1'); await once(http, 'listening')
  const origin = `http://127.0.0.1:${http.address().port}`
  const peer = id => {
    const ws = new WebSocket(origin.replace('http:', 'ws:') + '/presence', { origin }), messages = []
    ws.on('error', () => {}); ws.on('message', bytes => messages.push(JSON.parse(bytes.toString())))
    ws.on('open', () => ws.send(JSON.stringify({ type: 'authenticate', token: id })))
    const current = { ws, messages }; peers.push(current); return current
  }
  t.after(async () => { for (const p of peers) p.ws.terminate(); campus.close(); await new Promise(resolve => http.close(resolve)) })
  const alice = peer('alice'), bob = peer('bob')
  await waitFor(() => peers.every(p => p.messages.some(m => m.type === 'campus-welcome')))
  for (const p of peers) p.ws.send(JSON.stringify({ type: 'pose', activity: 'walk', pose: pose() }))
  await waitFor(() => bob.messages.some(m => m.type === 'campus-state' && m.people.every(p => p.pose)))
  alice.ws.send(JSON.stringify({ type: 'social-action', action: 'wave', id: 'bob', startedAt: 1, until: Infinity }))
  const waving = await waitFor(() => bob.messages.find(m => m.type === 'campus-state' && m.people.some(p => p.id === 'alice' && p.social?.action === 'wave')))
  const action = waving.people.find(p => p.id === 'alice').social
  assert.ok(action.startedAt > 1); assert.equal(action.until - action.startedAt, SOCIAL_DURATION.wave)
  assert.equal(waving.people.find(p => p.id === 'bob').social, undefined)
  alice.ws.send(JSON.stringify({ type: 'social-action', action: 'stop' }))
  await new Promise(resolve => setTimeout(resolve, 700))
  alice.ws.send(JSON.stringify({ type: 'social-action', action: 'sit', seatId: seats[0].id }))
  await waitFor(() => bob.messages.some(m => m.type === 'campus-state' && m.people.some(p => p.id === 'alice' && p.social?.action === 'sit')))
  bob.ws.send(JSON.stringify({ type: 'social-action', action: 'sit', seatId: seats[0].id }))
  assert.match((await waitFor(() => bob.messages.find(m => m.type === 'social-result' && m.error))).error, /already sitting/)
  const claimed = campus.room.snapshot().people.find(p => p.id === 'alice')
  alice.ws.send(JSON.stringify({ type: 'pose', activity: 'walk', pose: pose({ epoch: claimed.pose.epoch, x: 100, y: 20 }) }))
  await new Promise(resolve => setTimeout(resolve, 150))
  assert.equal(campus.room.snapshot().people.find(p => p.id === 'alice').pose.x, seats[0].x)
  alice.ws.close()
  await waitFor(() => campus.room.snapshot().people.length === 1)
  await new Promise(resolve => setTimeout(resolve, 700))
  bob.ws.send(JSON.stringify({ type: 'pose', activity: 'walk', pose: pose() }))
  bob.ws.send(JSON.stringify({ type: 'social-action', action: 'sit', seatId: seats[0].id }))
  const final = await waitFor(() => bob.messages.find(m => m.type === 'campus-state' && m.people.length === 1 && m.people[0].social?.action === 'sit'))
  assert.ok(parseCampusSnapshot(final))
})
