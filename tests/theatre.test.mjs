import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { campusLocations } from '../src/data/campus.ts'
import { savedCampusOverrides } from '../src/data/campusOverrides.ts'
import { createDigitalTwin } from '../src/lib/digitalTwin.ts'
import { extractBuildingFootprints } from '../src/lib/buildings.ts'
import { extractCampusRoads } from '../src/lib/roads.ts'
import { createTheatreLayout, createTheatreSectorGeometry, theatreToWorld, theatreToLocal, theatreSurfaceHeightAt } from '../src/lib/theatre.ts'
import { terrainHeightAt, distanceToRect, distanceToSegment } from '../src/lib/terrain.ts'
import { createWalkWorld, isWalkable, stepWalking, walkSurfaceHeightAt } from '../src/lib/walking.ts'
import { selectionForLocation } from '../src/lib/locations.ts'
import { searchCampus } from '../src/lib/search.ts'
import { validateOverrides } from '../src/lib/locationOverrides.ts'
import { nearbySeat, theatreSeats } from '../src/lib/social.ts'

const elements = name => JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url))).elements
const buildings = elements('nit-goa-campus'), roadElements = elements('nit-goa-roads')
const boundary = roadElements.find(element => element.id === 1259742369).geometry
const map = { buildings: extractBuildingFootprints(buildings), boundary }
const roads = { roads: extractCampusRoads(roadElements, boundary), boundary }
const twin = createDigitalTwin(map, roads, true, savedCampusOverrides)
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-5, `${a} ≈ ${b}`)

test('the theatre fills the large academic patch inside the ECE/CSE L-road, with a level plaza and clear access', () => {
  const theatre = twin.theatre, clearing = theatre.clearing
  close(theatre.rotation, Math.PI / 2)
  close(clearing.x, -232); close(clearing.z, -164.5)
  assert.ok(theatre.entrance.x > theatre.center.x, 'the additional half-turn puts the entrance east of the stage')
  close(theatre.entrance.z, theatre.center.z)
  const academic = twin.buildings[twin.selections.findIndex(item => item.location.id === 'academic-block')]
  assert.equal(clearing.benchBuildingId, academic.id)
  close(theatre.elevation, academic.baseElevation)
  // Owner's marked large patch: enclosed by the L-road on its west/north
  // edges and academic buildings to the south, rather than the original strip.
  assert.ok(clearing.x - clearing.halfX > -270 && clearing.x + clearing.halfX < -190)
  assert.ok(clearing.z - clearing.halfZ > -185 && clearing.z + clearing.halfZ < -130)
  assert.ok(clearing.halfX * 2 >= 65 && clearing.halfZ * 2 >= 35)
  const world = createWalkWorld(twin.buildings, twin.boundary, twin.terrain)
  for (let x = -11.5; x <= 11.5; x += 1) for (let z = -5; z <= 14.5; z += 1) {
    const p = theatreToWorld({ x, z }, theatre)
    close(terrainHeightAt(twin.terrain, p.x, p.z), theatre.elevation)
    for (const building of createWalkWorld(twin.buildings, twin.boundary, { ...twin.terrain, theatre: undefined }).buildings) {
      // Use the existing collision system to check actual polygons and holes.
      assert.ok(isWalkable(p, { boundary: [], terrain: { ...twin.terrain, theatre: undefined }, buildings: [building], trees: new Map() }), 'theatre must remain outside building walls')
    }
    for (const road of twin.roads) for (const path of road.paths) for (let i = 1; i < path.length; i++) {
      assert.ok(distanceToSegment(p, path[i - 1], path[i]) > road.width / 2, 'theatre must not cover mapped roads')
    }
  }
  assert.equal(theatre.access.length, 2)
  assert.ok(isWalkable(theatre.entrance, world))
  assert.ok(twin.trees.every(tree => distanceToRect(tree, clearing) >= 6))
  assert.ok(twin.trees.every(tree => distanceToSegment(tree, ...theatre.access) >= 1.2))
})

