import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { savedCampusOverrides } from '../src/data/campusOverrides.ts'
import { defaultTerrainSettings } from '../src/data/topography.ts'
import { extractBuildingFootprints } from '../src/lib/buildings.ts'
import { createDigitalTwin } from '../src/lib/digitalTwin.ts'
import { gpsToLocal } from '../src/lib/geo.ts'
import { createHostelPlan } from '../src/lib/hostelInterior.ts'
import { LOCATION_EDITS_KEY } from '../src/lib/locationOverrides.ts'
import { createRoadGeometry, FOOTPATH_ELEVATION, ROAD_ELEVATION } from '../src/lib/roadGeometry.ts'
import { extractCampusRoads } from '../src/lib/roads.ts'
import { footprintRect, terrainGradeAt, terrainHeightAt } from '../src/lib/terrain.ts'
import { readTerrainSettings, saveTerrainSettings, TERRAIN_SETTINGS_KEY, validateTerrainSettings } from '../src/lib/terrainSettings.ts'
import { createWalkWorld, isWalkable } from '../src/lib/walking.ts'

const buildings = JSON.parse(readFileSync(new URL('./fixtures/nit-goa-campus.json', import.meta.url))).elements
const roadElements = JSON.parse(readFileSync(new URL('./fixtures/nit-goa-roads.json', import.meta.url))).elements
const boundary = roadElements.find(element => element.id === 1259742369).geometry
const map = { buildings: extractBuildingFootprints(buildings), boundary, source: 'campus-area', returnedBuildingCount: 22 }
const roads = { roads: extractCampusRoads(roadElements, boundary), boundary, source: 'campus-area', returnedRoadCount: 20 }
const twin = createDigitalTwin(map, roads, true, savedCampusOverrides)
const maximumSettings = { nescafeRiseMeters: 24, gateRiseMeters: 16, girlsRoadRiseMeters: 12, showContours: true, customSlopes: [] }
const maximum = createDigitalTwin(map, roads, false, savedCampusOverrides, maximumSettings)
const close = (actual, expected, tolerance = 1e-5) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} ≈ ${expected}`)
const location = (model, id) => model.locations.find(place => place.id === id)
const maximumHeight = model => model.terrain.heights.reduce((height, value) => Math.max(height, value), -Infinity)

test('published corrections preserve the gate, Nescafe and continuous Faculty road climbs', () => {
  close(twin.upperLocation.elevation - location(twin, 'sports-ground').elevation, defaultTerrainSettings.nescafeRiseMeters)
  close(location(twin, 'administration-block').elevation - location(twin, 'main-entrance').elevation, defaultTerrainSettings.gateRiseMeters)
  const faculty = twin.selections.find(item => item.location.name === 'Faculty Quarters').location
  close(faculty.elevation - location(twin, 'girls-hostel').elevation, defaultTerrainSettings.girlsRoadRiseMeters)
  const points = [{ x: -370, z: -303 }, { x: -320, z: -294 }, { x: -270, z: -284 }, { x: -220, z: -275 }, { x: -170, z: -274 }, { x: -130, z: -274 }]
  let previous = location(twin, 'girls-hostel').elevation
  for (const point of points) {
    const height = terrainHeightAt(twin.terrain, point.x, point.z)
    assert.ok(height >= previous && height <= faculty.elevation, `road rises toward faculty: ${height} after ${previous}`)
    previous = height
  }
})

test('slope settings keep full building foundations and sports/entrance terraces level', () => {
  for (const model of [twin, maximum]) {
    for (const building of model.buildings) {
      const original = map.buildings.find(source => source.id === building.id)
      assert.deepEqual(building.outer, original.outer)
      assert.deepEqual(building.holes, original.holes)
      assert.ok(Number.isFinite(building.baseElevation))
      for (const ring of [building.outer, ...building.holes]) {
        const points = ring.map(gpsToLocal)
        for (let i = 1; i < points.length; i++) for (let step = 0; step <= 4; step++) {
          const p = { x: points[i - 1].x + (points[i].x - points[i - 1].x) * step / 4, z: points[i - 1].z + (points[i].z - points[i - 1].z) * step / 4 }
          close(terrainHeightAt(model.terrain, p.x, p.z), building.baseElevation)
        }
      }
    }
    for (const rect of model.clearings) for (const u of [-1, 0, 1]) for (const v of [-1, 0, 1]) {
      close(terrainHeightAt(model.terrain, rect.x + u * rect.halfX, rect.z + v * rect.halfZ), terrainHeightAt(model.terrain, rect.x, rect.z))
    }
  }
  assert.ok(map.buildings.every(building => building.baseElevation === undefined), 'OSM source records remain unmodified')
})

test('hostel entrance stays at its interior foundation when terrain settings change', () => {
  for (const model of [twin, maximum]) {
    const world = createWalkWorld(model.buildings, model.boundary, model.terrain)
    const building = model.buildings[model.selections.findIndex(selection => selection.location.id === 'boys-hostel')]
    const plan = createHostelPlan(building, model.roads, point => isWalkable(point, world))
    assert.ok(plan)
    close(plan.base, building.baseElevation)
    for (const point of [plan.entrance.inside, plan.entrance.point, plan.entrance.outside]) close(terrainHeightAt(model.terrain, point.x, point.z), plan.base)
    assert.ok(isWalkable(plan.entrance.outside, world))
  }
})

test('real roads remain finite, attached to terrain and below the avatar slope limit by default', () => {
  for (const model of [twin, maximum]) for (const road of model.roads) {
    const lift = road.kind === 'footpath' ? FOOTPATH_ELEVATION : ROAD_ELEVATION
    const geometry = createRoadGeometry(road.paths, road.width, lift, model.terrain)
    try {
      const positions = geometry.getAttribute('position')
      assert.ok(positions.array.every(Number.isFinite), road.id)
      for (let i = 0; i < positions.count; i++) {
        const x = positions.getX(i), z = positions.getZ(i)
        close(positions.getY(i), terrainHeightAt(model.terrain, x, z) + lift, 1e-4)
        if (model === twin) assert.ok(terrainGradeAt(model.terrain, x, z) <= 1.2, `${road.id} is too steep at ${x}, ${z}`)
      }
    } finally { geometry.dispose() }
  }
})

test('campus slopes are deterministic and editable without inventing surrounding hills', () => {
  const source = JSON.stringify({ map, roads, savedCampusOverrides, defaultTerrainSettings })
  const repeat = createDigitalTwin(map, roads, true, savedCampusOverrides)
  assert.deepEqual(repeat.terrain, twin.terrain)
  assert.deepEqual(repeat.trees, twin.trees)
  const contours = createDigitalTwin(map, roads, false, savedCampusOverrides, { ...defaultTerrainSettings, showContours: true })
  assert.deepEqual(contours.terrain, twin.terrain)
  const legacy = createDigitalTwin(map, roads, false, savedCampusOverrides, { ...defaultTerrainSettings, hillsideRiseMeters: 40 })
  assert.deepEqual(legacy.terrain, twin.terrain, 'old browser settings cannot restore raised banks')
  assert.ok(maximumHeight(twin) > defaultTerrainSettings.nescafeRiseMeters, 'the published uphill section extends above the original plateau')
  assert.ok(maximumHeight(twin) <= defaultTerrainSettings.nescafeRiseMeters + defaultTerrainSettings.customSlopes.reduce((total, slope) => total + slope.riseMeters, 0))
  close(maximumHeight(maximum), maximumSettings.nescafeRiseMeters)
  for (const model of [twin, maximum, legacy]) {
    assert.ok(model.terrain.heights.every(Number.isFinite))
    assert.ok(model.terrain.colors.every(value => Number.isFinite(value) && value >= 0 && value <= 1))
  }
  assert.equal(JSON.stringify({ map, roads, savedCampusOverrides, defaultTerrainSettings }), source)
})

test('trees sit on the graded surface and leave steep slopes clear', () => {
  assert.ok(twin.trees.length > 0)
  let steepVertices = 0
  for (let row = 0; row <= twin.terrain.segments; row++) for (let col = 0; col <= twin.terrain.segments; col++) {
    const x = -twin.size / 2 + col * twin.size / twin.terrain.segments, z = -twin.size / 2 + row * twin.size / twin.terrain.segments
    if (terrainGradeAt(twin.terrain, x, z) > .48) steepVertices++
  }
  assert.ok(steepVertices > 0, 'the described slopes remain in the terrain')
  for (const tree of twin.trees) {
    close(tree.y, terrainHeightAt(twin.terrain, tree.x, tree.z))
    assert.ok(terrainGradeAt(twin.terrain, tree.x, tree.z) <= .48)
  }
})

test('missing Nescafe anchor preserves the existing terrain while roads load independently', () => {
  const unresolved = createDigitalTwin(map, roads, false, {}, maximumSettings)
  assert.equal(unresolved.slope, undefined)
  assert.ok(unresolved.buildings.every(building => building.baseElevation === undefined))
  const pendingRoads = createDigitalTwin(map, null, false, savedCampusOverrides)
  assert.equal(pendingRoads.trees.length, 0)
  for (const building of pendingRoads.buildings) {
    const full = twin.buildings.find(item => item.id === building.id)
    assert.deepEqual(footprintRect(building), footprintRect(full))
    close(building.baseElevation, full.baseElevation)
  }
})

test('terrain settings reject corrupt values and constrain relative height estimates', () => {
  for (const invalid of [undefined, null, false, 'bad', [], 12]) assert.deepEqual(validateTerrainSettings(invalid), defaultTerrainSettings)
  const bad = { nescafeRiseMeters: NaN, gateRiseMeters: Infinity, girlsRoadRiseMeters: '4', hillsideRiseMeters: null, showContours: 'true' }
  assert.deepEqual(validateTerrainSettings(bad), defaultTerrainSettings)
  assert.deepEqual(validateTerrainSettings({ nescafeRiseMeters: 999, gateRiseMeters: -8, girlsRoadRiseMeters: 999, hillsideRiseMeters: -9, showContours: true }), {
    nescafeRiseMeters: 24, gateRiseMeters: 0, girlsRoadRiseMeters: 12, showContours: true, customSlopes: defaultTerrainSettings.customSlopes,
  })
})

test('terrain settings round-trip separately from campus corrections and tolerate unavailable storage', () => {
  const values = new Map([[LOCATION_EDITS_KEY, JSON.stringify(savedCampusOverrides)]])
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }
  saveTerrainSettings(storage, maximumSettings)
  assert.deepEqual(readTerrainSettings(storage), maximumSettings)
  values.set(TERRAIN_SETTINGS_KEY, JSON.stringify({ ...maximumSettings, hillsideRiseMeters: 18 }))
  assert.deepEqual(readTerrainSettings(storage), { ...maximumSettings, customSlopes: defaultTerrainSettings.customSlopes }, 'older saves retain slope heights, discard the hillside setting and inherit published slopes')
  assert.equal(values.get(LOCATION_EDITS_KEY), JSON.stringify(savedCampusOverrides))
  for (const corrupt of ['{broken', 'null', '[]', '"bad"']) {
    values.set(TERRAIN_SETTINGS_KEY, corrupt)
    assert.deepEqual(readTerrainSettings(storage), defaultTerrainSettings)
  }
  assert.deepEqual(readTerrainSettings({ getItem: () => { throw new Error('storage blocked') } }), defaultTerrainSettings)
  assert.doesNotThrow(() => saveTerrainSettings({ setItem: () => { throw new Error('quota') } }, maximumSettings))
  const first = readTerrainSettings({ getItem: () => null }); first.nescafeRiseMeters = 24
  assert.deepEqual(readTerrainSettings({ getItem: () => null }), defaultTerrainSettings)
})
