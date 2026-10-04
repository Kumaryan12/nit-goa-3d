import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { ExtrudeGeometry, ShapeUtils } from 'three'
import { defaultTerrainSettings } from '../src/data/topography.ts'
import { buildingOverrides } from '../src/data/buildingOverrides.ts'
import { buildingHeight, DEFAULT_BUILDING_HEIGHT, extractBuildingFootprints } from '../src/lib/buildings.ts'
import { roofShape, buildingShape } from '../src/lib/buildingGeometry.ts'
import { extractCampusRoads, pointInCampus } from '../src/lib/roads.ts'
import { gpsToLocal } from '../src/lib/geo.ts'
import { createDigitalTwin } from '../src/lib/digitalTwin.ts'
import { generateTerrain, createTerrainGeometry, terrainHeightAt, footprintRect, distanceToRect, distanceToSegment, terrainNoise } from '../src/lib/terrain.ts'
import { generateTrees } from '../src/lib/vegetation.ts'
import { labelOpacity, fadeLabel, LABEL_FADE_START, LABEL_HIDE_DISTANCE } from '../src/lib/labels.ts'
import { lookupCameraLocation, flyToLocation, campusCameraView } from '../src/lib/camera.ts'

const campus = JSON.parse(await readFile(new URL('./fixtures/nit-goa-campus.json', import.meta.url), 'utf8'))
const roadResponse = JSON.parse(await readFile(new URL('./fixtures/nit-goa-roads.json', import.meta.url), 'utf8'))
const boundary = roadResponse.elements.find((element) => element.id === 1259742369).geometry
const map = { buildings: extractBuildingFootprints(campus.elements), boundary, source: 'campus-area', returnedBuildingCount: 22 }
const roadData = { roads: extractCampusRoads(roadResponse.elements, boundary), boundary, source: 'campus-area', returnedRoadCount: 20 }
const twin = createDigitalTwin(map, roadData, true, {}, { ...defaultTerrainSettings, customSlopes: [] })

