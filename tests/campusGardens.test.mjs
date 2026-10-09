import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { Vector3 } from 'three'
import { savedCampusOverrides } from '../src/data/campusOverrides.ts'
import { defaultTerrainSettings } from '../src/data/topography.ts'
import { extractBuildingFootprints } from '../src/lib/buildings.ts'
import { createDigitalTwin } from '../src/lib/digitalTwin.ts'
import { extractCampusRoads, pointInCampus } from '../src/lib/roads.ts'
import { GARDEN_LIMITS, generateCampusGardens } from '../src/lib/campusGardens.ts'
import { createFlowerLeaves, createFlowerPetals, createGardenSoil, createPalmFrond } from '../src/lib/gardenGeometry.ts'
import { distanceToRect, distanceToSegment, footprintRect, terrainHeightAt } from '../src/lib/terrain.ts'
import { treeTrunkRadius } from '../src/lib/vegetation.ts'
import { inCanalOpening } from '../src/lib/canal.ts'
import { flagBlocksWalking } from '../src/lib/campusFlag.ts'
import { inLawnBoundary } from '../src/lib/landscaping.ts'

const campus = JSON.parse(await readFile(new URL('./fixtures/nit-goa-campus.json', import.meta.url), 'utf8'))
const roadSource = JSON.parse(await readFile(new URL('./fixtures/nit-goa-roads.json', import.meta.url), 'utf8'))
const boundary = roadSource.elements.find(e => e.id === 1259742369).geometry
const buildings = extractBuildingFootprints(campus.elements)
const map = { buildings, boundary, source: 'campus-area', returnedBuildingCount: buildings.length }
const roads = { roads: extractCampusRoads(roadSource.elements, boundary), boundary, source: 'campus-area', returnedRoadCount: 20 }
const twin = createDigitalTwin(map, roads, true, savedCampusOverrides, defaultTerrainSettings)
const gardenCampus = {
  boundary: twin.boundary, buildings: twin.buildings, roads: twin.roads, terrain: twin.terrain,
  clearings: twin.vegetationClearings, trees: twin.trees, lamps: twin.lamps,
  locations: [...twin.locations, ...twin.selections.map(s => s.location)],
}
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z)
const ringDistance = (p, ring) => Math.min(...ring.map((a, i) => distanceToSegment(p, a, ring[(i + 1) % ring.length])))

test('gardens fill every bed, cover campus landmarks and remain deterministic within the rendering budget', () => {
  const { beds, flowers, shrubs } = twin.gardens
  assert.ok(beds.length > 100 && beds.length <= GARDEN_LIMITS.beds)
  assert.ok(flowers.length > 3000 && flowers.length <= GARDEN_LIMITS.flowers)
  assert.ok(shrubs.length > 500 && shrubs.length <= GARDEN_LIMITS.shrubs)
  assert.equal(new Set(beds.map(b => b.id)).size, beds.length)
  assert.ok(new Set(flowers.map(p => p.color)).size >= 10)
  for (const bed of beds) assert.ok(flowers.filter(p => distance(p, bed) < bed.length / 2).length >= 20, `filled ${bed.id}`)
  for (const id of ['main-entrance', 'administration-block', 'academic-block', 'girls-hostel', 'boys-hostel', 'sports-ground', 'open-air-theatre']) {
    const location = twin.locations.find(l => l.id === id)
    assert.ok(beds.some(b => distance(b, location.coordinates) < (id === 'boys-hostel' ? 65 : 45)), `flowers around ${id}`)
  }
  assert.deepEqual(generateCampusGardens(gardenCampus), twin.gardens)
})

