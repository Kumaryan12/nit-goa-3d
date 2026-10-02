import type { LocalCoordinate } from './geo.ts'
import type { GroundRect } from './terrain.ts'

export interface TerrainSlope {
  lower: GroundRect
  upper: GroundRect
  rise: number
}

// User-described relative relief, not surveyed or OpenStreetMap elevation data.
// Flat terraces extend past both footprints; smoothstep joins them without a cliff.
export function slopeElevationAt(point: LocalCoordinate, slope?: TerrainSlope): number {
  if (!slope) return 0
  const dx = slope.upper.x - slope.lower.x, dz = slope.upper.z - slope.lower.z
  const distance = Math.hypot(dx, dz)
  if (distance < 1 || !Number.isFinite(slope.rise) || slope.rise < 0) return 0
  const ux = dx / distance, uz = dz / distance
  const lowerEdge = slope.lower.halfX * Math.abs(ux) + slope.lower.halfZ * Math.abs(uz) + 6
  const upperEdge = distance - slope.upper.halfX * Math.abs(ux) - slope.upper.halfZ * Math.abs(uz) - 6
  const projection = (point.x - slope.lower.x) * ux + (point.z - slope.lower.z) * uz
  const t = Math.max(0, Math.min(1, (projection - Math.min(lowerEdge, distance * 0.45)) / Math.max(12, upperEdge - Math.min(lowerEdge, distance * 0.45))))
  return slope.rise * t * t * (3 - 2 * t)
}
