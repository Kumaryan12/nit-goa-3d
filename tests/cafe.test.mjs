import { orientSeminarBuilding } from '../src/lib/seminarOrientation.ts'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { WebSocket } from 'ws'
import { extractBuildingFootprints } from '../src/lib/buildings.ts'
import { extractCampusRoads, pointInCampus } from '../src/lib/roads.ts'
import { createDigitalTwin } from '../src/lib/digitalTwin.ts'
import { savedCampusOverrides } from '../src/data/campusOverrides.ts'
import { cafePoint, createCafeLayout, rotateCafeLayout, rotateCafeBuilding, CAFE_BUILDING_ID } from '../src/lib/cafe.ts'
import { createCafeGeometry } from '../src/lib/cafeGeometry.ts'
import { distanceToSegment, terrainHeightAt } from '../src/lib/terrain.ts'
import { buildingCenter } from '../src/lib/campus.ts'
import { gpsToLocal } from '../src/lib/geo.ts'
import { findLocationArrival } from '../src/lib/walkArrival.ts'
import { createWalkWorld, isWalkable, stepWalking } from '../src/lib/walking.ts'
import { nearbySeat, parseSocialState } from '../src/lib/social.ts'
import { socialPose } from '../src/lib/avatarMotion.ts'
import { attachCampusServer } from '../server/campusServer.ts'
import { parseCampusSnapshot } from '../src/lib/campusProtocol.ts'
import { legacySocialSnapshot } from '../server/socialCompatibility.ts'

const campus = JSON.parse(readFileSync('public/map/nit-goa-campus.json')).elements
const roadData = JSON.parse(readFileSync('public/map/nit-goa-roads.json')).elements
const boundary = campus.find(e => e.id === 1259742369).geometry
const buildings = extractBuildingFootprints(campus), roads = extractCampusRoads(roadData, boundary)
const twin = createDigitalTwin({ buildings, boundary, source: 'campus-area', returnedBuildingCount: buildings.length }, { roads, boundary, source: 'campus-area', returnedRoadCount: roads.length }, true, savedCampusOverrides)
const cafe = twin.terrain.cafe
const world = createWalkWorld(twin.buildings, twin.boundary, twin.terrain, twin.trees, twin.lamps)

test('Nescafé terrace has 16 stable seats off the roads and preserves mapped buildings and relief', () => {
  assert.ok(cafe); assert.equal(cafe.tables.length, 4); assert.equal(cafe.seats.length, 16)
  assert.equal(new Set(cafe.seats.map(s => s.id)).size, 16)
  assert.ok(cafe.terrace.outward.x < -.9, 'north terrace turns west after the anticlockwise rotation')
  assert.ok(cafe.front.outward.z > .9, 'the second vending window uses the long blank wall beside the terrace')
  const edges = twin.roads.flatMap(r => r.paths.flatMap(path => path.slice(1).map((b, i) => ({ a: path[i], b, width: r.width }))))
  for (const item of [...cafe.tables, ...cafe.seats, ...cafe.posts, ...cafe.planters]) {
    assert.ok(pointInCampus(item, twin.boundary))
    assert.ok(edges.every(e => distanceToSegment(item, e.a, e.b) > e.width / 2 + .9))
    assert.ok(Math.abs(item.y - terrainHeightAt(twin.terrain, item.x, item.z) - .025) < 1e-6)
  }
  for (const b of twin.buildings) assert.deepEqual(b.outer, orientSeminarBuilding(rotateCafeBuilding(buildings.find(source => source.id === b.id))).outer)
  assert.equal(createCafeLayout([], roads, twin.boundary), null)
  assert.equal(createCafeLayout(buildings, roads, []), null)
})

