import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createAdministrationFacade, facadePoint } from '../src/lib/administrationFacade.ts'
import { extractBuildingFootprints } from '../src/lib/buildings.ts'
import { gpsToLocal } from '../src/lib/geo.ts'
import { pointInCampus, extractCampusRoads } from '../src/lib/roads.ts'
import { buildingCenter } from '../src/lib/campus.ts'
import { flyToLocation } from '../src/lib/camera.ts'
import { savedCampusOverrides } from '../src/data/campusOverrides.ts'

const buildings = extractBuildingFootprints(JSON.parse(readFileSync(new URL('../public/map/nit-goa-campus.json', import.meta.url))).elements)
const building = { ...buildings.find(b => b.id === savedCampusOverrides['administration-block'].buildingId), height: 10.5 }
const entrance = savedCampusOverrides['main-entrance'].coordinates

test('the corrected administration footprint has an exterior gate-facing facade and preserves its mapped geometry', () => {
  const before = JSON.stringify(building), plan = createAdministrationFacade(building, entrance)
  assert.ok(plan)
  assert.equal(plan.buildingId, 'way/1423803681')
  assert.equal(plan.floors, 3)
  assert.ok(plan.width > 47 && plan.width < 49)
  assert.ok(plan.depth > 19 && plan.depth < 21)
  assert.equal(plan.pitchedRoof, true)
  assert.ok(plan.front.outward.x < -.99, 'the sign faces the main gate west of the building')
  const outer = building.outer.map(gpsToLocal)
  assert.equal(pointInCampus(facadePoint(plan.front, 0, .5), outer), false)
  assert.equal(pointInCampus(facadePoint(plan.front, 0, -.5), outer), true)
  assert.equal(JSON.stringify(building), before)
})
test('reversing OSM ring winding leaves signs facing outward on the same public facade', () => {
  const plan = createAdministrationFacade(building, entrance)
  const reversed = createAdministrationFacade({ ...building, outer: [...building.outer].reverse() }, entrance)
  assert.ok(Math.hypot(plan.front.center.x - reversed.front.center.x, plan.front.center.z - reversed.front.center.z) < 1e-6)
  assert.ok(Math.abs(plan.front.angle - reversed.front.angle) < 1e-6)
  assert.equal(pointInCampus(facadePoint(reversed.front, 0, 1), building.outer.map(gpsToLocal)), false)
})
test('courtyard or invalid footprints cannot acquire a solid replacement roof', () => {
  const courtyard = buildings.find(b => b.holes.length > 0)
  const plan = createAdministrationFacade({ ...courtyard, height: 10.5 }, entrance)
  assert.ok(plan)
  assert.equal(plan.pitchedRoof, false)
  assert.equal(createAdministrationFacade({ ...building, outer: [] }, entrance), null)
  assert.equal(createAdministrationFacade({ ...building, height: 0 }, entrance), null)
})
test('the entrance steps and portico stay clear of the entire mapped road width', () => {
  const source = JSON.parse(readFileSync(new URL('../public/map/nit-goa-roads.json', import.meta.url)))
  const campus = JSON.parse(readFileSync(new URL('../public/map/nit-goa-campus.json', import.meta.url)))
  const boundary = campus.elements.find(e => e.id === 1259742369).geometry
  const roads = extractCampusRoads(source.elements, boundary), before = JSON.stringify(roads)
  const plan = createAdministrationFacade(building, entrance, roads)
  assert.ok(plan.roadClearance > .35)
  assert.ok(plan.porchScale > .02 && plan.porchScale < 1)
  assert.ok(plan.porchScale * 6.45 <= plan.roadClearance - .34)
  assert.equal(JSON.stringify(roads), before)
})
test('flying to Administration Block presents its entrance instead of the rear and respects terrain elevation', () => {
  const center = buildingCenter(building), elevation = 8
  const locations = [
    { id: 'administration-block', coordinates: center, category: 'administration', elevation },
    { id: 'main-entrance', coordinates: entrance, category: 'entrance' },
  ]
  const view = flyToLocation('administration-block', locations, building.height)
  const toGate = { x: entrance.x - center.x, z: entrance.z - center.z }
  assert.ok((view.position[0] - center.x) * toGate.x + (view.position[2] - center.z) * toGate.z > 0)
  assert.equal(view.target[1], elevation + building.height * .45)
  assert.ok(view.position[1] > view.target[1])
  assert.ok(flyToLocation('administration-block', locations.slice(0, 1), building.height))
})
