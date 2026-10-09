import { gpsToLocal } from './geo.ts'
import type { LocalCoordinate } from './geo.ts'
import { pointInCampus } from './roads.ts'
import { distanceToSegment, terrainHeightAt } from './terrain.ts'
import type { TerrainModel } from './terrain.ts'
import type { BuildingFootprint } from '../types/osm.ts'
import type { CampusLocation } from '../types/campus.ts'
import type { HostelAction } from './hostelInterior.ts'
import { canalBlocksWalking } from './canal.ts'
import { theatreBlocksWalking, theatreSurfaceHeightAt } from './theatre.ts'
import { treeTrunkRadius } from './vegetation.ts'
import type { TreeInstance } from './vegetation.ts'
import { LAMP_POLE_RADIUS } from './nightLighting.ts'
import type { CampusLamp } from './nightLighting.ts'
import { AVATAR_HEIGHT } from './avatarJump.ts'
import { flagBlocksWalking, flagBlocksCamera } from './campusFlag.ts'
import { entranceBlocksWalking, entranceBlocksCamera } from './mainEntrance.ts'
import { inEntranceExterior } from './entranceExterior.ts'
import { savedCampusOverrides } from '../data/campusOverrides.ts'

import type { TransportMode } from './vehicles.ts'

export type ExplorerView = 'overview' | 'walk'
export interface WalkInput { forward: number; side: number; turn: number; running: boolean; jump?: boolean; brake?: boolean; vehicle?: TransportMode; action?: HostelAction }
export interface WalkStatus { position: LocalCoordinate; nearestId: string | null; distance: number; moving: boolean; blocked: boolean; error?: string; vehicle?: TransportMode; speed?: number; rideMessage?: string; canRide?: boolean; canJump?: boolean; canEnterHostel?: boolean; canEnterGyan?: boolean; interior?: { kind?: 'classroom'; name?: string; levels?: number; floor: number; room: string | null; canGoUp: boolean; canGoDown: boolean; stairLowFloor: number | null } }
export interface WalkSpawnRequest { sequence: number; locationId: string; enterHostel?: boolean; enterGyan?: boolean; football?: boolean }
interface Collider { id: string; outer: LocalCoordinate[]; holes: LocalCoordinate[][]; minX: number; maxX: number; minZ: number; maxZ: number; base: number; height: number }
export interface WalkWorld { boundary: LocalCoordinate[]; buildings: Collider[]; terrain: TerrainModel; trees: Map<string, TreeInstance[]>; lamps?: CampusLamp[] }
export const AVATAR_RADIUS = 0.42
export const emptyWalkInput = (): WalkInput => ({ forward: 0, side: 0, turn: 0, running: false })
export function explorerViewFromURL(url: string): ExplorerView { return new URL(url, 'https://campus.example').searchParams.get('view') === 'walk' ? 'walk' : 'overview' }
export function withExplorerView(url: string, view: ExplorerView): string {
  const result = new URL(url, 'https://campus.example')
  if (view === 'walk') result.searchParams.set('view', 'walk'); else result.searchParams.delete('view')
  return `${result.pathname}${result.search}${result.hash}`
}
export function createWalkWorld(buildings: BuildingFootprint[], boundary: LocalCoordinate[], terrain: TerrainModel, vegetation: TreeInstance[] = [], lamps: CampusLamp[] = []): WalkWorld {
  const trees = new Map<string, TreeInstance[]>()
  for (const tree of vegetation) {
    const key = `${Math.floor(tree.x / 8)},${Math.floor(tree.z / 8)}`
    if (!trees.has(key)) trees.set(key, [])
    trees.get(key)!.push(tree)
  }
  return { boundary, terrain, trees, lamps, buildings: buildings.map(building => {
    const outer = building.outer.map(gpsToLocal), holes = building.holes.map(hole => hole.map(gpsToLocal))
    return { id: building.id, outer, holes, minX: Math.min(...outer.map(p => p.x)), maxX: Math.max(...outer.map(p => p.x)), minZ: Math.min(...outer.map(p => p.z)), maxZ: Math.max(...outer.map(p => p.z)), base: building.baseElevation ?? 0, height: building.height }
  }) }
}
function nearbyTrees(point: LocalCoordinate, world: WalkWorld): TreeInstance[] {
  const result: TreeInstance[] = [], bx = Math.floor(point.x / 8), bz = Math.floor(point.z / 8)
  for (let x = -1; x <= 1; x++) for (let z = -1; z <= 1; z++) result.push(...(world.trees.get(`${bx + x},${bz + z}`) ?? []))
  return result
}
// Conservative ellipsoid underside prevents heads entering low broadleaf
// crowns, while allowing walking beneath branches with adequate clearance.
export function treeCeilingAt(point: LocalCoordinate, world: WalkWorld, radius = AVATAR_RADIUS): number {
  let ceiling = Infinity
  for (const tree of nearbyTrees(point, world)) {
    if (tree.palm) continue
    const distance = Math.max(0, Math.hypot(point.x - tree.x, point.z - tree.z) - radius), spread = 2.7 * tree.scale
    if (distance < spread) ceiling = Math.min(ceiling, tree.y + 6 * tree.scale - 3.1 * tree.scale * Math.sqrt(1 - (distance / spread) ** 2))
  }
  return ceiling
}
const ringDistance = (point: LocalCoordinate, ring: LocalCoordinate[]) => ring.reduce((distance, a, i) => Math.min(distance, distanceToSegment(point, a, ring[(i + 1) % ring.length])), Infinity)
function hitsBuilding(point: LocalCoordinate, building: Collider, radius: number): boolean {
  if (point.x < building.minX - radius || point.x > building.maxX + radius || point.z < building.minZ - radius || point.z > building.maxZ + radius) return false
  if (pointInCampus(point, building.outer) && !building.holes.some(hole => pointInCampus(point, hole))) return true
  return ringDistance(point, building.outer) < radius || building.holes.some(hole => ringDistance(point, hole) < radius)
}
export function isWalkable(point: LocalCoordinate, world: WalkWorld, radius = AVATAR_RADIUS, feetY = walkSurfaceHeightAt(world.terrain, point.x, point.z)): boolean {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.z) || Math.max(Math.abs(point.x), Math.abs(point.z)) > world.terrain.size / 2 - radius) return false
  if (world.boundary.length >= 3) {
    const exterior=world.terrain.entranceExterior
    if (!pointInCampus(point,world.boundary) && !(exterior && inEntranceExterior(point,exterior,radius))) return false
    // Retain solid perimeter walls everywhere except the existing gate opening.
    const anchor=savedCampusOverrides['main-entrance'].coordinates!
    const opening=!!exterior && Math.hypot(point.x-anchor.x,point.z-anchor.z)<16-radius
    if (ringDistance(point,world.boundary)<radius && !opening) return false
  }
  if (world.terrain.canal && canalBlocksWalking(point, world.terrain.canal, radius)) return false
  if (world.terrain.theatre && theatreBlocksWalking(point, world.terrain.theatre, radius)) return false
  if (world.terrain.flag && flagBlocksWalking(point, world.terrain.flag, radius)) return false
  if (world.terrain.entrance && entranceBlocksWalking(point, world.terrain.entrance, radius)) return false
  if (world.lamps?.some(lamp => Math.hypot(point.x-lamp.x,point.z-lamp.z)<LAMP_POLE_RADIUS+radius)) return false
  if (nearbyTrees(point, world).some(tree => Math.hypot(point.x - tree.x, point.z - tree.z) < treeTrunkRadius(tree) + radius)) return false
  if (feetY + AVATAR_HEIGHT > treeCeilingAt(point, world, radius)) return false
  return !world.buildings.some(building => hitsBuilding(point, building, radius))
}
// Clamp delta and substep movement so frame stalls/jogging cannot tunnel through walls.
// Axis sliding allows walking along a wall instead of getting stuck on its corner.
export function stepWalking(point: LocalCoordinate, direction: LocalCoordinate, speed: number, delta: number, world: WalkWorld, feetY?: number): LocalCoordinate {
  const length = Math.hypot(direction.x, direction.z)
  if (!length || !Number.isFinite(length) || !Number.isFinite(speed) || !Number.isFinite(delta)) return point
  const distance = Math.max(0, Math.min(8, speed)) * Math.max(0, Math.min(0.1, delta))
  const steps = Math.max(1, Math.ceil(distance / 0.15)), dx = direction.x / length * distance / steps, dz = direction.z / length * distance / steps
  let current = { ...point }
  const legal = (next: LocalCoordinate) => {
    const theatre = world.terrain.theatre
    const nextOnPlaza = !!theatre && theatreSurfaceHeightAt(next, theatre) !== null
    const currentOnPlaza = !!theatre && theatreSurfaceHeightAt(current, theatre) !== null
    // The 8 cm plaza lip must be traversable even during slow acceleration.
    // Inside, allow the 15 cm stairs; the stage still requires its ramp.
    const theatreStep = nextOnPlaza && currentOnPlaza ? .17 : nextOnPlaza || currentOnPlaza ? .1 : .02
    return isWalkable(next, world, AVATAR_RADIUS, feetY === undefined ? undefined : Math.max(feetY, walkSurfaceHeightAt(world.terrain, next.x, next.z))) && Math.abs(walkSurfaceHeightAt(world.terrain, next.x, next.z) - walkSurfaceHeightAt(world.terrain, current.x, current.z)) <= Math.hypot(next.x - current.x, next.z - current.z) * 1.2 + theatreStep
  }
  for (let i = 0; i < steps; i++) {
    const next = { x: current.x + dx, z: current.z + dz }
    if (legal(next)) current = next
    else {
      const side = { x: current.x + dx, z: current.z }; if (legal(side)) current = side
      const forward = { x: current.x, z: current.z + dz }; if (legal(forward)) current = forward
    }
  }
  return current
}
export function walkSurfaceHeightAt(terrain: TerrainModel, x: number, z: number): number {
  return (terrain.theatre && theatreSurfaceHeightAt({ x, z }, terrain.theatre)) ?? terrainHeightAt(terrain, x, z)
}
// Prefer open ground with room for the follow camera; fall back to body clearance
// in tight campuses. Never spawn inside a classroom or wall.
export function findWalkSpawn(anchor: LocalCoordinate, world: WalkWorld): LocalCoordinate | null {
  for (const clearance of [3, AVATAR_RADIUS]) {
    if (isWalkable(anchor, world, clearance)) return { ...anchor }
    for (let radius = 2; radius <= 120; radius += 2) {
      const count = Math.ceil(Math.PI * radius)
      for (let i = 0; i < count; i++) {
        const angle = i / count * Math.PI * 2, point = { x: anchor.x + Math.cos(angle) * radius, z: anchor.z + Math.sin(angle) * radius }
        if (isWalkable(point, world, clearance)) return point
      }
    }
  }
  return null
}
// Distinct admission slots prevent simultaneous arrivals from occupying the
// exact same point and covering each other's avatars. Check the actual world,
// including walls, trees, canals and the boundary, before choosing a spot.
export interface WalkEntrance { point: LocalCoordinate; outward: LocalCoordinate; buildingOuter?: LocalCoordinate[] }
// Search only the small approach in front of this doorway, never the building
// centre, an enclosed courtyard, or another side of the footprint.
export function findEntranceSpawn(entrance: WalkEntrance, world: WalkWorld, distance = 2.4): LocalCoordinate | null {
  const { point, outward } = entrance, along = { x: outward.z, z: -outward.x }
  const offsets = [0, .8, -.8, 1.6, -1.6, 2.4, -2.4]
  for (let depth = distance; depth <= distance + 6; depth += .8) for (const offset of offsets) {
    const candidate = { x: point.x + outward.x * depth + along.x * offset, z: point.z + outward.z * depth + along.z * offset }
    if ((!entrance.buildingOuter || !pointInCampus(candidate, entrance.buildingOuter)) && isWalkable(candidate, world)) return candidate
  }
  return null
}
export function findSharedSpawn(anchor: LocalCoordinate, world: WalkWorld, slot: number, occupied: LocalCoordinate[], entrance?: WalkEntrance): LocalCoordinate {
  const candidates: LocalCoordinate[] = []
  const outward = entrance?.outward ?? { x: 0, z: 1 }, along = { x: outward.z, z: -outward.x }
  const offsets = Array.from({ length: 21 * 21 }, (_, index) => ({ side: index % 21 - 10, depth: Math.floor(index / 21) - 10 }))
    .sort((a, b) => a.side ** 2 + a.depth ** 2 - b.side ** 2 - b.depth ** 2 || b.depth - a.depth || a.side - b.side)
  for (const offset of offsets) {
    if (candidates.length >= 32) break
    const candidate = { x: anchor.x + (along.x * offset.side + outward.x * offset.depth) * 1.6, z: anchor.z + (along.z * offset.side + outward.z * offset.depth) * 1.6 }
    if (entrance && (candidate.x - entrance.point.x) * outward.x + (candidate.z - entrance.point.z) * outward.z < 1.5) continue
    if (entrance?.buildingOuter && pointInCampus(candidate, entrance.buildingOuter)) continue
    if (isWalkable(candidate, world) && candidates.every(other => Math.hypot(candidate.x - other.x, candidate.z - other.z) >= 1.5)) candidates.push(candidate)
  }
  for (let attempt = 0; attempt < candidates.length; attempt++) {
    const candidate = candidates[(Math.max(0, Math.min(31, slot)) + attempt) % candidates.length]
    if (occupied.every(other => Math.hypot(candidate.x - other.x, candidate.z - other.z) >= 1.5)) return candidate
  }
  return anchor
}
export function placeDistance(point: LocalCoordinate, location: CampusLocation, world: WalkWorld): number {
  const building = world.buildings.find(building => building.id === (location.osmBuildingId ?? location.id))
  return building ? ringDistance(point, building.outer) : Math.hypot(point.x - location.coordinates.x, point.z - location.coordinates.z)
}
export function nearestWalkLocation(point: LocalCoordinate, locations: CampusLocation[], world: WalkWorld): { id: string; distance: number } | null {
  let nearest: { id: string; distance: number } | null = null
  for (const location of locations) {
    if (location.name === 'Unnamed campus building') continue
    const distance = placeDistance(point, location, world)
    if (!nearest || distance < nearest.distance) nearest = { id: location.id, distance }
  }
  return nearest
}
// Shorten the follow camera's boom before it enters buildings or rising terrain.
export function cameraBoomFraction(origin: { x: number; y: number; z: number }, end: { x: number; y: number; z: number }, world: WalkWorld): number {
  const distance = Math.hypot(end.x - origin.x, end.y - origin.y, end.z - origin.z), steps = Math.max(1, Math.ceil(distance / 0.3))
  for (let i = 1; i <= steps; i++) {
    const t = i / steps, point = { x: origin.x + (end.x - origin.x) * t, y: origin.y + (end.y - origin.y) * t, z: origin.z + (end.z - origin.z) * t }
    const treeHit = nearbyTrees(point, world).some(tree => {
      const distance = Math.max(0, Math.hypot(point.x - tree.x, point.z - tree.z) - .2)
      const trunk = point.y >= tree.y && point.y <= tree.y + (tree.palm ? 8 : 4.8) * tree.scale && distance < treeTrunkRadius(tree)
      const crown = !tree.palm && (distance / (2.7 * tree.scale)) ** 2 + ((point.y - tree.y - 6 * tree.scale) / (3.1 * tree.scale + .2)) ** 2 < 1
      return trunk || crown
    })
    const poleHit = world.lamps?.some(lamp => point.y>=lamp.y && point.y<=lamp.y+lamp.height && Math.hypot(point.x-lamp.x,point.z-lamp.z)<LAMP_POLE_RADIUS+.2)
    if ((world.terrain.entrance && entranceBlocksCamera(point, world.terrain.entrance, world.terrain)) || (world.terrain.flag && flagBlocksCamera(point, world.terrain.flag)) || poleHit || treeHit || point.y < walkSurfaceHeightAt(world.terrain, point.x, point.z) + 0.25 || world.buildings.some(building => point.y >= building.base && point.y <= building.base + building.height + 0.5 && hitsBuilding(point, building, 0.2))) return Math.max(0.08, (i - 1) / steps)
  }
  return 1
}
