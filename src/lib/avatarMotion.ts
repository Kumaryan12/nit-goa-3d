import type { LocalCoordinate } from './geo.ts'
import type { SocialState } from './social.ts'

export interface AvatarMotion { phase: number; moving: boolean; speed?: number; running?: boolean; turn?: number; kick?: number; paused?: boolean; airborne?: boolean; vehicle?: 'walk' | 'bicycle' | 'buggy'; driveSpeed?: number; social?: SocialState; seated?: boolean }
export interface Locomotion { velocity: LocalCoordinate }
export const freshLocomotion = (): Locomotion => ({ velocity: { x: 0, z: 0 } })
export const motionDelta = (delta: number) => Number.isFinite(delta) ? Math.max(0, Math.min(.1, delta)) : 0

// Holding movement builds speed; short taps stay precise. Integrate the ramp
// and its capped remainder exactly so rendering frequency cannot change travel.
export function advanceLocomotion(state: Locomotion, direction: LocalCoordinate, maxSpeed: number, delta: number, enabled = true) {
  const dt = motionDelta(delta), length = Math.hypot(direction.x, direction.z)
  const valid = enabled && Number.isFinite(length) && Number.isFinite(maxSpeed) && maxSpeed > 0
  if (!valid) { state.velocity = { x: 0, z: 0 }; return { direction: { x: 0, z: 0 }, speed: 0, delta: dt } }
  const amount = Math.min(1, length), speed = Math.min(5.5, maxSpeed) * amount
  const target = length ? { x: direction.x / length * speed, z: direction.z / length * speed } : { x: 0, z: 0 }
  const previous = state.velocity
  let average: LocalCoordinate
  if (!length) {
    const rate = 30, decay = Math.exp(-rate * dt), integral = dt ? (1 - decay) / (rate * dt) : 1
    average = { x: previous.x * integral, z: previous.z * integral }
    state.velocity = { x: previous.x * decay, z: previous.z * decay }
    if (Math.hypot(state.velocity.x, state.velocity.z) < .02) state.velocity = { x: 0, z: 0 }
  } else {
    const dx = target.x - previous.x, dz = target.z - previous.z, difference = Math.hypot(dx, dz)
    const currentSpeed = Math.hypot(previous.x, previous.z), dot = previous.x * target.x + previous.z * target.z
    const slowing = currentSpeed > speed, turning = currentSpeed > .02 && dot < currentSpeed * speed * .995
    const rate = slowing || turning ? 10 : 1.2 * amount
    const ramp = Math.min(dt, difference / rate), fraction = difference ? Math.min(1, rate * dt / difference) : 1
    state.velocity = { x: previous.x + dx * fraction, z: previous.z + dz * fraction }
    const weight = dt ? ramp / (2 * dt) : 0
    average = { x: state.velocity.x + (previous.x - state.velocity.x) * weight, z: state.velocity.z + (previous.z - state.velocity.z) * weight }
  }
  return { direction: average, speed: Math.hypot(average.x, average.z), delta: dt }
}

export function reconcileLocomotion(state: Locomotion, before: LocalCoordinate, after: LocalCoordinate, requested: { direction: LocalCoordinate; speed: number; delta: number }) {
  // Throw away momentum into blocked axes; releasing a key cannot push a
  // stationary avatar into a wall or accumulate a delayed burst at a corner.
  if (Math.abs(requested.direction.x) * requested.delta > 1e-10 && Math.abs(after.x - before.x) < Math.abs(requested.direction.x) * requested.delta * .05) state.velocity.x = 0
  if (Math.abs(requested.direction.z) * requested.delta > 1e-10 && Math.abs(after.z - before.z) < Math.abs(requested.direction.z) * requested.delta * .05) state.velocity.z = 0
}

export function stridePhase(phase: number, distance: number, running: boolean) {
  return (phase + Math.max(0, Math.min(.8, distance)) * Math.PI * 2 / (running ? 2.5 : 1.65)) % (Math.PI * 2)
}

