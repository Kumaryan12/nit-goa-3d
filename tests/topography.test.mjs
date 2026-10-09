import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { defaultTerrainSettings } from '../src/data/topography.ts'
import { slopeElevationAt } from '../src/lib/topography.ts'
import { generateTerrain, terrainHeightAt, footprintRect } from '../src/lib/terrain.ts'
import { createDigitalTwin } from '../src/lib/digitalTwin.ts'
import { createRoadGeometry, ROAD_ELEVATION } from '../src/lib/roadGeometry.ts'
import { extractBuildingFootprints } from '../src/lib/buildings.ts'
import { extractCampusRoads } from '../src/lib/roads.ts'
import { gpsToLocal } from '../src/lib/geo.ts'
import { flyToLocation } from '../src/lib/camera.ts'
const slope = { lower: { x: 0, z: 0, halfX: 20, halfZ: 15 }, upper: { x: 120, z: 0, halfX: 8, halfZ: 8 }, rise: 8 }
const close = (a, b, tolerance = 1e-5) => assert.ok(Math.abs(a - b) < tolerance, `${a} ≠ ${b}`)
test('relative profile preserves both terraces and descends smoothly and monotonically toward sports', () => {
  for (const x of [-50, 0, 20]) close(slopeElevationAt({ x, z: 0 }, slope), 0)
  for (const x of [120, 140]) close(slopeElevationAt({ x, z: 0 }, slope), 8)
  let previous = 0
  for (let x = 0; x <= 120; x++) { const y = slopeElevationAt({ x, z: 0 }, slope); assert.ok(y >= previous && y - previous < 0.2); previous = y }
  assert.equal(slopeElevationAt({ x: 120, z: 0 }), 0)
  close(slopeElevationAt({ x: 0, z: 120 }, { ...slope, upper: { ...slope.upper, x: 0, z: 120 } }), 8)
})
test('terrain keeps the full sports field and upper terrace level and roads at their local grade', () => {
  const terrain = generateTerrain(400, { boundary: [], buildings: [], roads: [{ width: 5, paths: [[{ x: 0, z: 0 }, { x: 120, z: 0 }]] }], clearings: [slope.lower, slope.upper], slope }, 160)
  for (const [rect, elevation] of [[slope.lower, 0], [slope.upper, 8]]) for (const dx of [-1, 0, 1]) for (const dz of [-1, 0, 1]) close(terrainHeightAt(terrain, rect.x + dx * rect.halfX, rect.z + dz * rect.halfZ), elevation)
  const middle = terrainHeightAt(terrain, 65, 0); assert.ok(middle > 0 && middle < 8)
  const mesh = createRoadGeometry([[{ x: 0, z: 0 }, { x: 120, z: 0 }]], 5, ROAD_ELEVATION, terrain)
  const positions = mesh.getAttribute('position'); assert.ok(positions.count > 200)
  for (let i = 0; i < positions.count; i++) close(positions.getY(i), terrainHeightAt(terrain, positions.getX(i), positions.getZ(i)) + ROAD_ELEVATION)
  assert.equal(positions.getY(0).toFixed(2), '0.06'); assert.equal(positions.getY(positions.count - 1).toFixed(2), '8.06')
  mesh.dispose()
})
const elements = JSON.parse(readFileSync(new URL('./fixtures/nit-goa-campus.json', import.meta.url))).elements
const roadElements = JSON.parse(readFileSync(new URL('./fixtures/nit-goa-roads.json', import.meta.url))).elements
const boundary = roadElements.find(element => element.id === 1259742369).geometry
const map = { buildings: extractBuildingFootprints(elements), boundary, source: 'campus-area', returnedBuildingCount: 22 }
const roads = { roads: extractCampusRoads(roadElements, boundary), boundary, source: 'campus-area', returnedRoadCount: 20 }
const edits = { 'way/1423803659': { name: 'Nescafé' }, 'sports-ground': { coordinates: { x: -100, z: -430 } } }
test('corrected Nescafe name activates relief without moving mapped X/Z or mutating source metadata', () => {
  const original = JSON.stringify(map), twin = createDigitalTwin(map, roads, true, edits)
  assert.ok(twin.slope); assert.equal(twin.buildings.length, 22); assert.equal(JSON.stringify(map), original)
  const cafe = twin.selections.find(selection => selection.location.name === 'Nescafé')
  close(cafe.location.elevation, 8)
  const building = twin.buildings.find(building => building.id === cafe.buildingId)
  close(building.baseElevation, 8)
  for (const building of twin.buildings) {
    assert.deepEqual(building.outer, map.buildings.find(original => original.id === building.id).outer)
    const rect = footprintRect(building)
    for (const point of building.outer.map(gpsToLocal)) close(terrainHeightAt(twin.terrain, point.x, point.z), building.baseElevation)
    assert.ok(Number.isFinite(rect.x))
  }
  const sports = twin.locations.find(location => location.id === 'sports-ground'); close(sports.elevation, 0)
  for (const tree of twin.trees) close(tree.y, terrainHeightAt(twin.terrain, tree.x, tree.z))
  const view = flyToLocation(cafe.location.id, [cafe.location], building.height)
  assert.ok(view.target[1] >= 8)
})
test('moving sports ground changes slope direction while an unknown upper anchor leaves the existing campus terrain intact', () => {
  const first = createDigitalTwin(map, roads, false, edits), second = createDigitalTwin(map, roads, false, { ...edits, 'sports-ground': { coordinates: { x: 80, z: -280 } } })
  assert.notDeepEqual(first.slope.lower, second.slope.lower)
  close(terrainHeightAt(second.terrain, 80, -280), 0)
  const base = createDigitalTwin(map, roads, false, {}, { ...defaultTerrainSettings, customSlopes: [] })
  assert.equal(base.slope, undefined); assert.ok(base.buildings.every(building => building.baseElevation === undefined))
})

