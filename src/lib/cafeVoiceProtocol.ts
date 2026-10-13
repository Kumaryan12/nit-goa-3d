import { parseOatSignal } from './oatProtocol.ts'
import type { OatSignal } from './oatProtocol.ts'
import { parseOatIceConfiguration } from './oatIce.ts'
import type { OatIceConfiguration } from './oatIce.ts'
import { parseOatUsageStatus } from './oatUsage.ts'
import type { OatUsageStatus } from './oatUsage.ts'

export function cafeSeatTable(seat: unknown): number | null {
  const match = typeof seat === 'string' && /^cafe-([0-3])-[0-3]$/.exec(seat)
  return match ? Number(match[1]) : null
}
export interface CafeVoiceMember { id: string; name: string; sessionId: string; mic: boolean }
export interface CafeVoiceState { type: 'cafe-voice-state'; table: number | null; sessionId: string | null; members: CafeVoiceMember[]; usage?: OatUsageStatus }
export type CafeVoiceEvent = CafeVoiceState | { type: 'cafe-voice-ice'; sessionId: string; configuration: OatIceConfiguration } |
  { type: 'cafe-voice-signal'; from: string; fromSessionId: string; sessionId: string; signal: OatSignal } |
  { type: 'cafe-voice-error'; message: string } | { type: 'cafe-voice-reset' }
const token = (v: unknown): v is string => typeof v === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(v)
export function parseCafeVoiceEvent(value: unknown): CafeVoiceEvent | null {
  if (!value || typeof value !== 'object') return null
  const v = value as Record<string, unknown>
  if (v.type === 'cafe-voice-reset') return { type: v.type }
  if (v.type === 'cafe-voice-error' && typeof v.message === 'string' && v.message.length <= 240) return { type: v.type, message: v.message }
  if (v.type === 'cafe-voice-state') {
    if (!(v.table === null || Number.isInteger(v.table) && Number(v.table) >= 0 && Number(v.table) < 4) || !(v.sessionId === null || token(v.sessionId)) || !Array.isArray(v.members) || v.members.length > 4) return null
    const members: CafeVoiceMember[] = []
    for (const m of v.members) {
      if (!m || !token(m.id) || !token(m.sessionId) || typeof m.name !== 'string' || !m.name.length || m.name.length > 80 || typeof m.mic !== 'boolean') return null
      members.push({ id: m.id, name: m.name, sessionId: m.sessionId, mic: m.mic })
    }
    if (new Set(members.map(m => m.id)).size !== members.length || (v.table === null) !== (v.sessionId === null) || v.table === null && members.length || v.sessionId !== null && !members.some(m => m.sessionId === v.sessionId)) return null
    const usage = v.usage === undefined ? undefined : parseOatUsageStatus(v.usage)
    if (usage === null) return null
    return { type: v.type, table: v.table as number | null, sessionId: v.sessionId as string | null, members, ...(usage ? { usage } : {}) }
  }
  if (v.type === 'cafe-voice-ice' && token(v.sessionId)) {
    const configuration = parseOatIceConfiguration(v.configuration)
    return configuration ? { type: v.type, sessionId: v.sessionId, configuration } : null
  }
  if (v.type === 'cafe-voice-signal' && token(v.from) && token(v.fromSessionId) && token(v.sessionId)) {
    const signal = parseOatSignal(v.signal)
    return signal?.connectionId ? { type: v.type, from: v.from, fromSessionId: v.fromSessionId, sessionId: v.sessionId, signal } : null
  }
  return null
}
