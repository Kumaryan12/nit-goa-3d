import type { LocalCoordinate } from './geo.ts'
import type { GroundRect } from './terrain.ts'
import type { CampusSlope } from '../data/topography.ts'

export interface TerrainSlope {
  lower: GroundRect
  upper: GroundRect
  rise: number
  gateApproach?: { lower: LocalCoordinate; upper: LocalCoordinate; drop: number; width: number; stages?: 1 | 2 }
  girlsTerrace?: { rect: GroundRect; drop: number; transition: number }
  facultyApproach?: { lower: LocalCoordinate; upper: LocalCoordinate; width: number }
}

const smooth = (value: number) => { const t = Math.max(0, Math.min(1, value)); return t * t * (3 - 2 * t) }
const rectDistance = (point: LocalCoordinate, rect: GroundRect) => Math.hypot(Math.max(0, Math.abs(point.x - rect.x) - rect.halfX), Math.max(0, Math.abs(point.z - rect.z) - rect.halfZ))

// User-described relative relief, not surveyed or OpenStreetMap elevation data.
// Flat terraces extend past both footprints; smoothstep joins them without a cliff.
function baseSlopeElevationAt(point: LocalCoordinate, slope?: TerrainSlope): number {
  if (!slope) return 0
  const dx = slope.upper.x - slope.lower.x, dz = slope.upper.z - slope.lower.z
  const distance = Math.hypot(dx, dz)
  if (distance < 1 || !Number.isFinite(slope.rise) || slope.rise < 0) return 0
  const ux = dx / distance, uz = dz / distance
  const lowerEdge = slope.lower.halfX * Math.abs(ux) + slope.lower.halfZ * Math.abs(uz) + 6
  const upperEdge = distance - slope.upper.halfX * Math.abs(ux) - slope.upper.halfZ * Math.abs(uz) - 6
  const projection = (point.x - slope.lower.x) * ux + (point.z - slope.lower.z) * uz
  const t = Math.max(0, Math.min(1, (projection - Math.min(lowerEdge, distance * 0.45)) / Math.max(12, upperEdge - Math.min(lowerEdge, distance * 0.45))))
  let height = slope.rise * t * t * (3 - 2 * t)
  const gate = slope.gateApproach
  if (gate) {
    const ax = gate.upper.x - gate.lower.x, az = gate.upper.z - gate.lower.z, lengthSquared = ax * ax + az * az
    const along = lengthSquared > 1 ? Math.max(0, Math.min(1, ((point.x - gate.lower.x) * ax + (point.z - gate.lower.z) * az) / lengthSquared)) : 1
    const lateral = Math.hypot(point.x - gate.lower.x - ax * along, point.z - gate.lower.z - az * along)
    // Two rises separated by a short level stretch, as described by the owner.
    const progress = gate.stages === 2 ? 0.5 * smooth((along - 0.08) / 0.32) + 0.5 * smooth((along - 0.58) / 0.32) : smooth(along)
    height -= gate.drop * (1 - progress) * (1 - smooth(lateral / gate.width))
  }
  const girls = slope.girlsTerrace
  if (girls) {
    const local = 1 - smooth(rectDistance(point, girls.rect) / girls.transition)
    const faculty = slope.facultyApproach
    let corridor = 0
    if (faculty) {
      const dx = faculty.upper.x - faculty.lower.x, dz = faculty.upper.z - faculty.lower.z, length = Math.hypot(dx, dz)
      const along = ((point.x - faculty.lower.x) * dx + (point.z - faculty.lower.z) * dz) / (length * length)
      const lateral = Math.abs((point.x - faculty.lower.x) * dz - (point.z - faculty.lower.z) * dx) / length
      // A steady climb along the northern road; keep surrounding terraces local.
      const side = 1 - smooth((lateral - faculty.width * 0.75) / (faculty.width * 0.25))
      const start = smooth((along * length + 28) / 28)
      corridor = (1 - Math.max(0, Math.min(1, along))) * side * start
    }
    height -= girls.drop * Math.max(local, corridor)
  }
  return height
}

export interface SlopePatch {
  lower: LocalCoordinate
  upper: LocalCoordinate
  length: number
  ux: number
  uz: number
  width: number
  correction: number
}

function patchWeight(point: LocalCoordinate, patch: SlopePatch): number {
  const dx = point.x - patch.lower.x, dz = point.z - patch.lower.z
  const along = dx * patch.ux + dz * patch.uz, lateral = Math.abs(dx * patch.uz - dz * patch.ux)
  const core = patch.width / 4
  const side = 1 - smooth((lateral - core) / core)
  // Carry the upper bench beyond the marker before easing back into the
  // surrounding grade. A width-sized end cap made a road rise then immediately
  // dip, and squeezed the next building's terrace against the crest.
  const end = 1 - smooth((along - patch.length - patch.width / 2) / Math.max(patch.length, patch.width * 2))
  return smooth(along / patch.length) * side * end
}

export function applySlopePatches(point: LocalCoordinate, height: number, patches: SlopePatch[] = []): number {
  for (const patch of patches) height += patch.correction * patchWeight(point, patch)
  return height
}

export function resolveSlopePatches(slopes: CampusSlope[], base?: TerrainSlope): SlopePatch[] {
  const patches: SlopePatch[] = []
  for (const slope of slopes) {
    const dx = slope.upper.x - slope.lower.x, dz = slope.upper.z - slope.lower.z, length = Math.hypot(dx, dz)
    const lower = slopeElevationAt(slope.lower, base, patches), upper = slopeElevationAt(slope.upper, base, patches)
    patches.push({ lower: slope.lower, upper: slope.upper, length, ux: dx / length, uz: dz / length, width: slope.widthMeters, correction: lower + slope.riseMeters - upper })
  }
  return patches
}

export function slopeElevationAt(point: LocalCoordinate, slope?: TerrainSlope, patches: SlopePatch[] = []): number {
  return applySlopePatches(point, baseSlopeElevationAt(point, slope), patches)
}

// Close service blocks share the hostel's bench. Otherwise different foundation
// heights across a few meters could create cracks below adjacent footprints.
export function terraceElevationAt(rect: GroundRect, slope?: TerrainSlope, patches: SlopePatch[] = []): number {
  // Preserve the confirmed Nescafe terrace as the adjacent road climbs past it.
  if (slope && rect.x === slope.upper.x && rect.z === slope.upper.z) return applySlopePatches(rect, slope.rise, patches)
  const girls = slope?.girlsTerrace
  if (girls && Math.hypot(Math.max(0, Math.abs(rect.x - girls.rect.x) - rect.halfX - girls.rect.halfX), Math.max(0, Math.abs(rect.z - girls.rect.z) - rect.halfZ - girls.rect.halfZ)) < 10) return applySlopePatches(girls.rect, slope!.rise - girls.drop, patches)
  return slopeElevationAt(rect, slope, patches)
}
