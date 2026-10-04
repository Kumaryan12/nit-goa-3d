import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { extractBuildingFootprints } from '../src/lib/buildings.ts'
import { buildingShape, roofShape } from '../src/lib/buildingGeometry.ts'
import { correctBoysHostelCourtyards, hostelBadmintonCourt, BOYS_HOSTEL_BUILDING_ID } from '../src/lib/boysHostelGeometry.ts'
import { pointInCampus } from '../src/lib/roads.ts'
const buildings = extractBuildingFootprints(JSON.parse(readFileSync(new URL('./fixtures/nit-goa-campus.json', import.meta.url))).elements)
const source = buildings.find(b => b.id === BOYS_HOSTEL_BUILDING_ID)
test('hostel correction closes only the covered opening without mutating mapped source or outer footprint', () => {
  const before = JSON.stringify(source), corrected = correctBoysHostelCourtyards(source)
  assert.equal(source.holes.length, 3); assert.equal(corrected.holes.length, 2)
  assert.deepEqual(corrected.outer, source.outer)
  assert.deepEqual(corrected.holes, source.holes.slice(1))
  assert.equal(JSON.stringify(source), before)
  assert.equal(correctBoysHostelCourtyards(corrected), corrected)
  assert.equal(buildingShape(corrected).holes.length, 2); assert.equal(roofShape(corrected).holes.length, 2)
  const reordered = { ...source, holes: [...source.holes].reverse() }
  assert.deepEqual(correctBoysHostelCourtyards(reordered).holes, [...corrected.holes].reverse())
  for (const other of buildings.filter(b => b.id !== source.id)) assert.equal(correctBoysHostelCourtyards(other), other)
})
test('southeast badminton court and runoff fit entirely in the courtyard at the building foundation', () => {
  const court = hostelBadmintonCourt({ ...source, baseElevation: 8 })
  assert.ok(court); assert.equal(court.width, 6.1); assert.equal(court.length, 13.4); assert.equal(court.base, 8)
  assert.ok(court.center.x > 20 && court.center.z > -368, 'southeast rather than northwest court')
  assert.ok(Math.abs(court.along.x * court.across.x + court.along.z * court.across.z) < 1e-9)
  for (let u = -5.05; u <= 5.05; u += .25) for (let v = -8.7; v <= 8.7; v += .25) {
    assert.ok(pointInCampus({ x: court.center.x + court.across.x * u + court.along.x * v, z: court.center.z + court.across.z * u + court.along.z * v }, court.courtyard))
  }
  assert.equal(hostelBadmintonCourt(buildings.find(b => b.id !== source.id)), null)
  assert.equal(hostelBadmintonCourt({ ...source, holes: [] }), null)
})
