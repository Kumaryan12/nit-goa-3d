import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildingAppearances } from '../src/data/buildingAppearances.ts'
import { savedCampusOverrides } from '../src/data/campusOverrides.ts'
import { defaultTerrainSettings } from '../src/data/topography.ts'
import { createCampusFacade, campusFacadeCamera } from '../src/lib/campusFacade.ts'
import { createDigitalTwin } from '../src/lib/digitalTwin.ts'
import { extractBuildingFootprints } from '../src/lib/buildings.ts'
import { extractCampusRoads, pointInCampus } from '../src/lib/roads.ts'
import { gpsToLocal } from '../src/lib/geo.ts'
import { createHostelPlan } from '../src/lib/hostelInterior.ts'
import { createWalkWorld, isWalkable } from '../src/lib/walking.ts'

const campus = JSON.parse(readFileSync(new URL('../public/map/nit-goa-campus.json', import.meta.url)))
const source = JSON.parse(readFileSync(new URL('../public/map/nit-goa-roads.json', import.meta.url)))
const boundary = campus.elements.find(e => e.id === 1259742369).geometry
const map = { buildings: extractBuildingFootprints(campus.elements), boundary, source: 'campus-area', returnedBuildingCount: 22 }
const roads = { roads: extractCampusRoads(source.elements, boundary), boundary, source: 'campus-area', returnedRoadCount: 20 }
const twin = createDigitalTwin(map, roads, false, savedCampusOverrides, { ...defaultTerrainSettings, customSlopes: [] })
const plans = twin.buildings.map((b, i) => createCampusFacade(b, twin.selections[i], twin.roads))

test('ten photo-backed appearances preserve owner names and footprints; ambiguous buildings retain generic geometry', () => {
  const before = JSON.stringify(twin.buildings)
  assert.equal(plans.filter(Boolean).length, 10)
  twin.buildings.forEach((b, i) => {
    const plan = createCampusFacade(b, twin.selections[i], twin.roads)
    if (!buildingAppearances[twin.selections[i].location.id]) return assert.equal(plan, null)
    assert.equal(plan.name, twin.selections[i].location.name)
    assert.equal(plan.buildingId, b.id)
    assert.equal(plan.height, b.height)
  })
  assert.equal(JSON.stringify(twin.buildings), before)
  const unknown = twin.selections.find(s => s.location.id === 'relation/19505812/0')
  assert.equal(buildingAppearances[unknown.location.id], undefined)
})

test('continuous tiled roofs cover mapped shells without sealing any courtyard', () => {
  let totalTriangles = 0
  for (let i = 0; i < plans.length; i++) {
    const plan = plans[i]; if (!plan) continue
    const b = twin.buildings[i], outer = b.outer.map(gpsToLocal), holes = b.holes.map(h => h.map(gpsToLocal))
    const area = ring => Math.abs(ring.slice(1).reduce((sum, p, i) => sum + ring[i].x * p.z - p.x * ring[i].z, 0)) / 2
    let projectedArea = 0
    for (let j = 0; j < plan.roof.vertices.length; j += 9) {
      const v = plan.roof.vertices.slice(j, j + 9), [a, c, d] = [0, 3, 6].map(k => ({ x: v[k], z: v[k + 2] }))
      projectedArea += Math.abs((c.x - a.x) * (d.z - a.z) - (d.x - a.x) * (c.z - a.z)) / 2
      const centroid = { x: (a.x + c.x + d.x) / 3, z: (a.z + c.z + d.z) / 3 }
      assert.ok(pointInCampus(centroid, outer), `${b.id} roof stays in outer polygon`)
      assert.ok(!holes.some(h => pointInCampus(centroid, h)), `${b.id} courtyard stays open`)
      for (const k of [1, 4, 7]) assert.ok(v[k] >= b.height + .37 && v[k] <= b.height + 2.19)
    }
    assert.ok(Math.abs(projectedArea - (area(outer) - holes.reduce((sum, h) => sum + area(h), 0))) < .001)
    totalTriangles += plan.roof.indices.length / 3
  }
  assert.ok(totalTriangles < 25000, `roof budget: ${totalTriangles}`)
})

test('new canopies leave mapped road widths clear and entrances remain exterior after ring reversal', () => {
  plans.forEach((plan, i) => {
    if (!plan) return
    if (plan.roadClearance !== null && plan.canopyDepth > 0) assert.ok(plan.canopyDepth + .49 <= plan.roadClearance)
    const b = twin.buildings[i], p = { x: plan.entrance.x + plan.front.outward.x * .2, z: plan.entrance.z + plan.front.outward.z * .2 }
    assert.equal(pointInCampus(p, b.outer.map(gpsToLocal)), false)
    const reversed = createCampusFacade({ ...b, outer: [...b.outer].reverse(), holes: b.holes.map(h => [...h].reverse()) }, twin.selections[i], twin.roads)
    assert.ok(Math.hypot(plan.entrance.x - reversed.entrance.x, plan.entrance.z - reversed.entrance.z) < .001)
    assert.ok(Math.hypot(plan.front.outward.x - reversed.front.outward.x, plan.front.outward.z - reversed.front.outward.z) < .001)
  })
})

test('boys hostel exterior aligns with its existing usable door and leaves ground glazing out of the opening', () => {
  const index = twin.selections.findIndex(s => s.location.id === 'boys-hostel'), b = twin.buildings[index]
  const world = createWalkWorld(twin.buildings, twin.boundary, twin.terrain)
  const hostel = createHostelPlan(b, twin.roads, point => isWalkable(point, world))
  assert.ok(hostel)
  const plan = createCampusFacade(b, twin.selections[index], twin.roads, hostel)
  assert.deepEqual(plan.entrance, hostel.entrance.point)
  assert.ok(!plan.panes.some(p => p.position[1] < hostel.floorHeight && Math.hypot(p.position[0] - plan.entrance.x, p.position[2] - plan.entrance.z) < 2.5))
  assert.ok(isWalkable(hostel.entrance.outside, world))
})

test('facade camera presents the front at its terrain elevation and follows owner renaming', () => {
  plans.filter(Boolean).forEach(plan => {
    const view = campusFacadeCamera(plan, 7)
    assert.equal(view.target[1], 7 + plan.height * .45)
    assert.ok((view.position[0] - plan.entrance.x) * plan.front.outward.x + (view.position[2] - plan.entrance.z) * plan.front.outward.z > 0)
  })
  const i = twin.selections.findIndex(s => s.location.id === 'academic-block')
  assert.equal(createCampusFacade(twin.buildings[i], { ...twin.selections[i], location: { ...twin.selections[i].location, name: 'Corrected by owner' } }, twin.roads).name, 'Corrected by owner')
  assert.equal(createCampusFacade({ ...twin.buildings[i], outer: [] }, twin.selections[i], twin.roads), null)
})
