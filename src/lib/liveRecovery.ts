// Retry transport interruptions, never access denial, duplicate accounts or
// moderation. Jitter keeps returning visitors from reconnecting together.
export function liveRetryDelay(code: number, attempt: number, random = Math.random()): number | null {
  if (![1001, 1006, 1011, 1012, 1013, 4000].includes(code) || attempt >= 6) return null
  return Math.min(15000, 1000 * 2 ** Math.max(0, attempt)) + Math.round(Math.max(0, Math.min(1, random)) * 500)
}
