export const CAFE_DRINKS = ['coffee', 'cold-coffee', 'water'] as const
export type CafeDrinkKind = typeof CAFE_DRINKS[number]
export const DRINK_LIFETIME = 5 * 60000
export const SIP_DURATION = 2400
export const DRINK_LABELS: Record<CafeDrinkKind, string> = { coffee: 'Coffee', 'cold-coffee': 'Cold coffee', water: 'Water' }
export interface CafeDrink { kind: CafeDrinkKind; takenAt: number; until: number; sipAt?: number }
export interface CafeCounter { id: string; x: number; y: number; z: number; yaw: number }
export const isCafeDrink = (kind: unknown): kind is CafeDrinkKind => typeof kind === 'string' && (CAFE_DRINKS as readonly string[]).includes(kind)
export function parseCafeDrink(value: unknown): CafeDrink | null {
  if (!value || typeof value !== 'object') return null
  const d = value as CafeDrink
  if (!isCafeDrink(d.kind) || ![d.takenAt, d.until].every(n => Number.isFinite(n) && n >= 0 && n <= 1e14) || d.until - d.takenAt !== DRINK_LIFETIME
    || d.sipAt !== undefined && (!Number.isFinite(d.sipAt) || d.sipAt < d.takenAt || d.sipAt >= d.until)) return null
  return { kind: d.kind, takenAt: d.takenAt, until: d.until, ...(d.sipAt === undefined ? {} : { sipAt: d.sipAt }) }
}
export function nearbyCafeCounter(counters: CafeCounter[], pose: { x: number; y: number; z: number; space?: string } | null): CafeCounter | null {
  if (!pose || pose.space && pose.space !== 'outdoors') return null
  let nearest: CafeCounter | null = null, distance = 4
  for (const counter of counters) {
    const dx = pose.x - counter.x, dz = pose.z - counter.z, d = Math.hypot(dx, dz)
    if (d <= distance && Math.abs(pose.y - counter.y) <= .85 && dx * Math.sin(counter.yaw) + dz * Math.cos(counter.yaw) >= -.1) { distance = d; nearest = counter }
  }
  return nearest
}
export function cafeDrinkArm(drink: CafeDrink | undefined, now: number, reducedMotion = false) {
  if (!drink || !Number.isFinite(now) || now < drink.takenAt || now >= drink.until) return null
  const t = drink.sipAt === undefined ? -1 : (now - drink.sipAt) / SIP_DURATION
  const sip = !reducedMotion && t > 0 && t < 1 ? Math.sin(t * Math.PI) ** 2 : 0
  return { arm: .32 - sip * .10, elbow: 1.15 + sip * 1.19, armY: .1 + sip * .75, armZ: -.07, sip }
}