test('published corrections activate the Nescafe slope and preserve the exported field, entrance and building identities', async () => {
  const { savedCampusOverrides } = await import('../src/data/campusOverrides.ts')
  const { validateOverrides } = await import('../src/lib/locationOverrides.ts')
  const twin = createDigitalTwin(map, roads, true, validateOverrides(savedCampusOverrides))
  assert.equal(twin.upperLocation.id, 'way/1423803659')
  assert.equal(twin.upperLocation.name, 'Nescafe')
  close(twin.upperLocation.elevation, 8)
  const sports = twin.locations.find(location => location.id === 'sports-ground')
  assert.deepEqual(sports.coordinates, { x: -120.84, z: -380.6 })
  assert.equal(sports.rotationDegrees, 90)
  close(sports.elevation, 0)
  close(twin.clearings[0].halfX, 28); close(twin.clearings[0].halfZ, 47)
  for (const dx of [-1, 0, 1]) for (const dz of [-1, 0, 1]) close(terrainHeightAt(twin.terrain, sports.coordinates.x + dx * 28, sports.coordinates.z + dz * 47), 0)
  assert.deepEqual(twin.locations.find(location => location.id === 'main-entrance').coordinates, { x: -545.5, z: -22.49 })
  for (const [id, buildingId] of [['canteen', 'way/1423803663'], ['administration-block', 'way/1423803681']]) {
    const selection = twin.selections.find(selection => selection.location.id === id)
    assert.equal(selection.buildingId, buildingId); assert.equal(selection.matchMethod, 'manual')
  }
  assert.equal(twin.selections.find(selection => selection.buildingId === 'relation/19505813/0').location.name, 'Gyan Mandir')
  assert.equal(twin.selections.find(selection => selection.buildingId === 'way/1423803680').location.name, 'Seminar Complex')
  assert.equal(twin.selections.find(selection => selection.buildingId === 'relation/19505815/0').location.name, 'Vikram Sarabhai (ECE)')
  for (const building of twin.buildings) {
    assert.deepEqual(building.outer, map.buildings.find(source => source.id === building.id).outer)
    for (const point of building.outer.map(gpsToLocal)) close(terrainHeightAt(twin.terrain, point.x, point.z), building.baseElevation)
  }
  assert.equal(twin.trees.length, 644)
})
