import type { LocalCoordinate } from './geo.ts'

export interface AvatarMotion { phase: number; moving: boolean; speed?: number; running?: boolean; turn?: number; kick?: number; paused?: boolean }
export interface Locomotion { velocity: LocalCoordinate }
export const freshLocomotion = (): Locomotion => ({ velocity: { x: 0, z: 0 } })
export const motionDelta = (delta: number) => Number.isFinite(delta) ? Math.max(0, Math.min(.1, delta)) : 0

// Exponential response integrated over the whole frame: acceleration feels the
// same at 30/60/120 Hz, and analog input keeps its magnitude after normalization.
export function advanceLocomotion(state: Locomotion, direction: LocalCoordinate, maxSpeed: number, delta: number, enabled = true) {
  const dt = motionDelta(delta), length = Math.hypot(direction.x, direction.z)
  const valid = enabled && Number.isFinite(length) && Number.isFinite(maxSpeed) && maxSpeed > 0
  if (!enabled || !valid) { state.velocity = { x: 0, z: 0 }; return { direction: { x: 0, z: 0 }, speed: 0, delta: dt } }
  const amount = Math.min(1, length), speed = Math.min(5.5, maxSpeed) * amount
  const target = length ? { x: direction.x / length * speed, z: direction.z / length * speed } : { x: 0, z: 0 }
  const rate = length > 0 ? 6 : 22, decay = Math.exp(-rate * dt)
  const previous = state.velocity, integral = dt > 0 ? (1 - decay) / (rate * dt) : 1
  const average = { x: target.x + (previous.x - target.x) * integral, z: target.z + (previous.z - target.z) * integral }
  state.velocity = { x: target.x + (previous.x - target.x) * decay, z: target.z + (previous.z - target.z) * decay }
  if (length === 0 && Math.hypot(state.velocity.x, state.velocity.z) < .02) state.velocity = { x: 0, z: 0 }
  return { direction: average, speed: Math.hypot(average.x, average.z), delta: dt }
}

export function reconcileLocomotion(state: Locomotion, before: LocalCoordinate, after: LocalCoordinate, requested: { direction: LocalCoordinate; speed: number; delta: number }) {
  // Throw away momentum into blocked axes; releasing a key cannot push a
  // stationary avatar into a wall or accumulate a delayed burst at a corner.
  if (Math.abs(after.x - before.x) < .0001 && Math.abs(requested.direction.x) > .001) state.velocity.x = 0
  if (Math.abs(after.z - before.z) < .0001 && Math.abs(requested.direction.z) > .001) state.velocity.z = 0
}

export function stridePhase(phase: number, distance: number, running: boolean) {
  return (phase + Math.max(0, Math.min(.8, distance)) * Math.PI * 2 / (running ? 2.5 : 1.65)) % (Math.PI * 2)
}

export function avatarPose(phase: number, speed: number, running: boolean, time: number, turn = 0, kick = 0) {
  const amount = Math.min(1, Math.max(0, speed) / (running ? 4 : 1.8)), wave = Math.sin(phase)
  const swing = amount * (running ? .72 : .44)
  const hips = [wave * swing, -wave * swing]
  const knees = [-Math.max(0, -wave) * amount * (running ? 1.15 : .7), -Math.max(0, wave) * amount * (running ? 1.15 : .7)]
  if (kick > 0) { hips[1] = Math.sin(kick * Math.PI) * 1.1; knees[1] = -.25 * Math.sin(kick * Math.PI) }
  // Keep the supporting sneaker on the ground, with a small breathing motion.
  const lowestSole = Math.min(...hips.map((hip, i) => .88 - .37 * Math.cos(hip) - .37 * Math.cos(hip + knees[i]) - .129))
  return {
    hips, knees, ankles: hips.map((hip, i) => -hip - knees[i]),
    arms: [-wave * swing * .85, wave * swing * .85], elbows: [-.16 - amount * (running ? .65 : .16), -.16 - amount * (running ? .65 : .16)],
    rootY: .011 - lowestSole + Math.sin(time * 1.8) * .0025,
    lean: -amount * (running ? .13 : .035), sway: wave * amount * .025,
    bank: Math.max(-.09, Math.min(.09, turn * amount * .045)),
  }
}

export function joystickInput(x: number, y: number, radius: number) {
  if (![x, y, radius].every(Number.isFinite) || radius <= 0) return { forward: 0, side: 0, x: 0, y: 0 }
  const length = Math.hypot(x, y), amount = Math.min(1, length / radius)
  const response = amount < .12 ? 0 : (amount - .12) / .88
  return { forward: length ? -y / length * response : 0, side: length ? x / length * response : 0, x: length ? x / length * Math.min(radius, length) : 0, y: length ? y / length * Math.min(radius, length) : 0 }
}
