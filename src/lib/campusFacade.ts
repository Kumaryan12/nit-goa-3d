import { ShapeUtils, Vector2 } from 'three'
import { buildingAppearances } from '../data/buildingAppearances.ts'
import type { BuildingAppearance } from '../data/buildingAppearances.ts'
import { facadePoint } from './administrationFacade.ts'
import type { FacadeWall } from './administrationFacade.ts'
import { gpsToLocal } from './geo.ts'
import type { LocalCoordinate } from './geo.ts'
import { distanceToSegment } from './terrain.ts'
import type { BuildingFootprint, RoadFootprint } from '../types/osm.ts'
import type { BuildingSelection } from '../types/campus.ts'
import type { HostelPlan } from './hostelInterior.ts'
import type { CameraView } from './camera.ts'

export interface FacadeBox { position: [number, number, number]; size: [number, number, number]; angle?: number }
export interface CampusFacadePlan {
  buildingId: string; name: string; appearance: BuildingAppearance; height: number
  walls: FacadeWall[]; front: FacadeWall; width: number; entrance: LocalCoordinate
  frames: FacadeBox[]; panes: FacadeBox[]; trim: FacadeBox[]
  roof: { vertices: number[]; indices: number[] }
  canopyWidth: number; canopyDepth: number; roadClearance: number | null
}
function ringWalls(points: LocalCoordinate[], courtyard = false): FacadeWall[] {
  const area = points.slice(1).reduce((sum, b, i) => sum + points[i].x * b.z - b.x * points[i].z, 0)
  return points.slice(1).flatMap((b, i) => {
    const a = points[i], dx = b.x - a.x, dz = b.z - a.z, length = Math.hypot(dx, dz)
    if (!Number.isFinite(length) || length < .5 || !Number.isFinite(area) || Math.abs(area) < 1) return []
    const sign = Math.sign(area) * (courtyard ? -1 : 1)
    const outward = { x: dz / length * sign, z: -dx / length * sign }
    return [{ center: { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 }, outward, length, angle: Math.atan2(outward.x, outward.z) }]
  })
}
// Walking arrivals and the rendered doorway must use the same exterior face.
export function campusFacadeFront(building: BuildingFootprint, roads: RoadFootprint[], doorway?: HostelPlan | null) {
  const exterior = ringWalls(building.outer.map(gpsToLocal))
  if (!exterior.length) return null
  const segments = roads.filter(road => road.kind === 'road').flatMap(road => road.paths.flatMap(path => path.slice(1).map((b, i) => ({ a: path[i], b, width: road.width }))))
  const roadDistance = (p: LocalCoordinate) => segments.length ? Math.min(...segments.map(s => distanceToSegment(p, s.a, s.b) - s.width / 2)) : Infinity
  const longest = Math.max(...exterior.map(w => w.length)), entry = doorway?.buildingId === building.id ? doorway.entrance.point : null
  const candidates = exterior.filter(w => w.length >= (entry ? 8 : Math.max(8, longest * .45)))
  if (!candidates.length) return null
  const endpoints = (w: FacadeWall) => [facadePoint(w, -w.length / 2, 0), facadePoint(w, w.length / 2, 0)]
  const score = (w: FacadeWall) => entry ? distanceToSegment(entry, ...endpoints(w) as [LocalCoordinate, LocalCoordinate]) : roadDistance(facadePoint(w, 0, 1))
  candidates.sort((a, b) => score(a) - score(b) || b.length - a.length || a.center.x - b.center.x || a.center.z - b.center.z)
  const front = candidates[0], entrance = entry && score(front) < .2 ? entry : front.center
  return { front, entrance, exterior, segments, roadDistance }
}
export function createCampusFacade(building: BuildingFootprint, selection: BuildingSelection, roads: RoadFootprint[], doorway?: HostelPlan | null): CampusFacadePlan | null {
  const appearance = buildingAppearances[selection.location.id]
  if (!appearance || !Number.isFinite(building.height) || building.height < 2) return null
  const entry = campusFacadeFront(building, roads, doorway)
  if (!entry) return null
  const { front, entrance, exterior, segments, roadDistance } = entry
  const outer = building.outer.map(gpsToLocal), holes = building.holes.map(ring => ring.map(gpsToLocal))
  const walls = [...exterior, ...holes.flatMap(ring => ringWalls(ring, true))]
  const entryAlong = (entrance.x - front.center.x) * Math.cos(front.angle) - (entrance.z - front.center.z) * Math.sin(front.angle)
  const availableWidth = Math.max(0, front.length - 2 * Math.abs(entryAlong) - 1)
  const canopyWidth = Math.min(availableWidth, appearance.style === 'tutorial' ? 15 : appearance.style === 'department' ? 18 : 9)
  const roadClearance = segments.length ? Math.min(...Array.from({ length: 25 }, (_, i) => roadDistance(facadePoint({ ...front, center: entrance }, (i / 24 - .5) * (canopyWidth + .8), 0)))) : null
  const canopyDepth = Math.max(0, Math.min(appearance.style === 'tutorial' ? 5.5 : 3.6, (roadClearance ?? 6) - .5))
  const height = building.height, floors = Math.min(appearance.floors, Math.max(1, Math.floor(height / 2.5)))
  const frames: FacadeBox[] = [], panes: FacadeBox[] = [], trim: FacadeBox[] = []
  const frontWall = { ...front, center: entrance }
  for (const wall of walls) {
    const count = Math.max(1, Math.floor(wall.length / (appearance.style === 'hostel' ? 3.7 : 4))), spacing = wall.length / count
    const box = (u: number, y: number, out: number, size: FacadeBox['size']): FacadeBox => {
      const p = facadePoint(wall, u, out); return { position: [p.x, y, p.z], size, angle: wall.angle }
    }
    for (let floor = 0; floor < floors; floor++) for (let i = 0; i < count; i++) {
      const u = (i + .5) * spacing - wall.length / 2, p = facadePoint(wall, u, 0)
      // Leave the existing walk-through door free of exterior decoration.
      if (floor === 0 && Math.hypot(p.x - entrance.x, p.z - entrance.z) < 3) continue
      if (wall === front && (appearance.style === 'hostel' || appearance.style === 'department') && Math.abs(u - entryAlong) < 2.6) continue
      if (wall === front && appearance.style === 'tutorial' && [-1, 1].some(side => Math.abs(u - side * front.length * .42) < 2.4)) continue
      if (wall === front && appearance.style === 'bank' && [-1, 1].some(side => Math.abs(u - side * front.length * .28) < front.length * .12 + .7)) continue
      if (wall === front && appearance.style === 'seminar' && [-.39, -.26, .26, .39].some(t => Math.abs(u - t * front.length) < 2.2)) continue
      const h = Math.min(1.8, height / floors * .55), w = Math.min(1.85, spacing - .7), y = (floor + .55) * height / floors
      frames.push(box(u, y, .10, [w + .28, h + .28, .18]), box(u, y, .26, [.07, h, .08]), box(u, y + h / 2 + .2, .3, [w + .5, .16, .55]))
      panes.push(box(u, y, .22, [w, h, .07]))
    }
    for (let floor = 0; floor <= floors; floor++) trim.push(box(0, floor === floors ? height - .06 : floor * height / floors + .14, .10, [wall.length, .17, .25]))
    for (let i = 0; i <= count; i += 2) trim.push(box((i / count - .5) * (wall.length - .3), height / 2, .08, [.18, height, .20]))
  }
  // Triangulate the real courtyard polygon, then subdivide its roof triangles.
  // A continuous distance-to-eave field produces hipped slopes without strips,
  // overlapping panels, bounding-box infill, or roofs across courtyard holes.
  const roof = createCourtyardRoof(outer, holes, height)

  return { buildingId: building.id, name: selection.location.name, appearance, height, walls, front: frontWall, width: front.length, entrance, frames, panes, trim, roof, canopyWidth, canopyDepth, roadClearance }
}

