export type OatVoiceAvailability = 'available' | 'checking' | 'unavailable' | 'quota'
export interface OatUsageStatus {
  provider: 'cloudflare'
  availability: OatVoiceAvailability
  usedBytes: number | null
  allowanceBytes: number
  cutoffBytes: number
  warningBytes: number[]
  cycleStart: string | null
  cycleEnd: string | null
  checkedAt: number | null
  warningLevel: number
}
export function parseOatUsageStatus(value: unknown): OatUsageStatus | null {
  if (!value || typeof value !== 'object') return null
  const s = value as OatUsageStatus
  const bytes = (v: unknown) => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0
  const date = (v: unknown) => v === null || (typeof v === 'string' && v.length === 24 && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v)
  if (s.provider !== 'cloudflare' || !['available', 'checking', 'unavailable', 'quota'].includes(s.availability)) return null
  if ((s.usedBytes !== null && !bytes(s.usedBytes)) || !bytes(s.allowanceBytes) || !bytes(s.cutoffBytes) || s.cutoffBytes <= 0 || s.cutoffBytes > s.allowanceBytes) return null
  if (!Array.isArray(s.warningBytes) || s.warningBytes.length !== 2 || !s.warningBytes.every((v, i) => bytes(v) && v > (s.warningBytes[i - 1] ?? 0) && v < s.cutoffBytes)) return null
  if (!date(s.cycleStart) || !date(s.cycleEnd) || (s.cycleStart === null) !== (s.cycleEnd === null) || (s.cycleStart && s.cycleEnd && s.cycleStart >= s.cycleEnd)) return null
  if ((s.checkedAt !== null && !bytes(s.checkedAt)) || !Number.isInteger(s.warningLevel) || s.warningLevel < 0 || s.warningLevel > 2) return null
  if ((s.availability === 'available' || s.availability === 'quota') && (s.usedBytes === null || s.checkedAt === null || s.cycleStart === null)) return null
  // Select only the public aggregate fields, even if a future server adds private metadata.
  return { provider: s.provider, availability: s.availability, usedBytes: s.usedBytes, allowanceBytes: s.allowanceBytes, cutoffBytes: s.cutoffBytes, warningBytes: [...s.warningBytes], cycleStart: s.cycleStart, cycleEnd: s.cycleEnd, checkedAt: s.checkedAt, warningLevel: s.warningLevel }
}
export function oatUsageAmount(bytes: number) {
  const unit = bytes >= 1e9 ? [1e9, 'GB'] as const : bytes >= 1e6 ? [1e6, 'MB'] as const : bytes >= 1e3 ? [1e3, 'KB'] as const : [1, 'B'] as const
  return `${new Intl.NumberFormat('en', { maximumFractionDigits: 2 }).format(bytes / unit[0])} ${unit[1]}`
}
export function oatVoiceNotice(availability: OatVoiceAvailability) {
  return availability === 'quota' ? 'Live voice is paused for this month’s allowance. Campus activities and shared music are still available.'
    : availability === 'checking' ? 'Checking the live voice allowance…'
    : availability === 'unavailable' ? 'Live voice is paused while usage monitoring reconnects. Shared music is still available.' : ''
}
