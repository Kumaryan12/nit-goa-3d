import { gpsToLocal } from './geo.ts'
import type { LocalCoordinate } from './geo.ts'
import type { BuildingFootprint, RoadFootprint } from '../types/osm.ts'
import { distanceToSegment } from './terrain.ts'

export const instituteSign = 'NATIONAL INSTITUTE OF TECHNOLOGY GOA'
export const instituteHindiSign = 'राष्ट्रीय प्रौद्योगिकी संस्थान गोवा'
export interface FacadeWall {
  center: LocalCoordinate
  outward: LocalCoordinate
  length: number
  angle: number
}
export interface AdministrationFacadePlan {
  buildingId: string
  height: number
  walls: FacadeWall[]
  front: FacadeWall
  width: number
  depth: number
  pitchedRoof: boolean
  porticoWidth: number
  porticoDepth: number
  porchScale: number
  roadClearance: number | null
  floors: number
}
// Dress the corrected footprint; do not replace or move its mapped geometry.
// The longer exterior face looking toward the main gate is the public front.
export function createAdministrationFacade(building: BuildingFootprint, approach: LocalCoordinate, roads: RoadFootprint[] = []): AdministrationFacadePlan | null {
  const points = building.outer.map(gpsToLocal)
  const area = points.slice(1).reduce((sum, b, i) => sum + points[i].x * b.z - b.x * points[i].z, 0)
  if (!Number.isFinite(area) || Math.abs(area) < 1 || !Number.isFinite(building.height) || building.height < 6) return null
  const walls = points.slice(1).flatMap((b, i) => {
    const a = points[i], dx = b.x - a.x, dz = b.z - a.z, length = Math.hypot(dx, dz)
    if (length < .5) return []
    const outward = { x: dz / length * Math.sign(area), z: -dx / length * Math.sign(area) }
    return [{ center: { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 }, outward, length, angle: Math.atan2(outward.x, outward.z), a, b }]
  })
  if (!walls.length) return null
  const longest = Math.max(...walls.map(wall => wall.length))
  const candidates = walls.filter(wall => wall.length >= Math.max(8, longest * .65))
  candidates.sort((a, b) => distanceToSegment(approach, a.a, a.b) - distanceToSegment(approach, b.a, b.b) || a.center.x - b.center.x || a.center.z - b.center.z)
  const front = candidates[0]
  if (!front) return null
  const cos = Math.cos(front.angle), sin = Math.sin(front.angle)
  const local = points.map(point => ({ x: (point.x - front.center.x) * cos - (point.z - front.center.z) * sin, z: (point.x - front.center.x) * sin + (point.z - front.center.z) * cos }))
  const width = front.length, depth = Math.max(...local.map(p => p.z)) - Math.min(...local.map(p => p.z))
  const boundsWidth = Math.max(...local.map(p => p.x)) - Math.min(...local.map(p => p.x))
  const porticoWidth = Math.min(width - 1, width * .74)
  const segments = roads.flatMap(road => road.paths.flatMap(path => path.slice(1).map((b, i) => ({ a: path[i], b, width: road.width }))))
  // Leave the full road width open, including the entrance steps' outer edge.
  const roadClearance = segments.length ? Math.min(...Array.from({ length: 21 }, (_, i) => {
    const point = facadePoint(front, (i / 20 - .5) * (porticoWidth + .6), 0)
    return Math.min(...segments.map(segment => distanceToSegment(point, segment.a, segment.b) - segment.width / 2))
  })) : null
  const porchScale = roadClearance === null ? 1 : Math.max(0, Math.min(1, (roadClearance - .35) / 6.45))
  return {
    buildingId: building.id, height: building.height, front, walls, width, depth,
    // Courtyard and irregular roofs retain their original OSM silhouette.
    pitchedRoof: points.length === 5 && building.holes.length === 0 && Math.abs(area) / 2 / (boundsWidth * depth) > .96,
    porticoWidth, porticoDepth: 3.3, porchScale, roadClearance,
    floors: Math.min(3, Math.max(1, Math.floor(building.height / 3))),
  }
}
export function facadePoint(wall: FacadeWall, along: number, out: number): LocalCoordinate {
  return { x: wall.center.x + Math.cos(wall.angle) * along + wall.outward.x * out, z: wall.center.z - Math.sin(wall.angle) * along + wall.outward.z * out }
}
