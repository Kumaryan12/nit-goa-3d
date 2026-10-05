import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { campusLawnReferences } from '../src/data/landscaping.ts'
import { savedCampusOverrides } from '../src/data/campusOverrides.ts'
import { defaultTerrainSettings } from '../src/data/topography.ts'
import { extractBuildingFootprints } from '../src/lib/buildings.ts'
import { extractCampusRoads, pointInCampus } from '../src/lib/roads.ts'
import { gpsToLocal, localToGps } from '../src/lib/geo.ts'
import { createCampusLawns, inLawnBoundary, lawnWeightAt } from '../src/lib/landscaping.ts'
import { createDigitalTwin } from '../src/lib/digitalTwin.ts'
import { generateTerrain } from '../src/lib/terrain.ts'
import { createWalkWorld, isWalkable } from '../src/lib/walking.ts'
import { canRideAt } from '../src/lib/vehicles.ts'

const campus = JSON.parse(await readFile(new URL('./fixtures/nit-goa-campus.json', import.meta.url), 'utf8'))
const roads = JSON.parse(await readFile(new URL('./fixtures/nit-goa-roads.json', import.meta.url), 'utf8'))
const boundary = roads.elements.find(element => element.id === 1259742369).geometry
const buildings = extractBuildingFootprints(campus.elements)
const twin = createDigitalTwin(
  { buildings, boundary, source: 'campus-area', returnedBuildingCount: buildings.length },
  { roads: extractCampusRoads(roads.elements, boundary), boundary, source: 'campus-area', returnedRoadCount: 20 },
  true, savedCampusOverrides, { ...defaultTerrainSettings, customSlopes: [] },
)
const centers = [gpsToLocal({ lat: 15.16942, lon: 74.01158 }), gpsToLocal({ lat: 15.16845, lon: 74.01157 })]

test('satellite lawns flank the real Seminar footprint, preserve utility pads and survive display-name edits', () => {
  assert.equal(twin.lawns.length, 2)
  const seminar = buildings.find(building => building.id === 'way/1423803680')
  const zs = seminar.outer.map(gpsToLocal).map(p => p.z)
  assert.ok(twin.lawns[0].bounds.maxZ < Math.min(...zs))
  assert.ok(twin.lawns[1].bounds.minZ > Math.max(...zs))
  for (const point of centers) {
    assert.ok(pointInCampus(point, twin.boundary))
    assert.equal(lawnWeightAt(point, twin.lawns), 1)
  }
  for (const lawn of twin.lawns) for (const ring of lawn.hardscape) {
    const center = { x: ring.reduce((s, p) => s + p.x, 0) / ring.length, z: ring.reduce((s, p) => s + p.z, 0) / ring.length }
    assert.equal(lawnWeightAt(center, twin.lawns), 0)
  }
  assert.deepEqual(createCampusLawns(buildings.map(b => ({ ...b, tags: { name: 'Renamed by owner' } }))), twin.lawns)
  assert.deepEqual(createCampusLawns(buildings.filter(b => b.id !== seminar.id)), [])
  assert.equal(campusLawnReferences.length, 2)
})

test('turf paints the existing terrain without changing heights or paving roads, buildings, plazas and utility pads', () => {
  const ring = [[-50, -50], [50, -50], [50, 50], [-50, 50]].map(([x, z]) => ({ x, z }))
  const pad = [[-32, -32], [-18, -32], [-18, -18], [-32, -18]].map(([x, z]) => ({ x, z }))
  const lawn = { id: 'test', outer: ring, hardscape: [pad], bounds: { minX: -50, maxX: 50, minZ: -50, maxZ: 50 } }
  const features = {
    boundary: ring, buildings: [{ id: 'test', outer: [[16, 16], [24, 16], [24, 24], [16, 24], [16, 16]].map(([x, z]) => localToGps({ x, z })) }],
    roads: [{ width: 6, paths: [[{ x: -50, z: 0 }, { x: 50, z: 0 }]] }],
    clearings: [{ x: 20, z: -20, halfX: 4, halfZ: 4 }],
  }
  const base = generateTerrain(120, features, 120), painted = generateTerrain(120, { ...features, lawns: [lawn] }, 120)
  assert.deepEqual(painted.heights, base.heights, 'turf cannot change slopes, grounding or collision')
  const rgb = (model, x, z) => Array.from(model.colors.slice(((z + 60) * 121 + x + 60) * 3, ((z + 60) * 121 + x + 60) * 3 + 3))
  for (const [x, z] of [[0, 0], [0, 3], [20, 20], [20, -20], [-25, -25], [-55, -25]]) assert.deepEqual(rgb(painted, x, z), rgb(base, x, z))
  const turf = rgb(painted, 0, 20)
  assert.notDeepEqual(turf, rgb(base, 0, 20))
  assert.ok(turf[1] > turf[0] && turf[1] > turf[2], 'open lawn is green')
  assert.equal(lawnWeightAt({ x: 50, z: 25 }, [lawn]), 0)
  assert.ok(lawnWeightAt({ x: 49, z: 25 }, [lawn]) > 0 && lawnWeightAt({ x: 49, z: 25 }, [lawn]) < 1)
})

test('real campus lawns stay open for exploration and exclude the seeded large trees', () => {
  assert.equal(twin.trees.length, 640)
  for (const tree of twin.trees) assert.ok(twin.lawns.every(lawn => !inLawnBoundary(tree, lawn)))
  const world = createWalkWorld(twin.buildings, twin.boundary, twin.terrain, twin.trees, twin.lamps)
  for (const point of centers) {
    assert.ok(isWalkable(point, world, 1.5), 'grass stays usable with real building/tree/lamp collisions')
    for (const kind of ['bicycle', 'buggy']) assert.ok(canRideAt(point, 0, kind, world, twin.roads), `${kind} can use the open lawn`)
  }
})
