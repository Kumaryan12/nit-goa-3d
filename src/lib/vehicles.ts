import type { LocalCoordinate } from './geo.ts'
import type { RoadFootprint } from '../types/osm.ts'
import { motionDelta } from './avatarMotion.ts'
import { distanceToSegment } from './terrain.ts'
import { isWalkable, stepWalking, walkSurfaceHeightAt } from './walking.ts'
import type { WalkWorld } from './walking.ts'

export type TransportMode = 'walk' | 'bicycle' | 'buggy'
export type VehicleKind = Exclude<TransportMode, 'walk'>
export interface VehicleState { speed: number; yaw: number; steering: number }
export const VEHICLES = {
  bicycle: { speed: 3.8, reverse: 0, acceleration: 1.8, brake: 5, radius: .3, halfLength: .7, wheelbase: 1.4, wheelRadius: .37 },
  buggy: { speed: 5.2, reverse: 1.4, acceleration: 1.6, brake: 6, radius: .92, halfLength: .9, wheelbase: 2.1, wheelRadius: .33 },
} as const
export const freshVehicle = (yaw = 0): VehicleState => ({ speed: 0, yaw, steering: 0 })
const clamp = (n: number) => Number.isFinite(n) ? Math.max(-1, Math.min(1, n)) : 0
const approach = (current: number, target: number, amount: number) => current + Math.max(-amount, Math.min(amount, target - current))

interface RoadSegment { a: LocalCoordinate; b: LocalCoordinate; radius: number; kind: RoadFootprint['kind'] }
const roadIndexes = new WeakMap<RoadFootprint[], Map<string, RoadSegment[]>>()
function roadIndex(roads: RoadFootprint[]) {
  let index = roadIndexes.get(roads)
  if (index) return index
  index = new Map<string, RoadSegment[]>()
  for (const road of roads) {
    if (road.tags.highway === 'steps') continue
    for (const path of road.paths) for (let i = 1; i < path.length; i++) {
      const a = path[i - 1], b = path[i], radius = road.width / 2, segment = { a, b, radius, kind: road.kind }
      for (let x = Math.floor((Math.min(a.x, b.x) - radius) / 8); x <= Math.floor((Math.max(a.x, b.x) + radius) / 8); x++)
        for (let z = Math.floor((Math.min(a.z, b.z) - radius) / 8); z <= Math.floor((Math.max(a.z, b.z) + radius) / 8); z++) {
          const key = `${x},${z}`; if (!index.has(key)) index.set(key, []); index.get(key)!.push(segment)
        }
    }
  }
  roadIndexes.set(roads, index); return index
}

export function canRideAt(point: LocalCoordinate, yaw: number, kind: VehicleKind, world: WalkWorld, roads: RoadFootprint[]) {
  if (!Number.isFinite(yaw)) return false
  const spec = VEHICLES[kind], index = roadIndex(roads)
  // Overlapping disks cover the full body, not just the avatar at its centre.
  for (let offset = -spec.halfLength; offset <= spec.halfLength + .001; offset += .1) {
    const p = { x: point.x - Math.sin(yaw) * offset, z: point.z - Math.cos(yaw) * offset }
    if (!isWalkable(p, world, spec.radius)) return false
    const onRoad = index.get(`${Math.floor(p.x / 8)},${Math.floor(p.z / 8)}`)?.some(segment => (kind === 'bicycle' || segment.kind === 'road') && distanceToSegment(p, segment.a, segment.b) <= segment.radius - spec.radius)
    if (!onRoad) return false
  }
  return true
}