test('whole café rotates exactly 90 degrees anticlockwise around its fixed centre, including the doorway and seats', () => {
  const originalBuilding = buildings.find(b => b.id === CAFE_BUILDING_ID), pivot = buildingCenter(originalBuilding)
  const originalCafe = createCafeLayout(buildings, roads, twin.boundary, twin.locations.find(l => l.id === 'sports-ground').coordinates)
  const before = JSON.stringify({ originalBuilding, originalCafe })
  const rotated = rotateCafeLayout(originalCafe, pivot), building = rotateCafeBuilding(originalBuilding)
  const check = (before, after) => {
    assert.ok(Math.abs(after.x - pivot.x - (before.z - pivot.z)) < 1e-6)
    assert.ok(Math.abs(after.z - pivot.z + (before.x - pivot.x)) < 1e-6)
  }
  originalBuilding.outer.map(gpsToLocal).forEach((p, i) => check(p, gpsToLocal(building.outer[i])))
  assert.ok(Math.hypot(buildingCenter(building).x - pivot.x, buildingCenter(building).z - pivot.z) < 1e-6)
  for (const key of ['tables', 'seats', 'posts', 'planters']) originalCafe[key].forEach((part, i) => {
    check(part, rotated[key][i]); assert.equal(rotated[key][i].id, part.id)
    assert.ok(Math.abs(Math.atan2(Math.sin(rotated[key][i].yaw - part.yaw), Math.cos(rotated[key][i].yaw - part.yaw)) - Math.PI / 2) < 1e-8)
  })
  check(originalCafe.front.center, rotated.front.center)
  assert.equal(cafe.entrance, undefined, 'the walk-up café has no separate door')
  for (const key of ['tables', 'seats', 'posts', 'planters']) rotated[key].forEach((part, i) => {
    assert.equal(part.x, cafe[key][i].x); assert.equal(part.z, cafe[key][i].z); assert.equal(part.yaw, cafe[key][i].yaw)
  })
  assert.equal(JSON.stringify({ originalBuilding, originalCafe }), before, 'source map and original assembly are not mutated')
  const location = twin.selections.find(s => s.buildingId === CAFE_BUILDING_ID).location
  const arrival = findLocationArrival(location, twin, world)
  assert.ok(arrival && isWalkable(arrival.position, world))
  assert.deepEqual(arrival.entrance.point, cafe.terrace.center)
  assert.ok(arrival.position.x < cafe.terrace.center.x, 'arrivals use the shared-table aisle instead of an invented entrance')
})

test('walking can approach every chair and cross the central aisle without passing through furniture or trees', () => {
  for (let out = .6; out < cafe.depth; out += .2) assert.ok(isWalkable(cafePoint(cafe, 0, out), world), `central aisle ${out}`)
  for (const s of cafe.seats) {
    assert.equal(isWalkable(s, world), false, 'chair is solid outside server-controlled sitting')
    const table = cafe.tables[s.row], dx = s.x - table.x, dz = s.z - table.z
    const approach = { x: s.x + dx / 1.35 * .85, z: s.z + dz / 1.35 * .85 }
    assert.ok(isWalkable(approach, world), `approach ${s.id}`)
    assert.ok(nearbySeat([s], { ...approach, y: terrainHeightAt(twin.terrain, approach.x, approach.z) }))
    assert.equal(nearbySeat([s], { ...approach, y: s.y }, [s.id]), null)
    const before = Math.hypot(approach.x - s.x, approach.z - s.z)
    const next = stepWalking(approach, { x: -dx, z: -dz }, 8, .1, world)
    assert.ok(Math.hypot(next.x - s.x, next.z - s.z) > .71 && before > .71)
  }
  for (const table of cafe.tables) assert.equal(isWalkable(table, world), false)
  assert.ok(twin.trees.every(t => Math.abs(t.x - cafe.clearing.x) > cafe.clearing.halfX || Math.abs(t.z - cafe.clearing.z) > cafe.clearing.halfZ))
})

test('café chair poses put hips on the seat and feet on the ground with strict seat parsing', () => {
  const state = { action: 'sit', startedAt: 1000, until: 5000, seatId: cafe.seats[0].id, seatHeight: .44 }
  assert.deepEqual(parseSocialState(state), state)
  assert.equal(parseSocialState({ ...state, seatHeight: 12 }), null)
  assert.equal(parseSocialState({ ...state, seatId: 'cafe-99-0' }), null)
  for (const now of [1500, 2500, 3500]) {
    const p = socialPose(state, now)
    assert.ok(Math.abs(p.rootY + .88 - .47) < .002)
    for (const [i, hip] of p.hips.entries()) assert.ok(Math.abs(p.rootY + .88 - .37 * Math.cos(hip) - .37 * Math.cos(hip + p.knees[i]) - .129 - .011) < 1e-8)
  }
})

test('café detail stays in four bounded static meshes with terrain-draped upward paving', () => {
  const geometry = createCafeGeometry(cafe, twin.terrain)
  try {
    for (const part of Object.values(geometry)) {
      assert.ok([...part.getAttribute('position').array].every(Number.isFinite))
      assert.ok([...part.getAttribute('normal').array].every(Number.isFinite))
      assert.ok(part.boundingSphere.radius < 40)
    }
    assert.ok(geometry.solid.index.count / 3 < 20000)
    const panes = geometry.glass.getAttribute('position')
    for (let i = 0; i < panes.count; i++) {
      assert.ok(panes.getY(i) > cafe.base + .68, 'vending panes stop above the counter, with no ground-height doors')
      assert.ok([cafe.front, cafe.terrace].some(face => {
        const out = (panes.getX(i) - face.center.x) * face.outward.x + (panes.getZ(i) - face.center.z) * face.outward.z
        return out > .05 && out < .4
      }), 'glazing is confined to the two owner-confirmed serving walls')
    }
    const normals = geometry.pavement.getAttribute('normal')
    for (let i = 0; i < normals.count; i++) assert.ok(normals.getY(i) > .9)
  } finally { Object.values(geometry).forEach(part => part.dispose()) }
})