test('the central and rear stairs can be traversed to the stage while benches block avatars', () => {
  const theatre = twin.theatre, world = createWalkWorld(twin.buildings, twin.boundary, twin.terrain)
  let p = theatreToWorld({ x: 0, z: 14.4 }, theatre)
  const target = theatreToWorld({ x: 0, z: -2 }, theatre)
  const steps = Math.ceil(16.4 * theatre.depthScale / .23) + 5
  for (let step = 0; step < steps; step++) p = stepWalking(p, { x: target.x - p.x, z: target.z - p.z }, 2.3, .1, world)
  assert.ok(theatreToLocal(p, theatre).z < -1.5, 'avatar reaches the stage through both flights and the ramp')
  close(walkSurfaceHeightAt(twin.terrain, p.x, p.z), theatre.elevation + .53)
  const bench = theatreToWorld({ x: 6.9 / Math.SQRT2, z: 6.9 / Math.SQRT2 }, theatre)
  assert.equal(isWalkable(bench, world), false, 'seating is solid')
  const aisle = theatreToWorld({ x: .6, z: 7.6 }, theatre)
  assert.ok(isWalkable(aisle, world))
  close(theatreSurfaceHeightAt(aisle, theatre), theatre.elevation + .08 + 7 * .15)
  assert.equal(theatreSurfaceHeightAt({ x: 0, z: 0 }, theatre), null)
})

test('rear OAT aisle seats can be reached from the clear stairs without walking through benches', () => {
  const theatre = twin.theatre, world = createWalkWorld(twin.buildings, twin.boundary, twin.terrain)
  for (const seat of theatreSeats(theatre).filter(seat => seat.row >= 3 && [3, 4].includes(Number(seat.id.split('-')[2])))) {
    const local = theatreToLocal(seat, theatre), approach = theatreToWorld({ x: 0, z: local.z }, theatre)
    assert.ok(isWalkable(approach, world))
    assert.equal(nearbySeat([seat], { ...approach, y: walkSurfaceHeightAt(twin.terrain, approach.x, approach.z) })?.id, seat.id)
    assert.equal(nearbySeat([seat], { ...approach, y: seat.y }, [seat.id]), null)
  }
})

test('theatre placement and rotation remain editable and never claim a real building', () => {
  const edit = validateOverrides({ 'open-air-theatre': { coordinates: { x: 150, z: 180 }, rotationDegrees: -45 } })
  const moved = createDigitalTwin(map, roads, false, { ...savedCampusOverrides, ...edit })
  assert.deepEqual(moved.theatre.center, { x: 150, z: 180 })
  assert.equal(moved.theatre.clearing.benchBuildingId, undefined)
  assert.ok(!moved.selections.some(item => item.location.id === 'open-air-theatre'))
  assert.equal(selectionForLocation('open-air-theatre', moved.locations, moved.selections).buildingId, null)
  assert.throws(() => validateOverrides({ 'open-air-theatre': { buildingId: twin.buildings[0].id } }))
  const layout = createTheatreLayout(campusLocations.find(item => item.id === 'open-air-theatre'))
  for (const rotation of [0, Math.PI / 2, -Math.PI / 4]) {
    layout.rotation = rotation
    const p = { x: 3.25, z: 7.8 }, result = theatreToLocal(theatreToWorld(p, layout), layout)
    close(result.x, p.x); close(result.z, p.z)
  }
})

test('theatre search supports its name and OAT abbreviation', () => {
  for (const query of ['Open Air Theatre', 'OAT', 'amphitheatre']) assert.equal(searchCampus(query, twin.locations)[0].location.id, 'open-air-theatre')
})

test('curved seating produces finite geometry with upward top faces', () => {
  const geometry = createTheatreSectorGeometry(4.6, 5.5, .3, .1, 1.3)
  try {
    const p = geometry.getAttribute('position'), index = geometry.getIndex()
    assert.ok(p.array.every(Number.isFinite))
    assert.ok(geometry.getAttribute('normal').array.every(Number.isFinite))
    let tops = 0
    for (let i = 0; i < index.count; i += 3) {
      const [a, b, c] = [0, 1, 2].map(j => index.getX(i + j))
      if ([a, b, c].every(v => Math.abs(p.getY(v) - .3) < 1e-6)) {
        const crossY = (p.getZ(b) - p.getZ(a)) * (p.getX(c) - p.getX(a)) - (p.getX(b) - p.getX(a)) * (p.getZ(c) - p.getZ(a))
        assert.ok(crossY > 0); tops++
      }
    }
    assert.ok(tops > 10)
  } finally { geometry.dispose() }
})
