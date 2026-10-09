import { BUGGY_BODY, boundedBuggyVelocity } from './buggyImpacts.ts'
import type { BuggyImpact } from './buggyImpacts.ts'
import type { LocalCoordinate } from './geo.ts'
import type { RoadFootprint } from '../types/osm.ts'
import { motionDelta } from './avatarMotion.ts'
import { terrainHeightAt } from './terrain.ts'
import { bridgeSurfaceHeightAt } from './canalGeometry.ts'
import { roadRibbon, ROAD_ELEVATION, FOOTPATH_ELEVATION } from './roadRibbon.ts'
import { isWalkable, stepWalking, walkSurfaceHeightAt } from './walking.ts'
import type { WalkWorld } from './walking.ts'
import { theatreSurfaceHeightAt } from './theatre.ts'
import { MOVEMENT_SPEEDS, PRESENCE_CATCHUP_SECONDS, PRESENCE_SPEED_LIMITS } from './movementLimits.ts'

export type TransportMode = 'walk' | 'bicycle' | 'buggy'
export type VehicleKind = Exclude<TransportMode, 'walk'>
export interface VehicleState { speed: number; yaw: number; steering: number; drift?: LocalCoordinate; impactTurn?: number; impactStrength?: number; impactAge?: number }
export const VEHICLES = {
  bicycle: { speed: MOVEMENT_SPEEDS.bicycle, reverse: 0, acceleration: 1.4, brake: 7, radius: .3, halfLength: .7, wheelbase: 1.4, wheelRadius: .37 },
  buggy: { speed: MOVEMENT_SPEEDS.buggy, reverse: 1.4, acceleration: 1.8, brake: 12, radius: BUGGY_BODY.radius, halfLength: BUGGY_BODY.halfLength, wheelbase: 2.1, wheelRadius: .33 },
} as const
export const freshVehicle = (yaw = 0): VehicleState => ({ speed: 0, yaw, steering: 0 })
// Set the server's resulting velocity once, rather than stacking network retries.
export function applyBuggyImpact(state: VehicleState, impact: BuggyImpact, age = 0) {
  const forward = { x: -Math.sin(state.yaw), z: -Math.cos(state.yaw) }
  const velocity = boundedBuggyVelocity(impact.velocity)
  state.speed = Math.max(-VEHICLES.buggy.reverse, Math.min(VEHICLES.buggy.speed, velocity.x * forward.x + velocity.z * forward.z))
  const decay = Math.exp(-Math.max(0, age) * 4)
  state.drift = { x: (velocity.x - forward.x * state.speed) * decay, z: (velocity.z - forward.z * state.speed) * decay }
  state.impactTurn = impact.yawKick * decay; state.impactStrength = impact.strength; state.impactAge = Math.max(0, age)
}

const clamp = (n: number) => Number.isFinite(n) ? Math.max(-1, Math.min(1, n)) : 0
const approach = (current: number, target: number, amount: number) => current + Math.max(-amount, Math.min(amount, target - current))

