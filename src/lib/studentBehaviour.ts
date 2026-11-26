import type { StudentPlan } from './campusStudents.ts'
import type { CampusPose } from './campusProtocol.ts'
import type { SocialAction, SocialState } from './social.ts'
import type { LocalCoordinate } from './geo.ts'
import type { WalkWorld } from './walking.ts'
import { isWalkable, stepWalking, walkSurfaceHeightAt } from './walking.ts'
import { positionAtDistance } from './traversal.ts'
import { stridePhase } from './avatarMotion.ts'

export interface StudentState {
  x: number; y: number; z: number; yaw: number; phase: number; speed: number; moving: boolean
  distance: number; direction: number; wait: number; time: number; seated: boolean; seatBlend: number
  social?: SocialState; reaction?: SocialState; message: string; messageUntil: number
  near: boolean; greetedAt: number; seenGesture: number; visible: boolean; talking: boolean
}
export interface StudentVisitor { pose: CampusPose | null; social?: SocialState }
const distance = (a: LocalCoordinate, b: LocalCoordinate) => Math.hypot(a.x - b.x, a.z - b.z)
export function freshStudent(plan: StudentPlan, world: WalkWorld): StudentState {
  const length = plan.route?.lengths.at(-1) ?? 1, cursor = (plan.offset * plan.speed) % length
  const p = plan.route ? positionAtDistance(plan.route.points, plan.route.lengths, cursor) : plan.point
  return { ...p, y: plan.seat?.y ?? walkSurfaceHeightAt(world.terrain, p.x, p.z), yaw: plan.yaw, phase: plan.offset, speed: 0, moving: false,
    distance: cursor, direction: Number(plan.id.split('-').at(-1)) % 2 ? -1 : 1, wait: 0, time: plan.offset, seated: plan.role === 'seated', seatBlend: 0,
    message: '', messageUntil: 0, near: false, greetedAt: -Infinity, seenGesture: -1, visible: true, talking: false }
}

