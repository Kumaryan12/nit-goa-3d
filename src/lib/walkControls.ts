import { motionDelta } from './avatarMotion.ts'
import { MOVEMENT_SPEEDS } from './movementLimits.ts'

export const WALK_CONTROLS = {
  walkSpeed: MOVEMENT_SPEEDS.walk,
  runSpeed: MOVEMENT_SPEEDS.run,
  indoorWalkSpeed: 1.15,
  indoorRunSpeed: 1.9,
  hostelWalkSpeed: 2.2,
  hostelRunSpeed: 3.6,
  turnSpeed: 1,
  dragYaw: .0022,
  dragPitch: .0016,
  zoomSensitivity: .003,
  cameraFollowRate: 8,
} as const

export function walkSpeed(running: boolean, indoors: boolean, locationId?: string) {
  if (!indoors) return running ? WALK_CONTROLS.runSpeed : WALK_CONTROLS.walkSpeed
  // Long hostel corridors need a brisker pace than classroom interiors.
  if (locationId === 'boys-hostel') return running ? WALK_CONTROLS.hostelRunSpeed : WALK_CONTROLS.hostelWalkSpeed
  return running ? WALK_CONTROLS.indoorRunSpeed : WALK_CONTROLS.indoorWalkSpeed
}

// Integrate a limited angular speed followed by exponential settling. This
// bounds a large drag without introducing frame-rate-dependent camera motion.
export function smoothLookAngle(current: number, target: number, delta: number) {
  if (![current, target].every(Number.isFinite)) return Number.isFinite(current) ? current : 0
  const dt = motionDelta(delta), error = Math.atan2(Math.sin(target - current), Math.cos(target - current))
  const rate = 12, maximumSpeed = 2, magnitude = Math.abs(error), threshold = maximumSpeed / rate
  const limitedTime = Math.max(0, (magnitude - threshold) / maximumSpeed)
  const remaining = dt <= limitedTime ? magnitude - maximumSpeed * dt
    : Math.min(magnitude, threshold) * Math.exp(-rate * (dt - limitedTime))
  return current + Math.sign(error) * (magnitude - remaining)
}

export function cameraWheelStep(deltaY: number, deltaMode = 0) {
  if (!Number.isFinite(deltaY)) return 0
  const pixels = deltaY * (deltaMode === 1 ? 16 : deltaMode === 2 ? 500 : 1)
  return Math.max(-120, Math.min(120, pixels)) * WALK_CONTROLS.zoomSensitivity
}