interface RoadTriangle { a: LocalCoordinate; b: LocalCoordinate; c: LocalCoordinate; elevation: number }
const roadIndexes = new WeakMap<RoadFootprint[], Map<string, RoadTriangle[]>>()
function roadIndex(roads: RoadFootprint[]) {
  let index = roadIndexes.get(roads)
  if (index) return index
  index = new Map<string, RoadTriangle[]>()
  for (const road of roads) {
    if (road.tags.highway === 'steps') continue
    const { points, indices } = roadRibbon(road.paths, road.width, true)
    for (let i = 0; i < indices.length; i += 3) {
      const a = points[indices[i]], b = points[indices[i + 1]], c = points[indices[i + 2]]
      const triangle = { a, b, c, elevation: road.kind === 'road' ? ROAD_ELEVATION : FOOTPATH_ELEVATION }
      for (let x = Math.floor(Math.min(a.x, b.x, c.x) / 8); x <= Math.floor(Math.max(a.x, b.x, c.x) / 8); x++)
        for (let z = Math.floor(Math.min(a.z, b.z, c.z) / 8); z <= Math.floor(Math.max(a.z, b.z, c.z) / 8); z++) {
          const key = `${x},${z}`; if (!index.has(key)) index.set(key, []); index.get(key)!.push(triangle)
        }
    }
  }
  roadIndexes.set(roads, index); return index
}
function contains(point: LocalCoordinate, { a, b, c }: RoadTriangle) {
  const cross = (p: LocalCoordinate, q: LocalCoordinate) => (q.x - p.x) * (point.z - p.z) - (q.z - p.z) * (point.x - p.x)
  if (Math.abs((b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x)) < 1e-8) return false
  const sides = [cross(a, b), cross(b, c), cross(c, a)]
  return sides.every(s => s >= -1e-7) || sides.every(s => s <= 1e-7)
}
export function vehicleSurfaceHeightAt(point: LocalCoordinate, world: WalkWorld, roads: RoadFootprint[]) {
  const ground = terrainHeightAt(world.terrain, point.x, point.z)
  let height = walkSurfaceHeightAt(world.terrain, point.x, point.z)
  const key=`${Math.floor(point.x / 8)},${Math.floor(point.z / 8)}`
  for (const index of [roadIndex(roads), ...(world.terrain.entranceExterior ? [roadIndex(world.terrain.entranceExterior.roads)] : [])])
    for (const triangle of index.get(key) ?? []) if (contains(point, triangle)) height = Math.max(height, ground + triangle.elevation)
  const canal = world.terrain.canal
  if (canal) height = Math.max(height, bridgeSurfaceHeightAt(point, canal, world.terrain) ?? -Infinity)
  return height
}
// Tyre centres match CampusVehicle's model, including its bicycle Z offset.
const contacts = {
  bicycle: [{ x: 0, z: -.74, radius: .37, width: .055 }, { x: 0, z: .66, radius: .37, width: .055 }],
  buggy: [-.81, .81].flatMap(x => [-1.08, 1.08].map(z => ({ x, z, radius: .33, width: .2 }))),
}
export function vehicleGroundPose(point: LocalCoordinate, yaw: number, kind: VehicleKind, world: WalkWorld, roads: RoadFootprint[], steering = 0) {
  const c = Math.cos(yaw), s = Math.sin(yaw), wheels = contacts[kind]
  const sample = (x: number, z: number) => vehicleSurfaceHeightAt({ x: point.x + x * c + z * s, z: point.z - x * s + z * c }, world, roads)
  const front = wheels.filter(w => w.z < 0), rear = wheels.filter(w => w.z > 0)
  const frontY = front.reduce((y, w) => y + sample(w.x, w.z), 0) / front.length
  const rearY = rear.reduce((y, w) => y + sample(w.x, w.z), 0) / rear.length
  const pitch = Math.max(-.75, Math.min(.75, Math.atan2(frontY - rearY, rear[0].z - front[0].z)))
  const cp = Math.cos(pitch), sp = Math.sin(pitch)
  let y = -Infinity
  // Contact the rendered surface, not just the terrain beneath it. Sampling the
  // lower tyre arc also clears road edges and slope changes under the wheelbase.
  for (const wheel of wheels) for (const side of [-1, 1]) for (let i = 0; i <= 16; i++) {
    const angle = Math.PI + i * Math.PI / 16
    const turn = kind === 'bicycle' && wheel.z < 0 ? Math.max(-.38, Math.min(.38, steering)) : 0
    const rimZ = wheel.radius * Math.cos(angle), rimX = side * wheel.width / 2
    const localX = wheel.x + rimX * Math.cos(turn) + rimZ * Math.sin(turn)
    const localY = wheel.radius * (1 + Math.sin(angle)), localZ = wheel.z + rimZ * Math.cos(turn) - rimX * Math.sin(turn)
    const z = localY * sp + localZ * cp, vertical = localY * cp - localZ * sp
    y = Math.max(y, sample(localX, z) - vertical + .01)
  }
  return { y, pitch }
}

export function canRideAt(point: LocalCoordinate, yaw: number, kind: VehicleKind, world: WalkWorld, _roads: RoadFootprint[]) {
  if (!Number.isFinite(yaw)) return false
  const spec = VEHICLES[kind]
  // Overlapping disks cover the full body, not just the avatar at its centre.
  for (let offset = -spec.halfLength; offset <= spec.halfLength + .001; offset += .1) {
    const p = { x: point.x - Math.sin(yaw) * offset, z: point.z - Math.cos(yaw) * offset }
    if (!isWalkable(p, world, spec.radius)) return false
  }
  return true
}

