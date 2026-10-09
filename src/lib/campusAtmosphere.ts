import type { CampusPose } from './campusProtocol.ts'
import { MOVEMENT_SPEEDS, PRESENCE_SPEED_LIMITS } from './movementLimits.ts'

export interface AtmosphereSettings { volume: number; muted: boolean; wind: boolean; birds: boolean; movement: boolean }
export const DEFAULT_ATMOSPHERE: AtmosphereSettings = { volume: .38, muted: false, wind: true, birds: true, movement: true }
export const ATMOSPHERE_STORAGE_KEY = 'nit-goa:atmosphere'

export function atmosphereSettings(value: unknown): AtmosphereSettings {
  const source = value && typeof value === 'object' ? value as Partial<AtmosphereSettings> : {}
  return {
    volume: typeof source.volume === 'number' && Number.isFinite(source.volume) ? Math.min(1, Math.max(0, source.volume)) : DEFAULT_ATMOSPHERE.volume,
    muted: typeof source.muted === 'boolean' ? source.muted : DEFAULT_ATMOSPHERE.muted,
    wind: typeof source.wind === 'boolean' ? source.wind : DEFAULT_ATMOSPHERE.wind,
    birds: typeof source.birds === 'boolean' ? source.birds : DEFAULT_ATMOSPHERE.birds,
    movement: typeof source.movement === 'boolean' ? source.movement : DEFAULT_ATMOSPHERE.movement,
  }
}

export function atmosphereMix(settings: AtmosphereSettings, night: boolean, indoors: boolean, concert: boolean) {
  const duck = concert ? .23 : 1
  return {
    master: settings.muted ? 0 : settings.volume,
    wind: settings.wind ? .085 * (indoors ? .16 : 1) * (night ? .78 : 1) * duck : 0,
    birds: settings.birds && !indoors ? .045 * (night ? .08 : 1) * duck : 0,
    movement: settings.movement ? (concert ? .42 : 1) : 0,
  }
}

export interface AtmosphereMotion {
  previous: CampusPose | null
  time: number
  distance: number
  chainDistance: number
  airborneUntil: number
}
export function freshAtmosphereMotion(): AtmosphereMotion {
  return { previous: null, time: 0, distance: 0, chainDistance: 0, airborneUntil: 0 }
}
export interface AtmosphereMovement { step: 'walk' | 'run' | null; bicycle: number; chain: boolean; indoors: boolean }

/** Use distance actually travelled, so a held key against a wall stays silent. */
export function advanceAtmosphereMotion(state: AtmosphereMotion, pose: CampusPose | null, time: number, walking: boolean): AtmosphereMovement {
  const result: AtmosphereMovement = { step: null, bicycle: 0, chain: false, indoors: !!pose && pose.space !== 'outdoors' }
  const before = state.previous, elapsed = time - state.time
  state.previous = pose ? { ...pose } : null
  state.time = time
  const reset = () => { state.distance = 0; state.chainDistance = 0; state.airborneUntil = 0 }
  if (!walking || !pose?.active || !pose.visible || !pose.moving || !before || !before.active || !before.visible || elapsed <= 0 || elapsed > .35 || before.epoch !== pose.epoch || before.space !== pose.space || before.vehicle !== pose.vehicle) { reset(); return result }
  const distance = Math.hypot(pose.x - before.x, pose.z - before.z), speed = distance / elapsed
  const vehicle = pose.vehicle ?? 'walk'
  // A jump/teleport must never become a backlog of steps or chain clicks.
  if (!Number.isFinite(speed) || !Number.isFinite(pose.y) || distance > 3 || speed > PRESENCE_SPEED_LIMITS[vehicle]) { reset(); return result }
  if (vehicle === 'bicycle') {
    state.distance = 0
    result.bicycle = speed < .12 ? 0 : Math.min(1, speed / MOVEMENT_SPEEDS.bicycle)
    state.chainDistance += distance
    if (state.chainDistance >= 1.65) { result.chain = result.bicycle > 0; state.chainDistance %= 1.65 }
    return result
  }
  state.chainDistance = 0
  // Passenger poses carry a pitch, while an ordinary pedestrian does not.
  if (vehicle !== 'walk' || pose.pitch !== undefined) { reset(); return result }
  const verticalSpeed = (pose.y - before.y) / elapsed
  // The optional grounded signal is authoritative. Older poses use a short
  // vertical-trajectory hold through the apex of a jump.
  const airborne = pose.airborne
  if (airborne === undefined && (Math.abs(verticalSpeed) > 3 || time < state.airborneUntil && Math.abs(verticalSpeed) > .8)) state.airborneUntil = time + .25
  if (airborne === true || airborne === undefined && time < state.airborneUntil) { state.distance = 0; return result }
  if (airborne === false) state.airborneUntil = 0
  state.distance += distance
  const stride = pose.running ? 1.1 : .8
  if (state.distance >= stride) { result.step = pose.running ? 'run' : 'walk'; state.distance %= stride }
  return result
}
