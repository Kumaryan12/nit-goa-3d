import type { TheatreLayout } from './theatre.ts'

export const SOCIAL_ACTIONS = ['wave', 'dance', 'applause', 'heart', 'cheer', 'sit'] as const
export type SocialAction = typeof SOCIAL_ACTIONS[number]
export interface SocialState { action: SocialAction; startedAt: number; until: number; seatId?: string }
export interface SocialSeat { id: string; x: number; y: number; z: number; yaw: number; row: number }
export const SOCIAL_DURATION: Record<SocialAction, number> = { wave: 3500, dance: 12000, applause: 6000, heart: 3500, cheer: 4500, sit: 20 * 60000 }
export const SOCIAL_LABELS: Record<SocialAction, string> = { wave: 'Wave', dance: 'Dance', applause: 'Applaud', heart: 'Send love', cheer: 'Celebrate', sit: 'Sit on a bench' }
export const SOCIAL_SYMBOLS: Record<SocialAction, string> = { wave: '👋', dance: '♪', applause: '👏', heart: '♥', cheer: '🎉', sit: '◡' }
export const isSocialAction = (value: unknown): value is SocialAction => typeof value === 'string' && (SOCIAL_ACTIONS as readonly string[]).includes(value)
export function parseSocialState(value: unknown): SocialState | null {
  if (!value || typeof value !== 'object') return null
  const s = value as SocialState
  if (!isSocialAction(s.action) || !Number.isFinite(s.startedAt) || s.startedAt < 0 || s.startedAt > 1e14 || !Number.isFinite(s.until) || s.until <= s.startedAt || s.until - s.startedAt > SOCIAL_DURATION[s.action]) return null
  if (s.action === 'sit' ? typeof s.seatId !== 'string' || !/^oat-[0-5]-[0-7]$/.test(s.seatId) : s.seatId !== undefined) return null
  return { action: s.action, startedAt: s.startedAt, until: s.until, ...(s.seatId ? { seatId: s.seatId } : {}) }
}

// Match the existing curved benches; y is the row's floor, with the sitting
// pose placing the hips on its 22 cm seat. No new obstacles or terrain edits.
export function theatreSeats(theatre: Pick<TheatreLayout, 'center' | 'rotation' | 'widthScale' | 'depthScale' | 'elevation'>): SocialSeat[] {
  const c = Math.cos(theatre.rotation), s = Math.sin(theatre.rotation)
  const world = (x: number, z: number) => ({ x: theatre.center.x + c * x * theatre.widthScale + s * z * theatre.depthScale, z: theatre.center.z - s * x * theatre.widthScale + c * z * theatre.depthScale })
  const stage = world(0, -2)
  return Array.from({ length: 6 }, (_, row) => {
    const radius = 4.6 + row * .9 + .68, aisleSeatAngle = Math.acos(1.75 / radius)
    const angles = [.25, .55, .85, aisleSeatAngle, Math.PI - aisleSeatAngle, Math.PI - .85, Math.PI - .55, Math.PI - .25]
    return angles.map((angle, slot) => {
    const point = world(Math.cos(angle) * radius, Math.sin(angle) * radius)
    return { id: `oat-${row}-${slot}`, ...point, y: theatre.elevation + .08 + (row + 1) * .3, yaw: Math.atan2(point.x - stage.x, point.z - stage.z), row }
    })
  }).flat()
}
export function nearbySeat(seats: SocialSeat[], pose: { x: number; y: number; z: number } | null, occupied: Iterable<string> = []): SocialSeat | null {
  if (!pose) return null
  const used = new Set(occupied)
  return seats.filter(s => !used.has(s.id) && Math.abs(s.y - pose.y) <= .85 && Math.hypot(s.x - pose.x, s.z - pose.z) <= 3.2)
    .sort((a, b) => Math.hypot(a.x - pose.x, a.z - pose.z) - Math.hypot(b.x - pose.x, b.z - pose.z))[0] ?? null
}
