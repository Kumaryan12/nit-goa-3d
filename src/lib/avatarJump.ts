import { motionDelta } from './avatarMotion.ts'

export const AVATAR_HEIGHT = 2.1
export const JUMP_GRAVITY = 14
export const JUMP_SPEED = 4.4
export interface AvatarJump { y: number | null; velocity: number; grounded: boolean }
export const freshJump = (): AvatarJump => ({ y: null, velocity: 0, grounded: true })

// Feet have a world-space height, so a jump lands on the new surface when
// crossing a slope instead of moving its entire arc up/down with the terrain.
export function advanceJump(state: AvatarJump, ground: number, delta: number, requested = false, enabled = true, ceiling = Infinity) {
  if (!Number.isFinite(ground)) return
  const dt = motionDelta(delta)
  if (state.y === null || !Number.isFinite(state.y)) { state.y = ground; state.velocity = 0; state.grounded = true }
  if (state.grounded) state.y = ground
  if (!enabled || !dt) return
  if (requested && state.grounded && ceiling - ground > AVATAR_HEIGHT + .08) {
    state.velocity = JUMP_SPEED; state.grounded = false
  }
  if (state.grounded) return
  state.y += state.velocity * dt - .5 * JUMP_GRAVITY * dt * dt
  state.velocity -= JUMP_GRAVITY * dt
  if (state.y + AVATAR_HEIGHT > ceiling) {
    state.y = Math.max(ground, ceiling - AVATAR_HEIGHT)
    state.velocity = Math.min(0, state.velocity)
  }
  if (state.y <= ground) { state.y = ground; state.velocity = 0; state.grounded = true }
}
