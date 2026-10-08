import { motionDelta } from './avatarMotion.ts'
import type { AvatarMotion } from './avatarMotion.ts'

export interface AvatarAnimation { speed: number; run: number; air: number; landing: number; wasAirborne: boolean }
export const freshAvatarAnimation = (): AvatarAnimation => ({ speed: 0, run: 0, air: 0, landing: 0, wasAirborne: false })

// Visual transitions only: never alter position, input, speed limits or network
// authority. Exponential weights behave consistently on phones and fast screens.
export function advanceAvatarAnimation(state: AvatarAnimation, motion: AvatarMotion, delta: number) {
  const dt = motionDelta(delta)
  if (!dt || motion.paused) return state
  const riding = !!motion.vehicle && motion.vehicle !== 'walk'
  const rawSpeed = motion.speed ?? (motion.moving ? motion.running ? 5.5 : 2.3 : 0)
  const speed = Number.isFinite(rawSpeed) ? Math.max(0, Math.min(18, rawSpeed)) : 0
  state.speed += (speed - state.speed) * (1 - Math.exp(-dt * 14))
  state.run += (Number(!!motion.running && !riding) - state.run) * (1 - Math.exp(-dt * 9))
  state.air += (Number(!!motion.airborne && !riding) - state.air) * (1 - Math.exp(-dt * 18))
  state.landing = riding ? 0 : state.wasAirborne && !motion.airborne ? 1 : Math.max(0, state.landing - dt / .24)
  state.wasAirborne = !!motion.airborne && !riding
  return state
}
