import type { CampusPose } from './campusProtocol.ts'
import { PRESENCE_SPEED_LIMITS } from './movementLimits.ts'

interface Frame { time: number; pose: CampusPose }
const samePlace = (a: CampusPose, b: CampusPose) => a.epoch === b.epoch && a.space === b.space && a.vehicle === b.vehicle && a.visible === b.visible && Math.hypot(a.x - b.x, a.z - b.z) < 8
const angle = (a: number, b: number, t: number) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t

// Render one network tick behind, with a small, bounded prediction window when
// a packet is late. Never interpolate across a teleport, floor or vehicle change.
export class RemoteMotionBuffer {
  private frames = new Map<string, Frame[]>()
  private offset: number | null = null
  private receivedAt = 0
  private sequence = -1
  private serverTime = 0
  push(snapshot: { sequence: number; serverTime: number; people: { id: string; pose: CampusPose | null }[] }, now: number) {
    if (snapshot.sequence <= this.sequence) return
    if (this.offset === null || now < this.receivedAt || now - this.receivedAt > 2000 || snapshot.serverTime < this.serverTime) {
      this.frames.clear(); this.offset = now - snapshot.serverTime
    } else this.offset = Math.min(this.offset, now - snapshot.serverTime)
    this.sequence = snapshot.sequence; this.serverTime = snapshot.serverTime; this.receivedAt = now
    const ids = new Set(snapshot.people.map(person => person.id))
    for (const id of this.frames.keys()) if (!ids.has(id)) this.frames.delete(id)
    for (const person of snapshot.people) {
      if (!person.pose) { this.frames.delete(person.id); continue }
      let history = this.frames.get(person.id) ?? []
      const last = history.at(-1)
      if (last && !samePlace(last.pose, person.pose)) history = []
      if (last?.time === snapshot.serverTime && history.length) history[history.length - 1] = { time: snapshot.serverTime, pose: person.pose }
      else history.push({ time: snapshot.serverTime, pose: person.pose })
      this.frames.set(person.id, history.slice(-8))
    }
  }
  sample(id: string, now: number): CampusPose | null {
    const frames = this.frames.get(id), latest = frames?.at(-1)
    if (!frames?.length || !latest || this.offset === null) return null
    const target = now - this.offset - 100, state = latest.pose
    if (!state.visible) return state
    let a = frames[0]
    for (const frame of frames) if (frame.time <= target) a = frame
    const b = frames.find(frame => frame.time > target)
    if (b === a) return { ...state, x: a.pose.x, y: a.pose.y, z: a.pose.z, yaw: a.pose.yaw, pitch: a.pose.pitch }
    if (b && b !== a) {
      const t = Math.max(0, Math.min(1, (target - a.time) / (b.time - a.time)))
      return { ...state, x: a.pose.x + (b.pose.x - a.pose.x) * t, y: a.pose.y + (b.pose.y - a.pose.y) * t, z: a.pose.z + (b.pose.z - a.pose.z) * t, yaw: angle(a.pose.yaw, b.pose.yaw, t), pitch: (a.pose.pitch ?? 0) + ((b.pose.pitch ?? 0) - (a.pose.pitch ?? 0)) * t }
    }
    const previous = frames.at(-2), age = Math.max(0, target - latest.time), interval = previous ? latest.time - previous.time : 0
    if (!previous || interval <= 0 || !state.active || !state.moving) return { ...state, moving: false }
    const dx = state.x - previous.pose.x, dz = state.z - previous.pose.z
    const limit = PRESENCE_SPEED_LIMITS[state.vehicle ?? 'walk'] * interval / 1000
    const scale = Math.min(1, limit / (Math.hypot(dx, dz) || 1)) * Math.min(150, age) / interval
    return { ...state, x: state.x + dx * scale, z: state.z + dz * scale, moving: age <= 150 && now - this.receivedAt <= 1000 }
  }
}