const close = (actual, expected, epsilon = 1e-6) => assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} ≈ ${expected}`)

test('height priority honors OSM height, OSM levels, manual override, then default', () => {
  assert.equal(buildingHeight({ height: '22 m', 'building:levels': '3' }, 'boys-hostel'), 22)
  close(buildingHeight({ height: 'invalid', 'building:levels': '3' }, 'boys-hostel'), 9.6)
  assert.equal(buildingHeight({ height: '0', 'building:levels': '-2' }, 'boys-hostel'), 16)
  assert.equal(buildingHeight({}, 'unknown'), DEFAULT_BUILDING_HEIGHT)
  assert.equal(buildingHeight({}, 'boys-hostel', [{ id: 'boys-hostel', height: NaN, floors: 5 }]), DEFAULT_BUILDING_HEIGHT)
  assert.equal(buildingHeight({}, 'boys-hostel', [{ id: 'boys-hostel', height: -1, floors: 5 }]), DEFAULT_BUILDING_HEIGHT)
})

test('all five overrides are finite estimates applied after stable campus matching', () => {
  assert.deepEqual(new Set(buildingOverrides.map((item) => item.id)), new Set(['academic-block', 'administration-block', 'boys-hostel', 'girls-hostel', 'canteen']))
  for (const override of buildingOverrides) {
    const index = twin.selections.findIndex((selection) => selection.location.id === override.id)
    assert.ok(index >= 0)
    assert.equal(twin.buildings[index].height, override.height)
    assert.ok(override.floors > 0)
  }
  assert.equal(map.buildings.find((building) => building.tags.name === 'Talpona').height, 10, 'original OSM extraction is not mutated')
})

test('terrain is deterministic, bounded, non-flat in open land, and creates upward triangles', () => {
  const features = { boundary: [], buildings: [], roads: [], clearings: [] }
  const first = generateTerrain(400, features, 32), second = generateTerrain(400, features, 32)
  assert.deepEqual(first.heights, second.heights)
  assert.ok(Math.max(...first.heights) - Math.min(...first.heights) > 0.2)
  assert.ok(first.heights.every((height) => height >= 0 && height <= 2.11))
  assert.ok(first.colors.every(Number.isFinite))
  const geometry = createTerrainGeometry(first)
  assert.equal(geometry.getAttribute('position').count, 33 ** 2)
  assert.equal(geometry.index.count, 32 * 32 * 6)
  const normals = geometry.getAttribute('normal')
  for (let i = 0; i < normals.count; i++) assert.ok(normals.getY(i) > 0.99)
  geometry.dispose()
  close(terrainNoise(90 - 1e-5, 45), terrainNoise(90 + 1e-5, 45), 1e-5)
  assert.throws(() => generateTerrain(0, features))
  assert.throws(() => generateTerrain(400, features, 1000))
})

test('terrain sampler matches both mesh triangles and clamps outside its extent', () => {
  const model = { size: 2, segments: 1, heights: new Float32Array([0, 2, 4, 10]), colors: new Float32Array(12) }
  close(terrainHeightAt(model, -0.5, -0.5), 1.5)
  close(terrainHeightAt(model, 0.5, 0.5), 6.5)
  close(terrainHeightAt(model, 100, 100), 10)
})

test('all real road widths, building footprints, POI clearings and perimeter stay attached at Y=0', () => {
  for (const building of twin.buildings) for (const point of [...building.outer.map(gpsToLocal), { x: footprintRect(building).x, z: footprintRect(building).z }]) {
    close(terrainHeightAt(twin.terrain, point.x, point.z), 0)
  }
  for (const road of twin.roads) for (const path of road.paths) for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i], length = Math.hypot(b.x - a.x, b.z - a.z)
    for (let step = 0; step <= 4; step++) for (const side of [-1, 0, 1]) {
      const t = step / 4
      const x = a.x + (b.x - a.x) * t - (b.z - a.z) / length * road.width / 2 * side
      const z = a.z + (b.z - a.z) * t + (b.x - a.x) / length * road.width / 2 * side
      close(terrainHeightAt(twin.terrain, x, z), 0)
    }
  }
  for (const rect of twin.clearings) for (const dx of [-1, 0, 1]) for (const dz of [-1, 0, 1]) close(terrainHeightAt(twin.terrain, rect.x + dx * rect.halfX, rect.z + dz * rect.halfZ), 0)
  for (let i = 1; i < twin.boundary.length; i++) {
    const a = twin.boundary[i - 1], b = twin.boundary[i]
    for (let step = 0; step <= 4; step++) close(terrainHeightAt(twin.terrain, a.x + (b.x - a.x) * step / 4, a.z + (b.z - a.z) * step / 4), 0)
  }
})

test('640 reproducible trees stay inside campus, clear buildings/roads/POIs, and sample terrain elevation', () => {
  assert.equal(twin.trees.length, 640)
  assert.deepEqual(generateTrees(twin.boundary, twin.buildings, twin.roads, twin.vegetationClearings, twin.terrain), twin.trees)
  assert.ok(twin.trees.some((tree) => tree.palm) && twin.trees.some((tree) => !tree.palm))
  for (const tree of twin.trees) {
    assert.ok(pointInCampus(tree, twin.boundary))
    close(tree.y, terrainHeightAt(twin.terrain, tree.x, tree.z))
    for (const building of twin.buildings) assert.ok(distanceToRect(tree, footprintRect(building)) >= 5)
    for (const rect of twin.vegetationClearings) assert.ok(distanceToRect(tree, rect) >= 6)
    for (const road of twin.roads) for (const path of road.paths) for (let i = 1; i < path.length; i++) assert.ok(distanceToSegment(tree, path[i - 1], path[i]) >= road.width / 2 + 4)
  }
  assert.deepEqual(generateTrees([], [], [], [], twin.terrain), [])
})

test('late road loading preserves building identity and height, and postpones trees until roads settle', () => {
  const partial = createDigitalTwin(map, null, false, {}, { ...defaultTerrainSettings, customSlopes: [] })
  assert.equal(partial.trees.length, 0)
  assert.deepEqual(partial.buildings.map((b) => [b.id, b.height]), twin.buildings.map((b) => [b.id, b.height]))
  assert.deepEqual(partial.selections, twin.selections)
  assert.equal(createDigitalTwin(map, null, true).buildings.length, 22, 'a road error leaves buildings intact')
})

test('roof silhouettes expand locally without filling or moving any real courtyard hole', () => {
  for (const building of twin.buildings) {
    const body = buildingShape(building), roof = roofShape(building)
    assert.equal(roof.holes.length, body.holes.length)
    roof.holes.forEach((hole, i) => assert.deepEqual(hole.getPoints(), body.holes[i].getPoints()))
    assert.ok(Math.abs(ShapeUtils.area(roof.getPoints())) > Math.abs(ShapeUtils.area(body.getPoints())))
    const geometry = new ExtrudeGeometry(roof, { depth: 0.32, bevelEnabled: false })
    assert.ok(geometry.getAttribute('position').array.every(Number.isFinite))
    geometry.dispose()
  }
})

test('labels fade smoothly with distance and hide behind the camera or at invalid distances', () => {
  assert.equal(labelOpacity(100), 1)
  assert.equal(labelOpacity(LABEL_FADE_START), 1)
  close(labelOpacity((LABEL_FADE_START + LABEL_HIDE_DISTANCE) / 2), 0.5)
  assert.equal(labelOpacity(LABEL_HIDE_DISTANCE), 0)
  for (const distance of [-1, Infinity, NaN]) assert.equal(labelOpacity(distance), 0)
  assert.equal(labelOpacity(100, false), 0)
  const first = fadeLabel(0, 1, 0.1), second = fadeLabel(first, 1, 0.1)
  assert.ok(first > 0 && second > first && second < 1)
  assert.equal(fadeLabel(0.4, 1, 0), 0.4)
})

test('camera lookup and fly-to use stable IDs and real matched coordinates, and reject unknown/invalid locations', () => {
  assert.equal(lookupCameraLocation('boys-hostel').name, 'Boys Hostel')
  assert.equal(lookupCameraLocation('missing'), null)
  assert.equal(flyToLocation('missing'), null)
  const location = twin.locations.find((item) => item.id === 'boys-hostel')
  const view = flyToLocation('boys-hostel', twin.locations, 18)
  close(view.target[0], location.coordinates.x)
  close(view.target[2], location.coordinates.z)
  assert.ok(view.position[1] > view.target[1])
  assert.equal(lookupCameraLocation('bad', [{ id: 'bad', coordinates: { x: NaN, z: 0 } }]), null)
  const points = [{ x: -500, z: -400 }, { x: 50, z: 0 }]
  const desktop = campusCameraView(points, 1.5), phone = campusCameraView(points, 0.5)
  assert.deepEqual(desktop.target, [-225, 0, -200])
  assert.ok(phone.position[1] > desktop.position[1])
  assert.ok(campusCameraView([]).position.every(Number.isFinite))
})
