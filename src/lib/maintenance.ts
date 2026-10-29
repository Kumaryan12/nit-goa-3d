// Reopen at the start of 1 November in India, independent of the visitor's timezone.
export const CAMPUS_REOPENS_AT = Date.parse('2026-11-01T00:00:00+05:30')
export const campusUnderConstruction = (now = Date.now()) => now < CAMPUS_REOPENS_AT

export function reopeningCountdown(now: number) {
  const seconds = Math.max(0, Math.ceil((CAMPUS_REOPENS_AT - now) / 1000))
  return [Math.floor(seconds / 86400), Math.floor(seconds / 3600) % 24, Math.floor(seconds / 60) % 60]
}
