import { gpsToLocal } from './geo.ts'
import type { LocalCoordinate as Point } from './geo.ts'
import type { BuildingFootprint } from '../types/osm.ts'
import type { HostelPlan } from './hostelInterior.ts'

export const SEMINAR_ID = 'way/1423803680'
export function seminarCenter(building: BuildingFootprint): Point {
  const ring = building.outer.map(gpsToLocal)
  return { x: (Math.min(...ring.map(p => p.x)) + Math.max(...ring.map(p => p.x))) / 2, z: (Math.min(...ring.map(p => p.z)) + Math.max(...ring.map(p => p.z))) / 2 }
}
export const turnSeminarPoint = <T extends Point>(p: T, c: Point): T => ({ ...p, x: 2 * c.x - p.x, z: 2 * c.z - p.z })
export function halfTurnSeminarBuilding(building: BuildingFootprint): BuildingFootprint {
  const lat = Math.min(...building.outer.map(p => p.lat)) + Math.max(...building.outer.map(p => p.lat))
  const lon = Math.min(...building.outer.map(p => p.lon)) + Math.max(...building.outer.map(p => p.lon))
  const ring = (points: BuildingFootprint['outer']) => points.map(p => ({ lat: lat - p.lat, lon: lon - p.lon }))
  return { ...building, outer: ring(building.outer), holes: building.holes.map(ring) }
}
// Owner correction: the courtyard opens east toward Gyan Mandir. Checking the
// narrow closed end makes this safe to reapply to an already corrected model.
export function orientSeminarBuilding(building: BuildingFootprint): BuildingFootprint {
  if (building.id !== SEMINAR_ID) return building
  const xs = [...new Set(building.outer.map(p => p.lon))].sort((a, b) => a - b)
  return xs.length === 3 && xs[1] - xs[0] > xs[2] - xs[1] ? halfTurnSeminarBuilding(building) : building
}
export function halfTurnSeminarPlan(local: HostelPlan, building: BuildingFootprint): HostelPlan {
  const c = seminarCenter(building), point = <T extends Point>(p: T) => turnSeminarPoint(p, c)
  const vector = (p: Point) => ({ x: -p.x, z: -p.z })
  const rect = <T extends { minX: number; maxX: number; minZ: number; maxZ: number }>(r: T): T => ({ ...r, minX: 2*c.x-r.maxX, maxX: 2*c.x-r.minX, minZ: 2*c.z-r.maxZ, maxZ: 2*c.z-r.minZ })
  const l = local.seminar!
  return {
    ...local, building, seminarFrame: { center: c, local },
    outer: local.outer.map(point), holes: local.holes.map(r => r.map(point)),
    walls: local.walls.map(w => ({ ...w, a: point(w.a), b: point(w.b) })),
    obstacles: local.obstacles?.map(o => ({ ...o, center: point(o.center), along: vector(o.along), inward: vector(o.inward) })),
    entrance: { point: point(local.entrance.point), inside: point(local.entrance.inside), outside: point(local.entrance.outside), inward: vector(local.entrance.inward), along: vector(local.entrance.along) },
    stairs: { ...local.stairs, start: point(local.stairs.start), end: point(local.stairs.end), along: vector(local.stairs.along), across: vector(local.stairs.across), hole: local.stairs.hole.map(point) },
    seminar: {
      courtyard: rect(l.courtyard), halls: l.halls.map(h => ({ ...rect(h), doors: h.doors.map(point), rearDoor: point(h.rearDoor), stage: point(h.stage), seats: h.seats.map(point) })),
      planters: l.planters.map(point), stairs: { ...rect(l.stairs), flights: l.stairs.flights.map(f => ({ ...rect(f), direction: -f.direction as 1 | -1 })) },
      landing: rect(l.landing), landings: l.landings.map(rect), landingRails: l.landingRails.map(r => ({ a: point(r.a), b: point(r.b) })),
      rake: { ...l.rake, rearX: 2*c.x-l.rake.rearX, frontX: 2*c.x-l.rake.frontX },
    },
  }
}