const waitFor = async condition => {
  const end = Date.now() + 6000
  while (Date.now() < end) { const result = condition(); if (result) return result; await new Promise(resolve => setTimeout(resolve, 15)) }
  throw new Error('Café multiplayer timed out')
}
test('two authenticated peers share café seats, reject double booking and stand back at their approach', async t => {
  const http = createServer((_req, res) => res.end('campus'))
  const live = attachCampusServer(http, undefined, async id => ({ id, name: id, role: 'member', expiresAt: Date.now() + 3600000 }), twin.boundary, cafe.seats)
  const peers = []
  t.after(async () => { peers.forEach(p => p.ws.terminate()); live.close(); await new Promise(resolve => http.close(resolve)) })
  http.listen(0, '127.0.0.1'); await once(http, 'listening')
  const origin = `http://127.0.0.1:${http.address().port}`
  for (const id of ['alice', 'bob']) {
    const ws = new WebSocket(origin.replace('http:', 'ws:') + '/presence', { origin }), messages = []
    ws.on('error', () => {}); ws.on('message', bytes => {
      const message = JSON.parse(bytes.toString()); messages.push(message)
      if (message.type === 'campus-welcome') ws.send(JSON.stringify({ type: 'social-capabilities', cafeSeats: true }))
    })
    ws.on('open', () => ws.send(JSON.stringify({ type: 'authenticate', token: id }))); peers.push({ id, ws, messages })
  }
  await waitFor(() => peers.every(p => p.messages.some(m => m.type === 'campus-welcome')))
  const chair = cafe.seats[0], approach = { x: chair.x + .7, y: chair.y, z: chair.z - .5, yaw: 0, epoch: 1, active: true, visible: true, moving: false, running: false, space: 'outdoors', vehicle: 'walk' }
  peers.forEach(p => p.ws.send(JSON.stringify({ type: 'pose', activity: 'walk', pose: approach })))
  await waitFor(() => live.room.snapshot().people.every(p => p.pose))
  peers[0].ws.send(JSON.stringify({ type: 'social-action', action: 'sit', seatId: chair.id, seatHeight: 99 }))
  const shared = await waitFor(() => peers[1].messages.find(m => m.type === 'campus-state' && m.people.some(p => p.id === 'alice' && p.social?.action === 'sit')))
  assert.ok(parseCampusSnapshot(shared)); assert.equal(shared.people.find(p => p.id === 'alice').social.seatHeight, .44)
  const legacy = legacySocialSnapshot(shared)
  assert.ok(parseCampusSnapshot(legacy)); assert.equal(legacy.people.find(p => p.id === 'alice').social, undefined)
  assert.deepEqual(legacy.people.find(p => p.id === 'alice').pose, shared.people.find(p => p.id === 'alice').pose)
  assert.equal(shared.people.find(p => p.id === 'alice').social.seatId, chair.id, 'fallback does not mutate new-client state')
  const oldWs = new WebSocket(origin.replace('http:', 'ws:') + '/presence', { origin }), oldMessages = []
  oldWs.on('error', () => {}); oldWs.on('message', bytes => oldMessages.push(JSON.parse(bytes.toString())))
  oldWs.on('open', () => oldWs.send(JSON.stringify({ type: 'authenticate', token: 'older-browser' })))
  peers.push({ id: 'older-browser', ws: oldWs, messages: oldMessages })
  const oldRoster = await waitFor(() => oldMessages.find(m => m.type === 'campus-state' && m.people.some(p => p.id === 'alice')))
  assert.ok(parseCampusSnapshot(oldRoster))
  assert.equal(oldRoster.people.find(p => p.id === 'alice').social, undefined)
  assert.equal(oldRoster.people.find(p => p.id === 'alice').pose.x, chair.x)
  await waitFor(() => oldMessages.filter(m => m.type === 'campus-state').length > 1)
  assert.ok(oldMessages.filter(m => m.type === 'campus-state').every(m => !m.people.some(p => p.social?.seatId?.startsWith('cafe-'))))
  peers[1].ws.send(JSON.stringify({ type: 'social-action', action: 'sit', seatId: chair.id }))
  await waitFor(() => peers[1].messages.some(m => m.type === 'social-result' && /already sitting/.test(m.error)))
  peers[0].ws.send(JSON.stringify({ type: 'social-action', action: 'stop' }))
  await waitFor(() => !live.room.snapshot().people.find(p => p.id === 'alice').social)
  assert.equal(live.room.snapshot().people.find(p => p.id === 'alice').pose.x, approach.x)
  assert.equal(live.room.snapshot().people.find(p => p.id === 'alice').pose.z, approach.z)
  await new Promise(resolve => setTimeout(resolve, 700))
  peers[1].ws.send(JSON.stringify({ type: 'social-action', action: 'sit', seatId: chair.id }))
  await waitFor(() => live.room.snapshot().people.find(p => p.id === 'bob').social?.seatId === chair.id)
})
