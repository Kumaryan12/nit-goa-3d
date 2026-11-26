import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { prepareDigitalTwin } from '../src/lib/prepareDigitalTwin.ts'
import { extractBuildingFootprints } from '../src/lib/buildings.ts'
import { extractCampusRoads } from '../src/lib/roads.ts'
import { savedCampusOverrides } from '../src/data/campusOverrides.ts'
import { defaultTerrainSettings } from '../src/data/topography.ts'
import { createWalkWorld, isWalkable, walkSurfaceHeightAt } from '../src/lib/walking.ts'
import { studentSegmentClear, studentDetour, createCampusStudents } from '../src/lib/campusStudents.ts'
import { freshStudent, advanceStudent, studentDetailBudget } from '../src/lib/studentBehaviour.ts'

const [campus, roads] = await Promise.all(['campus', 'roads'].map(async kind => JSON.parse(await readFile(new URL(`./fixtures/nit-goa-${kind}.json`, import.meta.url)))))
const boundary = campus.elements.find(e => e.id === 1259742369).geometry
const twin = prepareDigitalTwin({ id: 1, settled: true, map: { buildings: extractBuildingFootprints(campus.elements), boundary, source: 'campus-area', returnedBuildingCount: 22 }, roads: { roads: extractCampusRoads(roads.elements, boundary), boundary, source: 'campus-area', returnedRoadCount: 20 }, overrides: savedCampusOverrides, terrainSettings: defaultTerrainSettings })
const world = createWalkWorld(twin.buildings, twin.boundary, twin.terrain, twin.trees, twin.lamps), plans = twin.students
const visitor = (p, changes = {}) => ({ x: p.x + 4, z: p.z, y: walkSurfaceHeightAt(world.terrain, p.x, p.z), yaw: 0, active: true, visible: true, moving: false, running: false, epoch: 1, space: 'outdoors', vehicle: 'walk', ...changes })
const nobody = { pose: null }

test('the worker prepares a bounded, cloneable mix of fictional walking, talking and seated students', () => {
  assert.equal(plans.length, 16)
  assert.equal(new Set(plans.map(p => p.id)).size, 16)
  assert.equal(plans.filter(p => p.role === 'walker').length, 8)
  assert.equal(plans.filter(p => p.role === 'chat').length, 4)
  assert.equal(plans.filter(p => p.role === 'seated').length, 4)
  assert.deepEqual(structuredClone(plans), plans)
  assert.ok(plans.filter(p => p.role === 'walker').some(p => p.route.to === 'Gyan Mandir'))
  assert.equal(createCampusStudents({ ...twin, vegetationReady: false }).length, 0)
  assert.equal(createCampusStudents({ ...twin, boundary: [] }).length, 0)
})

test('all published student paths, chat positions and standing places clear actual campus obstacles', () => {
  for (const p of plans) {
    if (p.route) for (let i = 1; i < p.route.points.length; i++) assert.ok(studentSegmentClear(p.route.points[i - 1], p.route.points[i], world), `${p.name} leg ${i}`)
    if (p.role === 'chat') assert.ok(isWalkable(p.point, world, .7))
    if (p.role === 'seated') { assert.ok(isWalkable(p.stand, world, .48)); assert.ok(Math.hypot(p.stand.x - p.seat.x, p.stand.z - p.seat.z) <= 3.01) }
  }
})

test('students complete a there-and-back trip without going through solids or gaining speed after stalls', () => {
  const p = plans.find(p => p.role === 'walker'), s = freshStudent(p, world), directions = new Set([s.direction])
  for (let i = 0; i < 5000; i++) {
    const before = { ...s }; advanceStudent(s, p, world, .1, 100000 + i * 100, nobody, [])
    assert.ok(isWalkable(s, world), `legal position at ${i}`)
    assert.ok(Math.hypot(s.x - before.x, s.z - before.z) <= p.speed * .1 + 1e-8)
    assert.ok(Math.abs(s.y - walkSurfaceHeightAt(world.terrain, s.x, s.z)) < 1e-7)
    directions.add(s.direction)
  }
  assert.equal(directions.size, 2)
  const before = { ...s }; advanceStudent(s, p, world, 120, 700000, nobody, [])
  assert.ok(Math.hypot(s.x - before.x, s.z - before.z) <= p.speed * .1 + 1e-8)
})