export function avatarPose(phase: number, speed: number, running: boolean, time: number, turn = 0, kick = 0, airborne = false) {
  const amount = Math.min(1, Math.max(0, speed) / (running ? 4 : 1.8)), wave = Math.sin(phase)
  const swing = amount * (running ? .72 : .44)
  const hips = [wave * swing, -wave * swing]
  const knees = [-Math.max(0, -wave) * amount * (running ? 1.15 : .7), -Math.max(0, wave) * amount * (running ? 1.15 : .7)]
  if (kick > 0) { hips[1] = Math.sin(kick * Math.PI) * 1.1; knees[1] = -.25 * Math.sin(kick * Math.PI) }
  if (airborne) { hips[0] = .25; hips[1] = .25; knees[0] = -.55; knees[1] = -.55 }
  // Keep the supporting sneaker on the ground, with a small breathing motion.
  const lowestSole = Math.min(...hips.map((hip, i) => .88 - .37 * Math.cos(hip) - .37 * Math.cos(hip + knees[i]) - .129))
  return {
    hips, knees, ankles: hips.map((hip, i) => -hip - knees[i]),
    arms: airborne ? [-.35, -.35] : [-wave * swing * .85, wave * swing * .85], elbows: [-.16 - amount * (running ? .65 : .16), -.16 - amount * (running ? .65 : .16)],
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

export function ridingPose(kind: 'bicycle' | 'buggy', phase: number, speed: number) {
  const cycling = kind === 'bicycle', pedal = cycling ? Math.sin(phase) * Math.min(1, speed / .8) : 0
  const hips = cycling ? [.8 + pedal * .25, .8 - pedal * .25] : [1.2, 1.2]
  const knees = cycling ? [-1.25 - pedal * .35, -1.25 + pedal * .35] : [-1.4, -1.4]
  return { hips, knees, ankles: hips.map((hip, i) => -hip - knees[i]), arms: [.85, .85], elbows: [.35, .35], rootY: cycling ? .15 : -.26, lean: cycling ? -.18 : 0, sway: 0, bank: 0 }
}

export interface SocialPose extends ReturnType<typeof avatarPose> { armY: number[]; armZ: number[]; weight: number }
const socialActions = new Set(['wave', 'dance', 'applause', 'heart', 'cheer', 'sit'])
const smoothStep = (value: number) => { const t = Math.max(0, Math.min(1, value)); return t * t * (3 - 2 * t) }

// Times are server-issued milliseconds. Absolute time keeps gestures in phase
// for late arrivals, while the finite, bounded phase also handles clock jumps.
export function socialPose(state: SocialState | undefined, now: number, reducedMotion = false, seated = false): SocialPose | null {
  const active = !!state && socialActions.has(state.action) && [state.startedAt, state.until, now].every(Number.isFinite)
    && state.until > state.startedAt && now >= state.startedAt && now < state.until
  if (!active && !seated) return null
  const seconds = active ? Math.max(0, Math.min(120, (now - state.startedAt) / 1000)) : 0
  const action = active ? state.action : 'sit', sitting = seated || action === 'sit'
  const pose: SocialPose = { ...avatarPose(0, 0, false, 0), armY: [0, 0], armZ: [.07, -.07], weight: seated ? 1 : smoothStep(seconds / .2) * smoothStep((state!.until - now) / 350) }
  const rhythm = reducedMotion ? 0 : Math.sin(seconds * Math.PI * 3)
  if (sitting) {
    pose.hips = [2.18, 2.18]; pose.knees = [-2.7, -2.7]
    pose.arms = [.65, .65]; pose.elbows = [.4, .4]
    pose.lean = -.03
  }
  if (action === 'wave') {
    pose.arms[1] = .1; pose.elbows[1] = -.24
    pose.armZ[1] = 2.52 + rhythm * .19; pose.armY[1] = .1
  } else if (action === 'applause') {
    // YXZ shoulder rotation turns the raised forearms inward. At the closed
    // part of the cycle, the hand centres meet in front of the chest.
    const closed = reducedMotion ? 1 : (rhythm + 1) / 2
    pose.arms = [1.05, 1.05]; pose.elbows = [.22, .22]
    pose.armY = [-.23 - closed * .42, .23 + closed * .42]; pose.armZ = [0, 0]
  } else if (action === 'heart') {
    pose.arms = [1.05, 1.05]; pose.elbows = [.45, .45]
    pose.armY = [-.59, .59]; pose.armZ = [0, 0]
  } else if (action === 'cheer') {
    pose.arms = [.15, .15]; pose.elbows = [.25 + rhythm * .1, .25 - rhythm * .1]
    pose.armZ = [-2.35, 2.35]; pose.sway = rhythm * .025
  } else if (action === 'dance') {
    const step = reducedMotion ? .5 : Math.sin(seconds * Math.PI * 2)
    pose.arms = [.35 + step * .3, .35 - step * .3]; pose.elbows = [.7, .7]
    pose.armZ = [-.55, .55]; pose.sway = step * .09
    if (!sitting) {
      pose.hips = [step * .23, -step * .23]
      pose.knees = [-Math.max(0, -step) * .35, -Math.max(0, step) * .35]
    }
  }
  pose.ankles = pose.hips.map((hip, i) => -hip - pose.knees[i])
  const lowestSole = Math.min(...pose.hips.map((hip, i) => .88 - .37 * Math.cos(hip) - .37 * Math.cos(hip + pose.knees[i]) - .129))
  pose.rootY = .011 - lowestSole
  return pose
}

export function socialPoseForMotion(motion: AvatarMotion, now: number, reducedMotion = false) {
  if (motion.moving || motion.airborne || (motion.speed ?? 0) > .05 || (motion.vehicle && motion.vehicle !== 'walk')) return null
  return socialPose(motion.social, now, reducedMotion, motion.seated)
}
