import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { savedCampusOverrides } from '../src/data/campusOverrides.ts'
import { defaultTerrainSettings } from '../src/data/topography.ts'
import { extractBuildingFootprints } from '../src/lib/buildings.ts'
import { extractCampusRoads } from '../src/lib/roads.ts'
import { createDigitalTwin } from '../src/lib/digitalTwin.ts'
import { INDIAN_FLAG, createCampusFlag, flagBlocksCamera } from '../src/lib/campusFlag.ts'
import { lawnWeightAt } from '../src/lib/landscaping.ts'
import { terrainHeightAt, distanceToSegment } from '../src/lib/terrain.ts'
import { createWalkWorld, isWalkable, stepWalking, cameraBoomFraction } from '../src/lib/walking.ts'
import { canRideAt } from '../src/lib/vehicles.ts'

const campus = JSON.parse(await readFile(new URL('./fixtures/nit-goa-campus.json', import.meta.url), 'utf8'))
const roads = JSON.parse(await readFile(new URL('./fixtures/nit-goa-roads.json', import.meta.url), 'utf8'))
const boundary = roads.elements.find(e => e.id === 1259742369).geometry
const twin = createDigitalTwin(
  { buildings: extractBuildingFootprints(campus.elements), boundary },
  { roads: extractCampusRoads(roads.elements, boundary), boundary },
  true, savedCampusOverrides, { ...defaultTerrainSettings, customSlopes: [] },
)
const flag = twin.flag

test('national flag sits on the lawn across from Admin, clear of roads, trees, lamps and visible hardscape', () => {
  assert.ok(flag)
  const lawn = twin.lawns.find(l => l.id === 'seminar-south-lawn')
  assert.equal(lawnWeightAt(flag, [lawn]), 1)
  const admin = twin.locations.find(l => l.id === 'administration-block')
  assert.ok(flag.x < admin.coordinates.x && Math.abs(flag.z - admin.coordinates.z) < 20)
  for (const road of twin.roads) for (const path of road.paths) for (let i = 1; i < path.length; i++) {
    assert.ok(distanceToSegment(flag, path[i - 1], path[i]) > road.width / 2 + INDIAN_FLAG.baseRadius + 1)
  }
  for (const tree of twin.trees) assert.ok(Math.hypot(flag.x - tree.x, flag.z - tree.z) > 4)
  for (const lamp of twin.lamps) assert.ok(Math.hypot(flag.x - lamp.x, flag.z - lamp.z) > INDIAN_FLAG.baseRadius + 1)
  for (let i = 0; i < 24; i++) {
    const a = i * Math.PI / 12, height = terrainHeightAt(twin.terrain, flag.x + Math.cos(a) * INDIAN_FLAG.baseRadius, flag.z + Math.sin(a) * INDIAN_FLAG.baseRadius)
    assert.ok(flag.baseElevation <= height && flag.y > height, 'pedestal intersects the slope and has a level top')
  }
  const renamed = twin.buildings.map(b => ({ ...b, tags: { name: 'Changed campus name' } }))
  assert.deepEqual(createCampusFlag(renamed, twin.lawns, twin.boundary, twin.roads, twin.terrain), flag)
  assert.equal(createCampusFlag([], twin.lawns, twin.boundary, twin.roads, twin.terrain), null)
  assert.equal(createCampusFlag(twin.buildings, [], twin.boundary, twin.roads, twin.terrain), null)
})

test('avatars and full-size vehicles cannot pass through the flag base, but can travel around it', () => {
  const world = createWalkWorld(twin.buildings, twin.boundary, twin.terrain, twin.trees, twin.lamps)
  assert.equal(isWalkable(flag, world), false)
  assert.equal(isWalkable(flag, world, .42, flag.y + 2), false, 'jumping does not bypass the solid landmark')
  for (const kind of ['bicycle', 'buggy']) {
    assert.equal(canRideAt(flag, 0, kind, world, twin.roads), false)
    assert.equal(canRideAt({ x: flag.x, z: flag.z + 4 }, 0, kind, world, twin.roads), true)
  }
  let p = { x: flag.x - 4, z: flag.z }
  for (let i = 0; i < 40; i++) p = stepWalking(p, { x: 1, z: 0 }, 5, .1, world)
  assert.ok(p.x < flag.x - INDIAN_FLAG.baseRadius)
  assert.ok(isWalkable(p, world))
})

test('follow cameras avoid the mast and pedestal without treating the entire tall base radius as a wall', () => {
  const world = createWalkWorld([], [], twin.terrain)
  const y = flag.y + 4
  assert.ok(cameraBoomFraction({ x: flag.x - 3, y, z: flag.z }, { x: flag.x + 3, y, z: flag.z }, world) < .5)
  assert.equal(flagBlocksCamera({ x: flag.x + 1, y, z: flag.z }, flag), false)
  assert.equal(flagBlocksCamera({ x: flag.x + 1, y: flag.y - .1, z: flag.z }, flag), true)
  assert.equal(flagBlocksCamera({ ...flag, y: flag.y + INDIAN_FLAG.poleHeight + 1 }, flag), false)
})
