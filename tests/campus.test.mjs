import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { campusLocations } from '../src/data/campus.ts'
import { assignCampusLocations, buildingCenter } from '../src/lib/campus.ts'
import { extractBuildingFootprints } from '../src/lib/buildings.ts'

const fixture = JSON.parse(await readFile(new URL('./fixtures/nit-goa-campus.json', import.meta.url), 'utf8'))
const buildings = extractBuildingFootprints(fixture.elements)
const realBuilding = buildings.find((building) => building.osmType === 'way')

test('metadata defines all requested landmarks with unique stable IDs and finite meter coordinates', () => {
  assert.deepEqual(campusLocations.map((location) => location.name), [
    'Academic Block', 'Administration Block', 'Boys Hostel', 'Girls Hostel', 'Canteen', 'Sports Ground', 'Open Air Theatre', 'Main Entrance',
  ])
  assert.equal(new Set(campusLocations.map((location) => location.id)).size, 8)
  assert.ok(campusLocations.every((location) => location.description && location.keywords.length > 0
    && Number.isFinite(location.coordinates.x) && Number.isFinite(location.coordinates.z)))
})

test('real OSM hostels use name matches and the three provisional buildings use proximity matches', () => {
  const assignments = assignCampusLocations(buildings)
  assert.equal(assignments.length, 22)
  const named = assignments.filter((assignment) => assignment.matchMethod === 'osm-name')
  assert.deepEqual(named.map((assignment) => [assignment.buildingId, assignment.location.id]), [
    ['relation/19505808/0', 'boys-hostel'],
    ['relation/19505809/0', 'girls-hostel'],
  ])
  const nearby = assignments.filter((assignment) => assignment.matchMethod === 'proximity')
  assert.deepEqual(new Set(nearby.map((assignment) => assignment.location.id)),
    new Set(['academic-block', 'administration-block', 'canteen']))
  assert.equal(new Set([...named, ...nearby].map((assignment) => assignment.location.id)).size, 5)
})

test('OSM query ordering does not change the location-to-footprint assignments', () => {
  const pairs = (input) => assignCampusLocations(input).map((assignment) => [assignment.buildingId, assignment.location.id]).sort()
  assert.deepEqual(pairs(buildings), pairs([...buildings].reverse()))
})

test('sports and entrance metadata never relabel neighboring buildings', () => {
  const center = buildingCenter(realBuilding)
  const openPlaces = campusLocations.filter((location) => ['sports', 'entrance'].includes(location.category))
    .map((location) => ({ ...location, coordinates: center }))
  assert.equal(assignCampusLocations([realBuilding], openPlaces)[0].matchMethod, 'unmatched')
})

test('nearby assignment is bounded and leaves distant buildings identifiable by OSM ID', () => {
  const center = buildingCenter(realBuilding)
  const location = { ...campusLocations[0], coordinates: { x: center.x + 41, z: center.z } }
  const assignment = assignCampusLocations([realBuilding], [location], 40)[0]
  assert.equal(assignment.matchMethod, 'unmatched')
  assert.equal(assignment.location.id, realBuilding.id)
  assert.equal(assignment.location.name, 'Unnamed campus building')
  assert.equal(assignCampusLocations([realBuilding], [location], 42)[0].location.id, location.id)
})

test('two landmarks cannot claim the same footprint and the closest anchor wins', () => {
  const center = buildingCenter(realBuilding)
  const farther = { ...campusLocations[0], coordinates: { x: center.x + 20, z: center.z } }
  const closer = { ...campusLocations[1], coordinates: { x: center.x + 1, z: center.z } }
  assert.equal(assignCampusLocations([realBuilding], [farther, closer])[0].location.id, closer.id)
})

test('an exact hostel name takes precedence over a closer provisional anchor', () => {
  const hostel = buildings.find((building) => building.tags.name === 'Talpona')
  const center = buildingCenter(hostel)
  const provisional = { ...campusLocations[0], coordinates: center }
  const boysHostel = { ...campusLocations.find((location) => location.id === 'boys-hostel'),
    coordinates: { x: center.x + 100, z: center.z } }
  const assignment = assignCampusLocations([hostel], [provisional, boysHostel])[0]
  assert.equal(assignment.location.id, 'boys-hostel')
  assert.equal(assignment.matchMethod, 'osm-name')
})

test('unrecognized OSM names remain intact instead of receiving an approximate campus name', () => {
  const building = { ...realBuilding, tags: { ...realBuilding.tags, name: 'Mapped utility building' } }
  const location = { ...campusLocations[0], coordinates: buildingCenter(building) }
  const assignment = assignCampusLocations([building], [location])[0]
  assert.equal(assignment.matchMethod, 'unmatched')
  assert.equal(assignment.location.name, 'Mapped utility building')
})

test('empty datasets are safe and matching does not mutate geometry or metadata', () => {
  assert.deepEqual(assignCampusLocations([]), [])
  const before = JSON.stringify({ buildings, campusLocations })
  assignCampusLocations(buildings)
  assert.equal(JSON.stringify({ buildings, campusLocations }), before)
})
