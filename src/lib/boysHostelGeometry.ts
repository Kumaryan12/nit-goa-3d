import { gpsToLocal } from './geo.ts'
import type { LocalCoordinate } from './geo.ts'
import { pointInCampus } from './roads.ts'
import type { BuildingFootprint } from '../types/osm.ts'

export const BOYS_HOSTEL_BUILDING_ID = 'relation/19505808/0'
// The official aerial photograph shows a roof over this irregular mapped hole.
// The other two openings are the owner-confirmed northwest/southeast courts.
export function correctBoysHostelCourtyards(building: BuildingFootprint): BuildingFootprint {
  if (building.id !== BOYS_HOSTEL_BUILDING_ID || building.holes.length !== 3) return building
  const covered = building.holes.findIndex(ring => pointInCampus({ x: 30, z: -397 }, ring.map(gpsToLocal)))
  return covered < 0 ? building : { ...building, holes: building.holes.filter((_, i) => i !== covered) }
}

export interface HostelBadmintonCourt {
  center: LocalCoordinate
  along: LocalCoordinate
  across: LocalCoordinate
  courtyard: LocalCoordinate[]
  length: number
  width: number
  base: number
}
// Southeast placement follows the owner. Alignment follows the mapped wing;
// dimensions and the precise position within the courtyard are approximate.
export function hostelBadmintonCourt(building: BuildingFootprint): HostelBadmintonCourt | null {
  const corrected = correctBoysHostelCourtyards(building)
  if (corrected.id !== BOYS_HOSTEL_BUILDING_ID || corrected.holes.length !== 2) return null
  const average = (ring: LocalCoordinate[]) => ring.slice(0, -1).reduce((p, q) => ({ x: p.x + q.x / (ring.length - 1), z: p.z + q.z / (ring.length - 1) }), { x: 0, z: 0 })
  const courtyard = corrected.holes.map(r => r.map(gpsToLocal)).sort((a, b) => average(b).z - average(a).z)[0]
  const edges = courtyard.slice(1).map((b, i) => ({ a: courtyard[i], b, length: Math.hypot(b.x - courtyard[i].x, b.z - courtyard[i].z) })).sort((a, b) => b.length - a.length)
  const edge = edges[0], along = { x: (edge.b.x - edge.a.x) / edge.length, z: (edge.b.z - edge.a.z) / edge.length }
  const across = { x: along.z, z: -along.x }
  let area = 0, centerX = 0, centerZ = 0
  for (let i = 1; i < courtyard.length; i++) {
    const a = courtyard[i - 1], b = courtyard[i], cross = a.x * b.z - b.x * a.z
    area += cross; centerX += (a.x + b.x) * cross; centerZ += (a.z + b.z) * cross
  }
  if (Math.abs(area) < .001) return null
  const center = { x: centerX / (3 * area), z: centerZ / (3 * area) }
  const length = 13.4, width = 6.1
  // Leave two metres of runoff. Fail closed if revised source geometry no
  // longer fits, rather than painting a court through rooms or a courtyard wall.
  for (let u = -width / 2 - 2; u <= width / 2 + 2; u += .5) for (let v = -length / 2 - 2; v <= length / 2 + 2; v += .5) {
    if (!pointInCampus({ x: center.x + across.x * u + along.x * v, z: center.z + across.z * u + along.z * v }, courtyard)) return null
  }
  return { center, along, across, courtyard, length, width, base: building.baseElevation ?? 0 }
}
