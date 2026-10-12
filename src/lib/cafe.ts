import { campusFacadeFront } from './campusFacade.ts'
import { facadePoint } from './administrationFacade.ts'
import type { FacadeWall } from './administrationFacade.ts'
import { gpsToLocal, localToGps } from './geo.ts'
import type { LocalCoordinate } from './geo.ts'
import { pointInCampus } from './roads.ts'
import { distanceToSegment, footprintRect, terrainHeightAt } from './terrain.ts'
import type { GroundRect, TerrainModel } from './terrain.ts'
import type { BuildingFootprint, RoadFootprint } from '../types/osm.ts'
import type { SocialSeat } from './social.ts'
import type { CafeCounter } from './cafeDrinks.ts'

export const CAFE_BUILDING_ID = 'way/1423803659'
// Positive Y rotation turns north toward west: anticlockwise from above.
export const CAFE_ROTATION = Math.PI / 2
export interface CafeFurniture extends LocalCoordinate { y: number; yaw: number }
export interface CafeLayout {
  buildingId: string; front: FacadeWall; terrace: FacadeWall; base: number
  width: number; depth: number; clearing: GroundRect
  tables: CafeFurniture[]; seats: SocialSeat[]; posts: CafeFurniture[]; planters: CafeFurniture[]
}
export const cafePoint = (cafe: Pick<CafeLayout, 'terrace'>, along: number, out: number) => facadePoint(cafe.terrace, along, out)

export function cafeCounters(cafe: CafeLayout, terrain: TerrainModel): CafeCounter[] {
  const w = Math.min(12.5, cafe.front.length - 1.1)
  return [
    ...[0, 4.3].map((along, i) => ({ face: cafe.terrace, along, id: `cafe-terrace-${i}` })),
    ...[-w * .32, 0, w * .32].map((along, i) => ({ face: cafe.front, along, id: `cafe-front-${i}` })),
  ].map(({ face, along, id }) => {
    const p = facadePoint(face, along, .65)
    return { id, ...p, y: terrainHeightAt(terrain, p.x, p.z), yaw: face.angle }
  })
}

const rotatePoint = (point: LocalCoordinate, pivot: LocalCoordinate, angle: number): LocalCoordinate => {
  const dx = point.x - pivot.x, dz = point.z - pivot.z, c = Math.cos(angle), s = Math.sin(angle)
  return { x: pivot.x + c * dx + s * dz, z: pivot.z - s * dx + c * dz }
}
const rotatedYaw = (yaw: number, angle: number) => Math.atan2(Math.sin(yaw + angle), Math.cos(yaw + angle))

export function rotateCafeBuilding(building: BuildingFootprint): BuildingFootprint {
  if (building.id !== CAFE_BUILDING_ID) return building
  const pivot = footprintRect(building)
  const ring = (points: BuildingFootprint['outer']) => points.map(point => localToGps(rotatePoint(gpsToLocal(point), pivot, CAFE_ROTATION)))
  return { ...building, outer: ring(building.outer), holes: building.holes.map(ring) }
}

// Rotate the whole assembly around the pavilion, including its frontage and
// physical seats. Terrain heights are sampled afterwards in the new positions.
export function rotateCafeLayout(cafe: CafeLayout, pivot: LocalCoordinate): CafeLayout {
  const wall = (face: FacadeWall): FacadeWall => ({ ...face, center: rotatePoint(face.center, pivot, CAFE_ROTATION),
    outward: rotatePoint(face.outward, { x: 0, z: 0 }, CAFE_ROTATION), angle: rotatedYaw(face.angle, CAFE_ROTATION) })
  const furniture = <T extends CafeFurniture>(part: T): T => ({ ...part, ...rotatePoint(part, pivot, CAFE_ROTATION), yaw: rotatedYaw(part.yaw, CAFE_ROTATION) })
  const clearing = { ...cafe.clearing, ...rotatePoint(cafe.clearing, pivot, CAFE_ROTATION), halfX: cafe.clearing.halfZ, halfZ: cafe.clearing.halfX }
  return { ...cafe, front: wall(cafe.front), terrace: wall(cafe.terrace), clearing,
    tables: cafe.tables.map(furniture), seats: cafe.seats.map(furniture), posts: cafe.posts.map(furniture), planters: cafe.planters.map(furniture) }
}

export function withCafeVendingWindow(cafe: CafeLayout, building: BuildingFootprint, roads: RoadFootprint[]): CafeLayout {
  // Owner-confirmed second vending window is on the long blank road-facing
  // wall beside the existing shaded tables. The other two walls stay plain.
  const face = campusFacadeFront(building, roads)?.front
  return face ? { ...cafe, front: face } : cafe
}

