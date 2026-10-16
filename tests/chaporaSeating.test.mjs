import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { WebSocket } from 'ws'
import { extractBuildingFootprints } from '../src/lib/buildings.ts'
import { createSeminarPlan, seminarSurfaceHeightAt, SEMINAR_ID } from '../src/lib/seminarInterior.ts'
import { createScreeningLayout } from '../src/lib/screening.ts'
import { chaporaSeats, nearbySeat, parseSocialState } from '../src/lib/social.ts'
import { parseCampusSnapshot } from '../src/lib/campusProtocol.ts'
import { socialPose } from '../src/lib/avatarMotion.ts'
import { createCampusRoom, publishedCampusBoundary } from '../server/campusRoom.ts'
import { legacySocialSnapshot } from '../server/socialCompatibility.ts'
import { attachCampusServer } from '../server/campusServer.ts'

const campus = JSON.parse(readFileSync('public/map/nit-goa-campus.json'))
const plan = createSeminarPlan(extractBuildingFootprints(campus.elements).find(b => b.id === SEMINAR_ID), () => true)
const hall = plan.seminar.halls.find(h => h.id === 'seated'), seats = chaporaSeats(plan), chair = seats[0]
const origin = { x: chair.x, y: seminarSurfaceHeightAt(plan, chair), z: hall.stage.z, yaw: 0, space: 'seminar:0', epoch: 1, vehicle: 'walk', active: true, visible: true, moving: false, running: false }
const identity = id => ({ id, name: id, role: 'member', expiresAt: Date.now() + 3600000 })

test('Chapora walk-up chairs follow the physical sloping floor and never overlap screening reservations', () => {
  assert.equal(seats.length, 178)
  assert.equal(new Set(seats.map(s => s.id)).size, 178)
  const reserved = createScreeningLayout(plan).seats
  for (const seat of seats) {
    const physical = hall.seats.find(p => p.x === seat.x && p.z === seat.z)
    assert.ok(physical)
    assert.equal(seat.y, plan.base + .14 + physical.elevation)
    assert.equal(seat.seatHeight, .56)
    assert.ok(Math.abs(seminarSurfaceHeightAt(plan, seat) - seat.y) < 1e-8)
    assert.ok(!reserved.some(p => p.x === seat.x && p.z === seat.z))
    assert.equal(seat.yaw, Math.PI / 2)
  }
  assert.deepEqual(chaporaSeats(null), [])
  assert.ok(nearbySeat(seats, origin))
  assert.equal(nearbySeat(seats, { ...origin, space: 'outdoors' }), null)
  assert.equal(nearbySeat(seats, { ...origin, space: 'gyan:0' }), null)
  assert.notEqual(nearbySeat(seats, origin, [chair.id])?.id, chair.id)
})

test('Chapora chair posture fits its cushion with grounded feet and rejects invalid chair metadata', () => {
  const state = { action: 'sit', seatId: chair.id, seatHeight: .56, startedAt: 1000, until: 5000 }
  assert.deepEqual(parseSocialState(state), state)
  for (const invalid of [{ seatHeight: .44 }, { seatId: 'chapora-15-0' }, { seatId: 'chapora-0-14' }, { seatId: 'oat-3-0' }]) assert.equal(parseSocialState({ ...state, ...invalid }), null)
  const p = socialPose(state, 2000)
  assert.ok(Math.abs(p.rootY + .88 - .59) < .002)
  for (const [i, hip] of p.hips.entries()) assert.ok(Math.abs(p.rootY + .88 - .37 * Math.cos(hip) - .37 * Math.cos(hip + p.knees[i]) - .129 - .011) < 1e-8)
})

