export const CAFE_VOICE_LIMIT_MS = 10 * 60 * 1000
export const CAFE_VOICE_WARNING_MS = 60 * 1000
export const CAFE_VOICE_COOLDOWN_MS = 2 * 60 * 1000
export interface CafeVoiceTiming { serverTime: number; expiresAt: number; cooldownUntil: number }
export function parseCafeVoiceTiming(value: unknown): CafeVoiceTiming | null {
  if (!value || typeof value !== 'object') return null
  const t = value as CafeVoiceTiming
  if (![t.serverTime, t.expiresAt, t.cooldownUntil].every(n => Number.isSafeInteger(n) && n >= 0) || t.expiresAt > t.serverTime + CAFE_VOICE_LIMIT_MS || t.cooldownUntil !== t.expiresAt + CAFE_VOICE_COOLDOWN_MS) return null
  return { serverTime: t.serverTime, expiresAt: t.expiresAt, cooldownUntil: t.cooldownUntil }
}
export function cafeVoiceTime(ms: number) {
  const seconds = Math.ceil(Math.max(0, ms) / 1000)
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}
/** Relative server time and a monotonic clock avoid device clock changes. */
export class CafeVoiceClock {
  private timing: CafeVoiceTiming | null = null
  private deadline = 0
  private cooldownEnd = 0
  private now: () => number
  constructor(now: () => number = () => performance.now()) { this.now = now }
  sync(timing?: CafeVoiceTiming) {
    if (!timing) { this.timing = null; return }
    const local = this.now(), deadline = local + Math.max(0, timing.expiresAt - timing.serverTime), end = local + Math.max(0, timing.cooldownUntil - timing.serverTime)
    // Updates for the same window can shorten it, never extend it with lag.
    const same = this.timing?.expiresAt === timing.expiresAt
    this.deadline = same ? Math.min(this.deadline, deadline) : deadline
    this.cooldownEnd = same ? Math.min(this.cooldownEnd, end) : end
    this.timing = timing
  }
  read() {
    if (!this.timing) return undefined
    const remainingMs = Math.max(0, this.deadline - this.now())
    return { remainingMs, cooldownMs: remainingMs > 0 ? 0 : Math.max(0, this.cooldownEnd - this.now()) }
  }
}
