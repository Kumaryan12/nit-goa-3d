import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { savedCampusOverrides } from '../src/data/campusOverrides.ts'
import { createEntranceCanal, canalCoordinates, canalPoint, inCanalOpening } from '../src/lib/canal.ts'
import { canalWaterHeight, createCanalGeometry, createBridgeSlabGeometry } from '../src/lib/canalGeometry.ts'
import { extractBuildingFootprints } from '../src/lib/buildings.ts'
import { createDigitalTwin } from '../src/lib/digitalTwin.ts'
import { extractCampusRoads } from '../src/lib/roads.ts'
import { createTerrainGeometry, generateTerrain, terrainHeightAt } from '../src/lib/terrain.ts'
import { createWalkWorld, isWalkable, stepWalking } from '../src/lib/walking.ts'
import { createRoadGraph, planWalkingRoute } from '../src/lib/pathfinding.ts'

const elements = JSON.parse(readFileSync(new URL('./fixtures/nit-goa-campus.json', import.meta.url))).elements
const roadElements = JSON.parse(readFileSync(new URL('./fixtures/nit-goa-roads.json', import.meta.url))).elements
const boundary = roadElements.find(element => element.id === 1259742369).geometry
const map = { buildings: extractBuildingFootprints(elements), boundary, source: 'campus-area', returnedBuildingCount: 22 }
const roads = { roads: extractCampusRoads(roadElements, boundary), boundary, source: 'campus-area', returnedRoadCount: 20 }
const twin = createDigitalTwin(map, roads, true, savedCampusOverrides)
const close = (actual, expected, tolerance = 1e-4) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} ≈ ${expected}`)

test('canal crossing is just inside the corrected gate and its deck covers both real entrance lanes', () => {
  const canal = twin.canal
  assert.ok(canal)
  assert.ok(canal.center.x > -520 && canal.center.x < -500)
  assert.ok(canal.center.z > -28 && canal.center.z < -15)
  close(canal.along.x * canal.across.x + canal.along.z * canal.across.z, 0)
  for (const id of canal.bridge.roadIds) {
    const road = roads.roads.find(road => road.id === id)
    const near = road.paths.flat().sort((a, b) => Math.hypot(a.x - canal.center.x, a.z - canal.center.z) - Math.hypot(b.x - canal.center.x, b.z - canal.center.z))[0]
    assert.ok(Math.abs(canalCoordinates(near, canal).along) + road.width / 2 < canal.bridge.width / 2)
  }
  assert.deepEqual(twin.roads, roads.roads, 'the crossing does not move or replace OSM centerlines')
  assert.equal(createEntranceCanal([], savedCampusOverrides['main-entrance'].coordinates), undefined)
  assert.equal(createEntranceCanal(roads.roads, { x: 500, z: 500 }), undefined)
  assert.equal(createDigitalTwin(map, null, false, savedCampusOverrides).canal, undefined)
})

test('terrain removes an exact narrow channel, including triangles crossing it without an inside vertex', () => {
  for (const angle of [0, 0.37, Math.PI / 4]) {
    const canal = { center: { x: 0, z: 0 }, along: { x: -Math.sin(angle), z: Math.cos(angle) }, across: { x: Math.cos(angle), z: Math.sin(angle) }, length: 20, width: 3, bankWidth: 0.5, depth: 1.2, bridge: { length: 7, width: 10, roadIds: [] } }
    const model = generateTerrain(30, { boundary: [], roads: [], buildings: [], clearings: [], canal }, 4)
    const geometry = createTerrainGeometry(model), vertices = geometry.getAttribute('position'), index = geometry.index
    try {
      assert.ok(vertices.array.every(Number.isFinite))
      assert.equal(vertices.count, geometry.getAttribute('color').count)
      let area = 0
      for (let i = 0; i < index.count; i += 3) {
        const triangle = [0, 1, 2].map(j => ({ x: vertices.getX(index.getX(i + j)), z: vertices.getZ(index.getX(i + j)) }))
        const [a, b, c] = triangle
        const signed = (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x)
        assert.ok(signed < 0, 'terrain triangles face upwards')
        area += -signed / 2
        assert.equal(inCanalOpening({ x: (a.x + b.x + c.x) / 3, z: (a.z + b.z + c.z) / 3 }, canal, -1e-4), false)
      }
      close(area, 30 ** 2 - 20 * 4, 1e-3)
    } finally { geometry.dispose() }
  }
})

test('water is recessed, grey lining meets the cut and the bridge surface follows the road grade', () => {
  const canal = twin.canal, geometry = createCanalGeometry(canal, twin.terrain), slab = createBridgeSlabGeometry(canal, twin.terrain)
  try {
    for (const part of [geometry.water, geometry.lining, slab]) assert.ok(part.getAttribute('position').array.every(Number.isFinite))
    const water = geometry.water.getAttribute('position')
    for (let i = 0; i < water.count; i++) {
      const local = canalCoordinates({ x: water.getX(i), z: water.getZ(i) }, canal)
      close(water.getY(i), canalWaterHeight(canal, twin.terrain, local.along))
      assert.ok(water.getY(i) < terrainHeightAt(twin.terrain, water.getX(i), water.getZ(i)) - 0.5)
    }
    const deck = slab.getAttribute('position')
    for (let i = 0; i < deck.count; i += 2) close(deck.getY(i), terrainHeightAt(twin.terrain, deck.getX(i), deck.getZ(i)) + 0.018)
  } finally { geometry.water.dispose(); geometry.lining.dispose(); slab.dispose() }
})

test('avatars cross the bridge, cannot enter the canal or pass through outer railings, and trees avoid its banks', () => {
  const canal = twin.canal, world = createWalkWorld(twin.buildings, twin.boundary, twin.terrain)
  const direction = canal.across
  let point = canalPoint(canal, -4.5, -8)
  for (let i = 0; i < 80; i++) point = stepWalking(point, direction, 4, 0.05, world)
  assert.ok(canalCoordinates(point, canal).across > 6)
  assert.equal(isWalkable(canalPoint(canal, 20, 0), world), false)
  assert.equal(isWalkable(canalPoint(canal, canal.bridge.width / 2 - 0.14, 2.7), world), false)
  assert.equal(isWalkable(canal.center, world), true)
  for (const tree of twin.trees) assert.equal(inCanalOpening(tree, canal, 3), false)
  const entrance = twin.locations.find(location => location.id === 'main-entrance'), admin = twin.locations.find(location => location.id === 'administration-block')
  assert.ok(planWalkingRoute(entrance.coordinates, admin.coordinates, createRoadGraph(twin.roads, { allowPrivate: true })), 'the entrance route remains connected')
})