export function findVehicleMount(point: LocalCoordinate, yaw: number, kind: VehicleKind, world: WalkWorld, roads: RoadFootprint[]) {
  const candidates: { point: LocalCoordinate; yaw: number; distance: number }[] = []
  if (canRideAt(point, yaw, kind, world, roads)) return { point: { ...point }, yaw }
  for (const road of roads) {
    if (kind === 'buggy' && road.kind !== 'road') continue
    for (const path of road.paths) for (let i = 1; i < path.length; i++) {
      const a = path[i - 1], b = path[i], dx = b.x - a.x, dz = b.z - a.z, squared = dx * dx + dz * dz
      if (!squared) continue
      const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.z - a.z) * dz) / squared))
      const projected = { x: a.x + dx * t, z: a.z + dz * t }, distance = Math.hypot(projected.x - point.x, projected.z - point.z)
      let heading = Math.atan2(-dx, -dz)
      if (Math.cos(heading - yaw) < 0) heading += Math.PI
      if (distance <= 5) candidates.push({ point: projected, yaw: heading, distance })
    }
  }
  candidates.sort((a, b) => a.distance - b.distance)
  return candidates.find(candidate => {
    if (!canRideAt(candidate.point, candidate.yaw, kind, world, roads)) return false
    // Mounting never teleports the walker through a wall, canal or tree.
    let current = point
    for (let d = 0; d < candidate.distance; d += .1) current = stepWalking(current, { x: candidate.point.x - current.x, z: candidate.point.z - current.z }, 1, .1, world)
    return Math.hypot(current.x - candidate.point.x, current.z - candidate.point.z) < .15
  }) ?? null
}

export function advanceVehicle(state: VehicleState, point: LocalCoordinate, kind: VehicleKind, throttle: number, steering: number, braking: boolean, delta: number, world: WalkWorld, roads: RoadFootprint[], enabled = true) {
  const dt = motionDelta(delta), spec = VEHICLES[kind]
  if (!enabled) { state.speed = 0; state.steering = 0; return { point, distance: 0, blocked: false } }
  const target = clamp(throttle) * (throttle < 0 ? spec.reverse : spec.speed)
  const opposing = target * state.speed < 0 || throttle < 0 && state.speed > 0
  const rate = braking || opposing ? spec.brake : throttle === 0 ? 2.4 : spec.acceleration
  const steps = Math.max(1, Math.ceil(dt / .01)), sub = dt / steps
  let current = point, distance = 0, blocked = false
  for (let i = 0; i < steps; i++) {
    const previous = state.speed
    state.speed = approach(state.speed, braking || opposing ? 0 : target, rate * sub)
    state.steering = approach(state.steering, clamp(steering) * .48, sub * 2.4)
    const speed = (previous + state.speed) / 2
    const heading = state.yaw - speed / spec.wheelbase * Math.tan(state.steering) * sub
    const next = { x: current.x - Math.sin(heading) * speed * sub, z: current.z - Math.cos(heading) * speed * sub }
    const rise = Math.abs(walkSurfaceHeightAt(world.terrain, next.x, next.z) - walkSurfaceHeightAt(world.terrain, current.x, current.z))
    if (!canRideAt(next, heading, kind, world, roads) || rise > Math.abs(speed * sub) * .85 + .005) { state.speed = 0; blocked = true; break }
    distance += Math.hypot(next.x - current.x, next.z - current.z); current = next; state.yaw = heading
  }
  return { point: current, distance, blocked }
}

export function findVehicleDismount(point: LocalCoordinate, yaw: number, kind: VehicleKind, world: WalkWorld) {
  const radius = VEHICLES[kind].radius + .6
  for (const side of [1, -1]) {
    const candidate = { x: point.x + Math.cos(yaw) * radius * side, z: point.z - Math.sin(yaw) * radius * side }
    if (!isWalkable(candidate, world)) continue
    let current = point
    for (let d = 0; d < radius; d += .1) current = stepWalking(current, { x: candidate.x - current.x, z: candidate.z - current.z }, 1, .1, world)
    if (Math.hypot(current.x - candidate.x, current.z - candidate.z) < .15) return candidate
  }
  return isWalkable(point, world) ? { ...point } : null
}
