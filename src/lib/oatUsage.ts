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
export function oatVoiceNotice(availability: OatVoiceAvailability) {
  return availability === 'quota' ? 'Live voice is paused for this month’s allowance. Campus activities and shared music are still available.'
    : availability === 'checking' ? 'Checking the live voice allowance…'
    : availability === 'unavailable' ? 'Live voice is paused while usage monitoring reconnects. Shared music is still available.' : ''
}
