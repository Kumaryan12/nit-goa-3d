import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { validateOverrides, applyLocationOverride, readLocationEdits, writeLocationEdits, LOCATION_EDITS_KEY } from '../src/lib/locationOverrides.ts'
import { campusLocations } from '../src/data/campus.ts'
import { localToGps, gpsToLocal } from '../src/lib/geo.ts'
import { assignCampusLocations, buildingCenter } from '../src/lib/campus.ts'
import { createDigitalTwin } from '../src/lib/digitalTwin.ts'
import { extractBuildingFootprints } from '../src/lib/buildings.ts'
import { extractCampusRoads } from '../src/lib/roads.ts'
import { miniMapData } from '../src/lib/minimap.ts'
import { terrainHeightAt } from '../src/lib/terrain.ts'
import { createRoadGraph, planWalkingRoute } from '../src/lib/pathfinding.ts'
const campus = JSON.parse(await readFile(new URL('./fixtures/nit-goa-campus.json', import.meta.url), 'utf8'))
const roadResponse = JSON.parse(await readFile(new URL('./fixtures/nit-goa-roads.json', import.meta.url), 'utf8'))
const boundary = roadResponse.elements.find(element => element.id === 1259742369).geometry
const map = { buildings: extractBuildingFootprints(campus.elements), boundary, source: 'campus-area', returnedBuildingCount: 22 }
const roads = { roads: extractCampusRoads(roadResponse.elements, boundary), boundary, source: 'campus-area', returnedRoadCount: 20 }
const memory = () => { const data = new Map(); return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) } }