// Keep the road-facing entrance free. Pick an open exterior side, preferring
// the sports-ground side, without putting furniture on roads or other buildings.
export function createCafeLayout(buildings: BuildingFootprint[], roads: RoadFootprint[], boundary: LocalCoordinate[], toward?: LocalCoordinate): CafeLayout | null {
  const building = buildings.find(b => b.id === CAFE_BUILDING_ID)
  if (!building || boundary.length < 3) return null
  const entry = campusFacadeFront(building, roads)
  if (!entry) return null
  const others = buildings.filter(b => b !== building).map(b => b.outer.map(gpsToLocal))
  const edges = roads.flatMap(r => r.paths.flatMap(path => path.slice(1).map((b, i) => ({ a: path[i], b, width: r.width }))))
  for (const terrace of [...entry.exterior].sort((a, b) => {
    const target = toward ?? entry.entrance
    const pa = facadePoint(a, 0, 5), pb = facadePoint(b, 0, 5)
    return Math.hypot(pa.x - target.x, pa.z - target.z) - Math.hypot(pb.x - target.x, pb.z - target.z)
  })) {
    const width = Math.min(15, terrace.length - 1.2), depth = 10
    if (width < 12) continue
    const legal = (p: LocalCoordinate) => pointInCampus(p, boundary)
      && !edges.some(e => distanceToSegment(p, e.a, e.b) < e.width / 2 + .9)
      && !others.some(ring => pointInCampus(p, ring) || ring.slice(1).some((b, i) => distanceToSegment(p, ring[i], b) < 1))
    if (Array.from({ length: 7 }, (_, x) => Array.from({ length: 6 }, (_, z) => facadePoint(terrace, (x / 6 - .5) * width, .15 + z / 5 * depth))).flat().some(p => !legal(p))) continue
    const corners = [-1, 1].flatMap(side => [.15, depth].map(out => facadePoint(terrace, side * width / 2, out)))
    const clearing = { x: (Math.min(...corners.map(p => p.x)) + Math.max(...corners.map(p => p.x))) / 2,
      z: (Math.min(...corners.map(p => p.z)) + Math.max(...corners.map(p => p.z))) / 2,
      halfX: (Math.max(...corners.map(p => p.x)) - Math.min(...corners.map(p => p.x))) / 2 + .6,
      halfZ: (Math.max(...corners.map(p => p.z)) - Math.min(...corners.map(p => p.z))) / 2 + .6 }
    const tablePoints = [-width * .25, width * .25].flatMap(along => [3, 7.5].map(out => facadePoint(terrace, along, out)))
    const tables = tablePoints.map(p => ({ ...p, y: 0, yaw: terrace.angle }))
    const seats = tables.flatMap((table, row) => Array.from({ length: 4 }, (_, slot) => {
      const angle = terrace.angle + slot * Math.PI / 2, x = table.x + Math.sin(angle) * 1.35, z = table.z + Math.cos(angle) * 1.35
      return { id: `cafe-${row}-${slot}`, x, y: 0, z, yaw: Math.atan2(x - table.x, z - table.z), row, seatHeight: .44 }
    }))
    const parts = (values: number[][]) => values.map(([along, out]) => ({ ...facadePoint(terrace, along, out), y: 0, yaw: terrace.angle }))
    return { buildingId: building.id, front: { ...entry.front, center: entry.entrance }, terrace, width, depth, base: 0, clearing, tables, seats,
      posts: parts([-1, 1].flatMap(side => [1, depth - .4].map(out => [side * (width / 2 - .25), out]))),
      planters: parts([-1, 1].map(side => [side * (width / 2 - .7), depth - .7])) }
  }
  return null
}

export function elevateCafe(cafe: CafeLayout, terrain: TerrainModel, building: BuildingFootprint): CafeLayout {
  cafe.base = building.baseElevation ?? terrainHeightAt(terrain, footprintRect(building).x, footprintRect(building).z)
  for (const item of [...cafe.tables, ...cafe.seats, ...cafe.posts, ...cafe.planters]) item.y = terrainHeightAt(terrain, item.x, item.z) + .025
  return cafe
}

// Small, bounded collider lists use the same world positions as the meshes.
// Seat snapping is server controlled; ordinary walking/vehicles cannot pass
// through tables, chair backs, planters or pergola posts.
export function cafeBlocksWalking(p: LocalCoordinate, cafe: CafeLayout, radius: number): boolean {
  const c = cafe.clearing
  if (Math.abs(p.x - c.x) > c.halfX + radius || Math.abs(p.z - c.z) > c.halfZ + radius) return false
  return cafe.tables.some(t => Math.hypot(p.x - t.x, p.z - t.z) < .65 + radius)
    || cafe.seats.some(s => Math.hypot(p.x - s.x, p.z - s.z) < .30 + radius)
    || cafe.posts.some(t => Math.hypot(p.x - t.x, p.z - t.z) < .12 + radius)
    || cafe.planters.some(t => Math.hypot(p.x - t.x, p.z - t.z) < .48 + radius)
}
