import { BufferGeometry, Float32BufferAttribute } from 'three'
import type { CampusLocation } from '../types/campus.ts'
import type { LocalCoordinate } from './geo.ts'
import type { GroundRect } from './terrain.ts'
import type { RoadFootprint } from '../types/osm.ts'

export const THEATRE_INNER_RADIUS = 4.6
export const THEATRE_ROWS = 6
export const THEATRE_TREAD = .9
export const THEATRE_RISE = .3
export const THEATRE_OUTER_RADIUS = THEATRE_INNER_RADIUS + THEATRE_ROWS * THEATRE_TREAD
export const THEATRE_AISLE_HALF_WIDTH = 1.2
// Fit the owner-marked 69 × 39 m plaza with the stage facing along its long axis.
export const THEATRE_WIDTH_SCALE = 39 / 23
export const THEATRE_DEPTH_SCALE = 69 / 19.5
export interface TheatreLayout {
  center: LocalCoordinate
  rotation: number
  depthScale: number
  widthScale: number
  elevation: number
  clearing: GroundRect
  entrance: LocalCoordinate
  access: LocalCoordinate[]
}

export function theatreToWorld(point: LocalCoordinate, theatre: Pick<TheatreLayout, 'center' | 'rotation'> & { depthScale?: number; widthScale?: number }): LocalCoordinate {
  const c = Math.cos(theatre.rotation), s = Math.sin(theatre.rotation)
  const x = point.x * (theatre.widthScale ?? 1), z = point.z * (theatre.depthScale ?? 1)
  return { x: theatre.center.x + c * x + s * z, z: theatre.center.z - s * x + c * z }
}
export function theatreToLocal(point: LocalCoordinate, theatre: Pick<TheatreLayout, 'center' | 'rotation'> & { depthScale?: number; widthScale?: number }): LocalCoordinate {
  const c = Math.cos(theatre.rotation), s = Math.sin(theatre.rotation), x = point.x - theatre.center.x, z = point.z - theatre.center.z
  return { x: (c * x - s * z) / (theatre.widthScale ?? 1), z: (s * x + c * z) / (theatre.depthScale ?? 1) }
}

export function createTheatreLayout(location: CampusLocation, roads: RoadFootprint[] = []): TheatreLayout {
  const rotation = (location.rotationDegrees ?? 0) * Math.PI / 180
  const frame = { center: { ...location.coordinates }, rotation, widthScale: THEATRE_WIDTH_SCALE, depthScale: THEATRE_DEPTH_SCALE }
  // The stage faces the seating bowl; the entrance is behind the central aisle.
  const entrance = theatreToWorld({ x: 0, z: THEATRE_OUTER_RADIUS + 4.5 }, frame)
  let closest = entrance, best = Infinity
  for (const road of roads) for (const path of road.paths) for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i], dx = b.x - a.x, dz = b.z - a.z
    const t = Math.max(0, Math.min(1, ((entrance.x - a.x) * dx + (entrance.z - a.z) * dz) / (dx * dx + dz * dz || 1)))
    const point = { x: a.x + dx * t, z: a.z + dz * t }, distance = Math.hypot(point.x - entrance.x, point.z - entrance.z)
    if (distance < best) { best = distance; closest = point }
  }
  const middle = theatreToWorld({ x: 0, z: 4.75 }, frame), c = Math.abs(Math.cos(rotation)), s = Math.abs(Math.sin(rotation))
  return { ...frame, elevation: location.elevation ?? 0, entrance, access: best < 60 ? [entrance, closest] : [],
    clearing: { ...middle, halfX: 11.5 * frame.widthScale * c + 9.75 * frame.depthScale * s, halfZ: 11.5 * frame.widthScale * s + 9.75 * frame.depthScale * c } }
}

export function theatreSurfaceHeightAt(point: LocalCoordinate, theatre: TheatreLayout): number | null {
  const p = theatreToLocal(point, theatre), radius = Math.hypot(p.x, p.z)
  if (Math.abs(p.x) > 11.5 || p.z < -5 || p.z > 14.5) return null
  let height = .08
  if (Math.abs(p.x) <= 4.8 && p.z >= -4 && p.z <= 0) height += .45
  else if (Math.abs(p.x) <= 1.1 && p.z > 0 && p.z < 3) height += .45 * (1 - p.z / 3)
  else if (Math.abs(p.x) < THEATRE_AISLE_HALF_WIDTH && p.z > THEATRE_OUTER_RADIUS && p.z < THEATRE_OUTER_RADIUS + 3.6) {
    height += Math.ceil((THEATRE_OUTER_RADIUS + 3.6 - p.z) / .3 - 1e-9) * THEATRE_RISE / 2
  } else if (Math.abs(p.x) < THEATRE_AISLE_HALF_WIDTH && p.z >= THEATRE_INNER_RADIUS && p.z <= THEATRE_OUTER_RADIUS) {
    const step = Math.min(THEATRE_ROWS * 2 - 1, Math.floor((p.z - THEATRE_INNER_RADIUS) / (THEATRE_TREAD / 2)))
    height += (step + 1) * THEATRE_RISE / 2
  } else if (p.z >= 0 && radius >= THEATRE_INNER_RADIUS && radius <= THEATRE_OUTER_RADIUS) {
    const row = Math.min(THEATRE_ROWS - 1, Math.floor((radius - THEATRE_INNER_RADIUS) / THEATRE_TREAD))
    if (Math.abs(p.x) >= THEATRE_AISLE_HALF_WIDTH) height += (row + 1) * THEATRE_RISE
  }
  return theatre.elevation + height
}

export function theatreBlocksWalking(point: LocalCoordinate, theatre: TheatreLayout, clearance: number): boolean {
  const p = theatreToLocal(point, theatre), radius = Math.hypot(p.x, p.z)
  if (p.z < .9 - clearance || Math.abs(p.x) < THEATRE_AISLE_HALF_WIDTH - clearance) return false
  if (radius < THEATRE_INNER_RADIUS - clearance || radius > THEATRE_OUTER_RADIUS + clearance) return false
  for (let row = 0; row < THEATRE_ROWS; row++) {
    const inner = THEATRE_INNER_RADIUS + row * THEATRE_TREAD
    if (radius >= inner + .45 - clearance && radius <= inner + THEATRE_TREAD + clearance) return true
  }
  return false
}

// Solid annular sectors, with top, risers and end caps. The curved benches are
// divided around a real central aisle rather than laying a solid ring over it.
export function createTheatreSectorGeometry(inner: number, outer: number, height: number, start = 0, end = Math.PI): BufferGeometry {
  const positions: number[] = [], indices: number[] = []
  const segments = Math.max(2, Math.ceil((end - start) / Math.PI * 64))
  for (let i = 0; i <= segments; i++) {
    const angle = start + (end - start) * i / segments
    for (const [radius, y] of [[inner, 0], [outer, 0], [inner, height], [outer, height]]) positions.push(Math.cos(angle) * radius, y, Math.sin(angle) * radius)
    if (i === segments) continue
    const a = i * 4, b = a + 4
    indices.push(a+2,b+2,a+3,a+3,b+2,b+3, a,a+2,b,a+2,b+2,b, a+1,b+1,a+3,a+3,b+1,b+3)
  }
  const last = segments * 4
  indices.push(0,1,2,2,1,3, last,last+2,last+1,last+2,last+3,last+1)
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3)); geometry.setIndex(indices)
  geometry.computeVertexNormals(); geometry.computeBoundingSphere()
  return geometry
}