test('renaming keeps stable IDs, original search aliases and immutable source metadata', () => {
  const location = campusLocations[0], before = JSON.stringify(location)
  const corrected = applyLocationOverride(location, { name: 'C. V. Raman Academic Block' })
  assert.equal(corrected.id, 'academic-block'); assert.ok(corrected.keywords.includes('Academic Block')); assert.equal(corrected.name, 'C. V. Raman Academic Block'); assert.equal(JSON.stringify(location), before)
})
test('entrance/field edits validate meter coordinates and preserve rotation and exported JSON', () => {
  const edits = validateOverrides({ 'main-entrance': { coordinates: { x: -430.1234, z: -155.5678 }, rotationDegrees: 90, name: ' Main Gate ' } })
  assert.deepEqual(edits['main-entrance'], { coordinates: { x: -430.12, z: -155.57 }, rotationDegrees: 90, name: 'Main Gate' })
  const storage = memory(); writeLocationEdits(storage, edits); assert.deepEqual(readLocationEdits(storage), edits)
})
test('invalid names, IDs, coordinates, geometry moves and rotations are rejected', () => {
  for (const edit of [{ '__proto__': 1, invalid: {} }, { 'main-entrance': { name: ' ' } }, { 'main-entrance': { coordinates: { x: Infinity, z: 1 } } }, { 'main-entrance': { coordinates: { x: 5001, z: 1 } } }, { 'main-entrance': { rotationDegrees: 361 } }, { 'academic-block': { coordinates: { x: 0, z: 0 } } }, { 'main-entrance': { buildingId: 'way/1' } }]) assert.throws(() => validateOverrides(edit))
})
test('corrupt saved edits and inaccessible storage do not crash startup', () => {
  for (const value of ['not-json', '{"unknown":{}}', '[]']) assert.deepEqual(readLocationEdits({ getItem: () => value }), {})
  assert.deepEqual(readLocationEdits({ getItem: () => { throw new Error('blocked') } }), {})
  assert.throws(() => writeLocationEdits({ setItem: () => { throw new Error('quota') } }, {}), /Browser storage/)
  assert.equal(LOCATION_EDITS_KEY, 'nit-goa:location-edits:v1')
})
test('explicit building assignment overrides name/proximity without changing OSM geometry', () => {
  const before = JSON.stringify(map.buildings), target = map.buildings.find(building => building.tags.name === 'Talpona')
  const metadata = campusLocations.map(location => applyLocationOverride(location, location.id === 'academic-block' ? { buildingId: target.id } : undefined))
  const selection = assignCampusLocations(map.buildings, metadata).find(item => item.buildingId === target.id)
  assert.equal(selection.location.id, 'academic-block'); assert.equal(selection.matchMethod, 'manual'); assert.equal(JSON.stringify(map.buildings), before)
  assert.deepEqual(assignCampusLocations([...map.buildings].reverse(), metadata).find(item => item.buildingId === target.id), selection)
})
test('an unavailable or explicitly unassigned building does not silently rematch another footprint', () => {
  for (const buildingId of [null, 'way/999999999999']) {
    const metadata = campusLocations.map(location => applyLocationOverride(location, location.id === 'academic-block' ? { buildingId } : undefined))
    assert.equal(assignCampusLocations(map.buildings, metadata).some(item => item.location.id === 'academic-block'), false)
  }
})
test('two manual landmark assignments cannot claim the same footprint', () => assert.throws(() => validateOverrides({ 'academic-block': { buildingId: 'way/1' }, 'canteen': { buildingId: 'way/1' } }), /same building/))
test('corrected entrance updates terrain clearing and route anchor while preserving all mapped footprints', () => {
  const base = createDigitalTwin(map, roads), point = { x: -430, z: -150 }
  const corrected = createDigitalTwin(map, roads, true, { 'main-entrance': { coordinates: point, name: 'Corrected Gate' } })
  assert.deepEqual(corrected.locations.find(location => location.id === 'main-entrance').coordinates, point)
  assert.deepEqual(corrected.clearings[1], { ...point, halfX: 14, halfZ: 16 }); assert.equal(terrainHeightAt(corrected.terrain, point.x, point.z), 0)
  assert.deepEqual(corrected.buildings, base.buildings); assert.equal(corrected.trees.length, 640)
  const graph = createRoadGraph(roads.roads, { allowPrivate: true }), target = base.locations.find(location => location.id === 'boys-hostel').coordinates
  assert.notEqual(planWalkingRoute(point, target, graph).distance, planWalkingRoute(base.locations.find(location => location.id === 'main-entrance').coordinates, target, graph).distance)
})
test('rotated relocated sports ground gets a matching terrain and vegetation clearing', () => {
  const twin = createDigitalTwin(map, roads, true, { 'sports-ground': { coordinates: { x: -100, z: -150 }, rotationDegrees: 90 } })
  assert.ok(Math.abs(twin.clearings[0].halfX - 28) < 1e-8); assert.ok(Math.abs(twin.clearings[0].halfZ - 47) < 1e-8)
  assert.deepEqual(twin.locations.find(location => location.id === 'sports-ground').coordinates, { x: -100, z: -150 })
})
test('renaming any unassigned OSM footprint updates minimap and selection together', () => {
  const base = createDigitalTwin(map, roads), selection = base.selections.find(item => item.matchMethod === 'unmatched')
  const corrected = createDigitalTwin(map, roads, true, { [selection.location.id]: { name: 'Library' } })
  assert.equal(corrected.selections.find(item => item.buildingId === selection.buildingId).location.name, 'Library')
  assert.equal(miniMapData(corrected).buildings.find(item => item.id === selection.buildingId).name, 'Library')
  assert.deepEqual(corrected.buildings, base.buildings)
})
test('picker local coordinates convert back to GPS and round-trip within floating point tolerance', () => {
  for (const point of [{ x: 0, z: 0 }, { x: -470, z: -100 }, { x: 52.2, z: -402.7 }]) {
    const roundtrip = gpsToLocal(localToGps(point)); assert.ok(Math.abs(roundtrip.x - point.x) < 1e-8); assert.ok(Math.abs(roundtrip.z - point.z) < 1e-8)
  }
})