export function canReconcileBuggy(point: LocalCoordinate, anchor: LocalCoordinate & { yaw: number }, world: WalkWorld, roads: RoadFootprint[]) {
  const distance = Math.hypot(anchor.x-point.x,anchor.z-point.z)
  if (distance > PRESENCE_SPEED_LIMITS.buggy * PRESENCE_CATCHUP_SECONDS) return false
  const steps = Math.max(1,Math.ceil(distance/.1))
  let previous = point
  for (let i=0;i<=steps;i++) {
    const next={x:point.x+(anchor.x-point.x)*i/steps,z:point.z+(anchor.z-point.z)*i/steps}
    const theatre = world.terrain.theatre
    const crossesPlaza = theatre && (theatreSurfaceHeightAt(previous, theatre) === null) !== (theatreSurfaceHeightAt(next, theatre) === null)
    if (!canRideAt(next,anchor.yaw,'buggy',world,roads) || Math.abs(walkSurfaceHeightAt(world.terrain,next.x,next.z)-walkSurfaceHeightAt(world.terrain,previous.x,previous.z))>Math.hypot(next.x-previous.x,next.z-previous.z)*.85+(crossesPlaza ? .1 : .005)) return false
    previous=next
  }
  return true
}

export function findVehicleMount(point: LocalCoordinate, yaw: number, kind: VehicleKind, world: WalkWorld, roads: RoadFootprint[]) {
  const candidates: { point: LocalCoordinate; yaw: number; distance: number }[] = []
  if (canRideAt(point, yaw, kind, world, roads)) return { point: { ...point }, yaw }
  // Try nearby open ground, with a walkable approach; never snap to a road.
  for (let distance = .25; distance <= 3; distance += .25) for (let i = 0; i < 16; i++) {
    const angle = i * Math.PI / 8
    candidates.push({ point: { x: point.x + Math.cos(angle) * distance, z: point.z + Math.sin(angle) * distance }, yaw, distance })
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
  if (!enabled) { state.speed = 0; state.steering = 0; state.drift = undefined; state.impactTurn = 0; state.impactStrength = 0; return { point, distance: 0, blocked: false } }
  const target = clamp(throttle) * (throttle < 0 ? spec.reverse : spec.speed)
  const opposing = target * state.speed < 0 || throttle < 0 && state.speed > 0
  const rate = braking || opposing ? spec.brake : throttle === 0 ? 2.4 : spec.acceleration
  const steps = Math.max(1, Math.ceil(dt / .01)), sub = dt / steps
  let current = point, distance = 0, blocked = false
  for (let i = 0; i < steps; i++) {
    const previous = state.speed
    state.speed = approach(state.speed, braking || opposing ? 0 : target, rate * sub)
    state.steering = approach(state.steering, clamp(steering) * .48 / (1 + (Math.abs(state.speed) / 5) ** 2), sub * 2.4)
    const speed = (previous + state.speed) / 2
    const drift = kind === 'buggy' ? state.drift : undefined
    const driftRate = braking || opposing ? 10 : 4
    const decay = Math.exp(-driftRate * sub), integral = sub ? (1 - decay) / (driftRate * sub) : 1
    const rotation = (-speed / spec.wheelbase * Math.tan(state.steering) + (state.impactTurn ?? 0)) * sub
    if (drift) state.drift = { x: drift.x * decay, z: drift.z * decay }
    state.impactTurn = (state.impactTurn ?? 0) * decay
    if (state.impactAge !== undefined) state.impactAge += sub
    // Clamp a turn against an obstacle before stopping forward travel. Every
    // candidate still checks the full body, so corners cannot clip through walls.
    let accepted: { point: LocalCoordinate; yaw: number } | undefined
    for (const fraction of [1, .5, .25, 0]) {
      const heading = state.yaw + rotation * fraction
      const velocity = kind === 'buggy' ? boundedBuggyVelocity({ x: -Math.sin(heading) * speed + (drift?.x ?? 0) * integral, z: -Math.cos(heading) * speed + (drift?.z ?? 0) * integral }) : { x: -Math.sin(heading) * speed, z: -Math.cos(heading) * speed }
      const next = { x: current.x + velocity.x * sub, z: current.z + velocity.z * sub }
      const rise = Math.abs(walkSurfaceHeightAt(world.terrain, next.x, next.z) - walkSurfaceHeightAt(world.terrain, current.x, current.z))
      // The OAT plaza has an 8 cm lip. Clear small surface joins without allowing
      // vehicles to climb its stairs, stage or genuinely steep terrain.
      const theatre = world.terrain.theatre
      const crossesPlaza = theatre && (theatreSurfaceHeightAt(current, theatre) === null) !== (theatreSurfaceHeightAt(next, theatre) === null)
      if (rise <= Math.hypot(next.x - current.x, next.z - current.z) * .85 + (crossesPlaza ? .1 : .005) && canRideAt(next, heading, kind, world, roads)) { accepted = { point: next, yaw: heading }; break }
    }
    if (!accepted) { state.speed = 0; state.drift = undefined; state.impactTurn = 0; blocked = true; break }
    distance += Math.hypot(accepted.point.x - current.x, accepted.point.z - current.z); current = accepted.point; state.yaw = accepted.yaw
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