export function createCourtyardRoof(outer: LocalCoordinate[], holes: LocalCoordinate[][], height: number) {
  const rings = [outer, ...holes].map(ring => ring.slice(0, -1))
  const points = rings.flat(), vectors = rings.map(ring => ring.map(p => new Vector2(p.x, p.z)))
  const triangles = ShapeUtils.triangulateShape(vectors[0], vectors.slice(1))
  const edges = [outer, ...holes].flatMap(ring => ring.slice(1).map((b, i) => ({ a: ring[i], b })))
  const roof = { vertices: [] as number[], indices: [] as number[] }
  const emit = (a: LocalCoordinate, b: LocalCoordinate, c: LocalCoordinate, level: number) => {
    const pairs = [[a, b, c], [b, c, a], [c, a, b]]
    pairs.sort((p, q) => Math.hypot(q[0].x - q[1].x, q[0].z - q[1].z) - Math.hypot(p[0].x - p[1].x, p[0].z - p[1].z))
    const [u, v, w] = pairs[0]
    if (level < 12 && Math.hypot(u.x - v.x, u.z - v.z) > 3.5) {
      const middle = { x: (u.x + v.x) / 2, z: (u.z + v.z) / 2 }
      emit(u, middle, w, level + 1); emit(middle, v, w, level + 1); return
    }
    const index = roof.vertices.length / 3
    for (const p of [a, b, c]) {
      const distance = Math.min(...edges.map(edge => distanceToSegment(p, edge.a, edge.b)))
      roof.vertices.push(p.x, height + .38 + Math.min(1.8, distance * .34), p.z)
    }
    roof.indices.push(index, index + 1, index + 2)
  }
  triangles.forEach(([a, b, c]) => emit(points[a], points[b], points[c], 0))
  return roof
}

export function campusFacadeCamera(plan: CampusFacadePlan, baseElevation = 0): CameraView {
  const { x, z } = plan.entrance, y = baseElevation + plan.height * .45
  const distance = Math.max(65, plan.width * 1.45)
  const along = { x: Math.cos(plan.front.angle), z: -Math.sin(plan.front.angle) }
  return {
    position: [x + plan.front.outward.x * distance + along.x * distance * .22, y + distance * .42, z + plan.front.outward.z * distance + along.z * distance * .22],
    target: [x, y, z],
  }
}
