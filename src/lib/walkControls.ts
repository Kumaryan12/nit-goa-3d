import { motionDelta } from './avatarMotion.ts'

export const WALK_CONTROLS = {
  walkSpeed: 1.45,
  runSpeed: 3.2,
  indoorWalkSpeed: 1.15,
  indoorRunSpeed: 1.9,
  turnSpeed: 1,
  dragYaw: .0022,
  dragPitch: .0016,
  zoomSensitivity: .003,
  cameraFollowRate: 8,
} as const

export const walkSpeed = (running: boolean, indoors: boolean) => indoors
  ? running ? WALK_CONTROLS.indoorRunSpeed : WALK_CONTROLS.indoorWalkSpeed
  : running ? WALK_CONTROLS.runSpeed : WALK_CONTROLS.walkSpeed

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