/** Fixed 10 Hz decisions, bounded walking; no network identities or seat claims. */
export function advanceStudent(state: StudentState, plan: StudentPlan, world: WalkWorld, seconds: number, now: number, visitor: StudentVisitor, people: CampusPose[], react = true): void {
  const dt = Number.isFinite(seconds) ? Math.max(0, Math.min(.1, seconds)) : 0
  if (!dt || !Number.isFinite(now)) return
  state.time += dt
  const local = visitor.pose, localNear = !!local && local.active && local.visible && local.space === 'outdoors' && (local.vehicle ?? 'walk') === 'walk' && !local.airborne && Math.abs(local.y - state.y) < 2
  const nearby = localNear && distance(local!, state) < 5.5
  const action = visitor.social, gestured = localNear && !!action && action.until > now && action.startedAt !== state.seenGesture && action.action !== 'sit' && distance(local!, state) < 9
  if (react && (nearby && !state.near && now - state.greetedAt > 25000 || gestured && now - state.greetedAt > 2500)) {
    const reply: SocialAction = gestured && action?.action === 'dance' ? 'dance' : gestured && ['cheer', 'applause'].includes(action?.action ?? '') ? 'applause' : 'wave'
    state.reaction = { action: reply, startedAt: now, until: now + (reply === 'dance' ? 5000 : 3500) }
    state.message = reply === 'dance' ? 'Now that’s a campus vibe!' : reply === 'applause' ? 'Let’s go!' : ['Hey! See you around.', 'Hi! Coffee at Nescafé?', 'Hey! Enjoy exploring.'][Number(plan.id.split('-').at(-1)) % 3]
    state.messageUntil = now + 3800; state.greetedAt = now
    if (action) state.seenGesture = action.startedAt
  }
  if (!nearby && (!local || distance(local, state) > 8)) state.near = false
  else if (nearby) state.near = true
  if (state.reaction && now >= state.reaction.until) state.reaction = undefined
  if (state.messageUntil <= now) state.message = ''
  const before = { x: state.x, z: state.z }
  state.visible = true; state.seated = false; state.talking = false; state.social = state.reaction
  if (plan.role === 'seated' && plan.seat && plan.stand) {
    // Give real visitors priority, including server-reserved concert/table seats.
    const yieldSeat = people.some(p => p.visible && p.space === 'outdoors' && Math.abs(p.y - plan.seat!.y) < 2.5 && distance(p, plan.seat!) < 3.7)
    const resting = (state.time % 85) < 62 && !yieldSeat
    state.seatBlend = Math.max(0, Math.min(1, state.seatBlend + dt * (resting ? -1.5 : 1.5)))
    const blend = state.seatBlend * state.seatBlend * (3 - 2 * state.seatBlend)
    state.x = plan.seat.x + (plan.stand.x - plan.seat.x) * blend; state.z = plan.seat.z + (plan.stand.z - plan.seat.z) * blend
    state.y = plan.seat.y + (walkSurfaceHeightAt(world.terrain, plan.stand.x, plan.stand.z) - plan.seat.y) * blend
    state.seated = state.seatBlend < .15
    state.social ??= state.seated ? { action: 'sit', startedAt: now - 3000, until: now + 1000, seatId: plan.seat.id, seatHeight: plan.seat.seatHeight } : undefined
    // A real visitor who arrives on a seat must never overlap the decorative NPC.
    if (yieldSeat && state.seatBlend < .9 && people.some(p => p.visible && p.space === 'outdoors' && distance(p, plan.seat!) < .9 && Math.abs(p.y - state.y) < 2)) state.visible = false
    state.yaw = state.reaction && localNear ? Math.atan2(state.x - local!.x, state.z - local!.z) : plan.yaw
  } else if (plan.route) {
    const length = plan.route.lengths.at(-1)!, anchor = positionAtDistance(plan.route.points, plan.route.lengths, state.distance)
    const obstacle = people.find(p => p.active && p.visible && p.space === 'outdoors' && Math.abs(p.y - state.y) < 2 && distance(p, state) < ((p.vehicle ?? 'walk') === 'walk' ? 1.8 : p.moving ? 16 : 3))
    let target = anchor
    if (obstacle) {
      const dx = state.x - obstacle.x, dz = state.z - obstacle.z, magnitude = Math.hypot(dx, dz) || 1
      const away = { x: state.x + dx / magnitude * 1.6, z: state.z + dz / magnitude * 1.6 }
      if (isWalkable(away, world, .48)) target = away
    } else if (!state.reaction && !state.wait && distance(state, anchor) < .22) {
      state.distance = Math.max(0, Math.min(length, state.distance + state.direction * plan.speed * dt))
      target = positionAtDistance(plan.route.points, plan.route.lengths, state.distance)
      if (state.distance === 0 || state.distance === length) { state.wait = 8 + plan.offset % 7; state.direction *= -1 }
    }
    if (!obstacle && state.wait) state.wait = Math.max(0, state.wait - dt)
    if (!state.reaction || obstacle) {
      const gap = distance(state, target), move = stepWalking(state, { x: target.x - state.x, z: target.z - state.z }, Math.min(obstacle ? 1.6 : plan.speed, gap / dt), dt, world)
      state.x = move.x; state.z = move.z
    }
    state.y = walkSurfaceHeightAt(world.terrain, state.x, state.z)
    if (state.reaction && localNear) state.yaw = Math.atan2(state.x - local!.x, state.z - local!.z)
    else if (distance(before, state) > .001) state.yaw = Math.atan2(before.x - state.x, before.z - state.z)
  } else {
    state.yaw = state.reaction && localNear ? Math.atan2(state.x - local!.x, state.z - local!.z) : plan.yaw
    const slot = (state.time - plan.offset + Math.floor(Number(plan.id.split('-').at(-1)) / 2) * 3) % 18
    const speaking = Number(plan.id.split('-').at(-1)) % 2 ? slot >= 9 && slot < 15 : slot < 6
    if (!state.reaction && speaking) {
      state.talking = true
      state.message = ['Coffee after class?', 'See you at the OAT?', 'Let’s take the scenic route.'][Math.floor(state.time / 18) % 3]
      state.messageUntil = now + 500
    }
  }
  const moved = distance(before, state)
  state.moving = !state.seated && moved > .001; state.speed = state.moving ? Math.min(1.8, moved / dt) : 0
  state.phase = stridePhase(state.phase, moved, false)
  if (state.moving) state.social = undefined
}

export function studentDetailBudget(dpr: number, nearbyPeople: number) {
  return Math.max(0, (dpr <= .85 ? 1 : dpr >= 1.5 ? 3 : 2) - Math.floor(nearbyPeople / 3))
}