test('planting leaves roads, building aprons, game/theatre access, utility pads, flag and open lawn centres clear', () => {
  const rects = twin.buildings.map(footprintRect)
  const segments = twin.roads.flatMap(r => r.paths.flatMap(path => path.slice(1).map((b, i) => ({ a: path[i], b, width: r.width }))))
  for (const plant of [...twin.gardens.flowers, ...twin.gardens.shrubs]) {
    const label = `${plant.x},${plant.z}`
    assert.ok(pointInCampus(plant, twin.boundary), label)
    assert.equal(plant.y, terrainHeightAt(twin.terrain, plant.x, plant.z), `root attached to ground at ${label}`)
    assert.ok(rects.every(r => distanceToRect(plant, r) >= 3.7 + plant.radius), `building apron ${label}`)
    assert.ok(segments.every(s => distanceToSegment(plant, s.a, s.b) >= s.width / 2 + 1.5 + plant.radius), `road shoulder ${label}`)
    assert.ok(twin.vegetationClearings.every(r => distanceToRect(plant, r) >= 1.6 + plant.radius), `usable plaza ${label}`)
    assert.ok(twin.trees.every(t => distance(plant, t) >= treeTrunkRadius(t) + 1.1 + plant.radius), `tree trunk ${label}`)
    assert.ok(twin.lamps.every(l => distance(plant, l) >= .55 + plant.radius), `lamp ${label}`)
    assert.ok(!inCanalOpening(plant, twin.canal, 1.9 + plant.radius), `canal ${label}`)
    assert.ok(!flagBlocksWalking(plant, twin.flag, 2.9 + plant.radius), `flag approach ${label}`)
    for (const lawn of twin.lawns) {
      if (inLawnBoundary(plant, lawn)) assert.ok(ringDistance(plant, lawn.outer) <= 3.6, `open lawn ${label}`)
      assert.ok(lawn.hardscape.every(ring => !pointInCampus(plant, ring) && ringDistance(plant, ring) >= .4 + plant.radius), `utility pad ${label}`)
    }
  }
})

test('garden generation preserves existing terrain, tree collision positions and delayed map loading', () => {
  const heights = twin.terrain.heights.slice(), colors = twin.terrain.colors.slice()
  const trees = structuredClone(twin.trees), lamps = structuredClone(twin.lamps)
  generateCampusGardens(gardenCampus)
  assert.deepEqual(twin.terrain.heights, heights)
  assert.deepEqual(twin.terrain.colors, colors)
  assert.deepEqual(twin.trees, trees)
  assert.deepEqual(twin.lamps, lamps)
  assert.equal(twin.trees.length, 644, '640 campus trees plus four entrance palms')
  assert.deepEqual(generateCampusGardens({ ...gardenCampus, boundary: [] }), { beds: [], flowers: [], shrubs: [] })
  assert.deepEqual(createDigitalTwin(map, roads, false, savedCampusOverrides).gardens, { beds: [], flowers: [], shrubs: [] })
})

test('soil drapes over slopes and shared flower/palm geometries have finite, nondegenerate faces', () => {
  const soil = createGardenSoil(twin.gardens.beds, twin.terrain)
  const geometries = [soil, createFlowerPetals(), createFlowerLeaves(), createPalmFrond()]
  for (const geometry of geometries) {
    const position = geometry.getAttribute('position'), normal = geometry.getAttribute('normal'), index = geometry.getIndex()
    assert.ok(index.count > 0)
    assert.ok(Array.from(position.array).every(Number.isFinite))
    assert.ok(Array.from(normal.array).every(Number.isFinite))
    const a = new Vector3(), b = new Vector3(), c = new Vector3()
    for (let i = 0; i < index.count; i += 3) {
      a.fromBufferAttribute(position, index.getX(i)); b.fromBufferAttribute(position, index.getX(i + 1)); c.fromBufferAttribute(position, index.getX(i + 2))
      const face = b.sub(a).cross(c.sub(a))
      assert.ok(face.lengthSq() > 1e-12, 'no collapsed triangles at petal/frond tips or soil centre')
      if (geometry === soil) assert.ok(face.y > 0, 'soil faces point up')
    }
    if (geometry === soil) for (let i = 0; i < position.count; i++) {
      const y = terrainHeightAt(twin.terrain, position.getX(i), position.getZ(i))
      assert.ok(Math.abs(position.getY(i) - y - .028) < .0001, 'no floating beds or changed ground')
    }
    geometry.dispose()
  }
})