test('approach greetings are finite, face the visitor and do not repeat while someone stays nearby', () => {
  const p = plans.find(p => p.role === 'chat'), s = freshStudent(p, world), local = Object.freeze(visitor(s)), people = Object.freeze([local])
  advanceStudent(s, p, world, .1, 100000, { pose: local }, people)
  assert.equal(s.social.action, 'wave'); assert.match(s.message, /Hey|Hi/)
  assert.equal(s.yaw, Math.atan2(s.x - local.x, s.z - local.z))
  for (let i = 1; i < 400; i++) advanceStudent(s, p, world, .1, 100000 + i * 100, { pose: local }, people)
  assert.equal(s.greetedAt, 100000)
  advanceStudent(s, p, world, .1, 141000, { pose: visitor(s, { x: s.x + 20 }) }, [])
  advanceStudent(s, p, world, .1, 142000, { pose: local }, people)
  assert.equal(s.greetedAt, 142000)
})

test('waving/dancing receives one appropriate reaction, and inactive/interior/vehicle users do not trigger it', () => {
  const p = plans.find(p => p.role === 'chat')
  for (const action of ['wave', 'dance', 'applause']) {
    const s = freshStudent(p, world), local = visitor(s, { x: s.x + 7 }), social = { action, startedAt: 99900, until: 106000 }
    advanceStudent(s, p, world, .1, 100000, { pose: local, social }, [])
    assert.equal(s.reaction.action, action)
    advanceStudent(s, p, world, .1, 104000, { pose: local, social }, [])
    assert.equal(s.greetedAt, 100000, 'a held gesture does not restart')
  }
  for (const changes of [{ active: false }, { visible: false }, { space: 'gyan:0' }, { vehicle: 'buggy' }, { y: 60 }]) {
    const s = freshStudent(p, world); advanceStudent(s, p, world, .1, 100000, { pose: visitor(s, changes) }, [])
    assert.equal(s.reaction, undefined)
  }
})

test('real visitors get NPC seats immediately without changing any shared reservation', () => {
  for (const p of plans.filter(p => p.role === 'seated')) {
    const s = freshStudent(p, world), local = Object.freeze(visitor(p.seat, { x: p.seat.x, y: p.seat.y })), poses = Object.freeze([local])
    advanceStudent(s, p, world, .1, 100000, nobody, poses)
    assert.equal(s.visible, false, 'no overlap with an actual seated visitor')
    for (let i = 1; i <= 12; i++) advanceStudent(s, p, world, .1, 100000 + i * 100, nobody, poses)
    assert.equal(s.seated, false); assert.equal(s.visible, true)
    assert.ok(Math.hypot(s.x - p.stand.x, s.z - p.stand.z) < .001)
    assert.ok(isWalkable(s, world))
  }
})

test('talking pairs alternate gestures/dialogue and density gives real players the rendering budget', () => {
  const pair = plans.filter(p => p.role === 'chat').slice(0, 2), states = pair.map(p => freshStudent(p, world))
  const spoke = [false, false]
  for (let i = 0; i < 200; i++) pair.forEach((p, j) => { advanceStudent(states[j], p, world, .1, 100000 + i * 100, nobody, []); spoke[j] ||= states[j].talking })
  assert.ok(spoke.every(Boolean))
  assert.equal(studentDetailBudget(.85, 0), 1); assert.equal(studentDetailBudget(1.15, 0), 2)
  assert.equal(studentDetailBudget(1.5, 32), 0)
})

test('local detours fail closed for unreachable routes and never cut diagonally through solids', () => {
  const p = plans[0].point
  assert.ok(studentDetour(p, { x: p.x + 1, z: p.z }, world))
  assert.equal(studentDetour(p, { x: 10000, z: 10000 }, world), null)
})