test('shared Chapora sitting is exclusive, stays seated on heartbeats and restores the same interior aisle', () => {
  const room = createCampusRoom(publishedCampusBoundary(), seats)
  for (const id of ['alice', 'bob']) { room.add(identity(id)); assert.ok(room.pose(id, origin, 'walk', 1000)) }
  assert.deepEqual(room.social('alice', 'sit', chair.id, 1100), { ok: true })
  let state = room.snapshot(1100), alice = state.people.find(p => p.id === 'alice')
  assert.ok(parseCampusSnapshot(state)); assert.equal(alice.pose.space, 'seminar:0')
  assert.equal(alice.social.seatHeight, .56); assert.equal(alice.pose.y, chair.y)
  assert.match(room.social('bob', 'sit', chair.id, 1100).error, /already sitting/)
  assert.ok(room.pose('alice', { ...origin, epoch: 99, x: origin.x + 30 }, 'walk', 1300))
  assert.equal(room.snapshot(1300).people.find(p => p.id === 'alice').pose.x, chair.x)
  // Old café-capable browsers must still accept the rest of the roster.
  const cafeOnly = legacySocialSnapshot(state, true)
  assert.equal(cafeOnly.people.find(p => p.id === 'alice').social, undefined)
  assert.deepEqual(cafeOnly.people.find(p => p.id === 'alice').pose, alice.pose)
  assert.strictEqual(legacySocialSnapshot(state, true, true), state)
  assert.deepEqual(room.social('alice', 'stop', undefined, 1400), { ok: true })
  alice = room.snapshot(1400).people.find(p => p.id === 'alice')
  assert.equal(alice.social, undefined)
  assert.deepEqual([alice.pose.x, alice.pose.y, alice.pose.z, alice.pose.space], [origin.x, origin.y, origin.z, 'seminar:0'])
  room.pose('bob', origin, 'walk', 1800)
  assert.deepEqual(room.social('bob', 'sit', chair.id, 1800), { ok: true })
  assert.ok(parseCampusSnapshot(room.snapshot(1800)))
  for (const space of ['outdoors', 'gyan:0', 'hostel:0']) {
    const wrong = createCampusRoom(publishedCampusBoundary(), seats)
    wrong.add(identity('wrong')); wrong.pose('wrong', { ...origin, space }, 'walk', 1000)
    assert.ok(wrong.social('wrong', 'sit', chair.id, 1100).error)
  }
})

test('new WebSocket clients share Chapora seating while already-open café clients retain visible avatars', async t => {
  const http = createServer((_req, res) => res.end('rehearsal'))
  const campus = attachCampusServer(http, undefined, async id => identity(id), publishedCampusBoundary(), seats)
  http.listen(0, '127.0.0.1'); await once(http, 'listening')
  const peers = ['alice', 'bob', 'older'].map(id => {
    const ws = new WebSocket(`ws://127.0.0.1:${http.address().port}/presence`, { origin: `http://127.0.0.1:${http.address().port}` }), messages = []
    ws.on('error', () => {})
    ws.on('open', () => ws.send(JSON.stringify({ type: 'authenticate', token: id })))
    ws.on('message', bytes => {
      const m = JSON.parse(bytes.toString()); messages.push(m)
      if (m.type === 'campus-welcome') {
        ws.send(JSON.stringify({ type: 'social-capabilities', cafeSeats: true, chaporaSeats: id !== 'older' }))
        ws.send(JSON.stringify({ type: 'pose', activity: 'walk', pose: origin }))
      }
    })
    return { ws, messages }
  })
  t.after(async () => { peers.forEach(p => p.ws.terminate()); campus.close(); await new Promise(resolve => http.close(resolve)) })
  const wait = async fn => { const end = Date.now() + 5000; while (Date.now() < end) { const result = fn(); if (result) return result; await new Promise(resolve => setTimeout(resolve, 20)) } throw Error('Timed out waiting for Chapora seating') }
  await wait(() => campus.room.snapshot().people.length === 3 && campus.room.snapshot().people.every(p => p.pose))
  peers[0].ws.send(JSON.stringify({ type: 'social-action', action: 'sit', seatId: chair.id }))
  const shared = await wait(() => peers[1].messages.find(m => m.type === 'campus-state' && m.people.some(p => p.social?.seatId === chair.id)))
  assert.ok(parseCampusSnapshot(shared))
  const old = await wait(() => peers[2].messages.find(m => m.type === 'campus-state' && m.people.some(p => p.id === 'alice' && p.pose?.epoch === 2)))
  const visitor = old.people.find(p => p.id === 'alice')
  assert.equal(visitor.social, undefined); assert.equal(visitor.pose.space, 'seminar:0')
  peers[1].ws.send(JSON.stringify({ type: 'social-action', action: 'sit', seatId: chair.id }))
  assert.match((await wait(() => peers[1].messages.find(m => m.type === 'social-result' && m.error))).error, /already sitting/)
})
