import { CAFE_VOICE_LIMIT_MS, CAFE_VOICE_WARNING_MS, CAFE_VOICE_COOLDOWN_MS } from '../src/lib/cafeVoiceLimits.ts'
import { randomUUID } from 'node:crypto'
import { parseOatSignal } from '../src/lib/oatProtocol.ts'
import type { CafeVoiceMember, CafeVoiceState } from '../src/lib/cafeVoiceProtocol.ts'
import type { OatVoiceService } from './oatVoiceService.ts'

/** Signalling only: audio goes over WebRTC, never through the presence loop. */
export function createCafeVoice(
  tableFor: (id: string) => { table: number; name: string } | null,
  send: (id: string, value: unknown) => void,
  relay: OatVoiceService = {},
  now = Date.now,
) {
  type Member = CafeVoiceMember & { table: number; iceAt: number; icePending: boolean; signals: number; window: number; controls: number; controlWindow: number; warned: boolean }
  const members = new Map<string, Member>(), joins = new Map<string, number>()
  type Window = { expiresAt: number; cooldownUntil: number; ended: boolean; reason?: 'limit'; noticeAt?: number }
  const windows = new Map<string, Window>()
  let closed = false
  const allowed = () => !relay.budget || relay.budget.allowed()
  const error = (id: string, message: string) => send(id, { type: 'cafe-voice-error', message })
  const timingFor = (id: string) => { const w = windows.get(id); return w ? { serverTime: now(), expiresAt: w.expiresAt, cooldownUntil: w.cooldownUntil } : undefined }
  const state = (id: string): CafeVoiceState => {
    const own = members.get(id), usage = relay.budget?.snapshot(), timing = timingFor(id), window = windows.get(id)
    return { type: 'cafe-voice-state', table: own?.table ?? null, sessionId: own?.sessionId ?? null,
      members: own ? [...members.values()].filter(m => m.table === own.table).map(({ id, name, sessionId, mic }) => ({ id, name, sessionId, mic })) : [], ...(usage ? { usage } : {}), ...(timing ? { timing } : {}), ...(!own && window?.reason === 'limit' ? { reason: 'limit' as const } : {}) }
  }
  const broadcast = () => { for (const id of members.keys()) send(id, state(id)) }
  const remove = (id: string, reason?: 'limit') => {
    if (!members.delete(id)) return
    const window = windows.get(id)
    if (window) { window.expiresAt = Math.min(now(), window.expiresAt); window.cooldownUntil = window.expiresAt + CAFE_VOICE_COOLDOWN_MS; window.ended = true; window.reason = reason }
    send(id, state(id)); broadcast()
  }
  const reconcile = () => {
    if (closed) return
    for (const [id, member] of members) {
      const window = windows.get(id)
      if (window && now() >= window.expiresAt) { remove(id, 'limit'); continue }
      if (window && !member.warned && now() >= window.expiresAt - CAFE_VOICE_WARNING_MS) { member.warned = true; send(id, state(id)) }
      const seat = tableFor(id)
      if (!seat || seat.table !== member.table || !allowed()) remove(id)
    }
    for (const [id, window] of windows) if (window.ended && now() >= window.cooldownUntil) windows.delete(id)
    for (const [id, at] of joins) if (now() - at > 60000) joins.delete(id)
  }
  const ice = async (id: string, member: Member) => {
    if (member.icePending || now() - member.iceAt < 60000) return
    member.iceAt = now(); member.icePending = true
    try {
      await relay.budget?.refresh()
      if (!allowed()) throw new Error('budget')
      const configuration = relay.iceProvider ? await relay.iceProvider(`cafe:${id}`) : { iceServers: [{ urls: ['stun:stun.cloudflare.com:3478'] }], expiresAt: now() + 600000 }
      reconcile()
      if (!closed && members.get(id) === member && allowed()) send(id, { type: 'cafe-voice-ice', sessionId: member.sessionId, configuration })
    } catch {
      if (!closed && members.get(id) === member) { error(id, 'Table voice is unavailable. Please try again later.'); remove(id) }
    } finally { member.icePending = false }
  }
  const stopBudget = relay.budget?.subscribe(() => { reconcile(); broadcast() })
  return {
    reconcile, remove,
    handle(id: string, msg: Record<string, unknown>) {
      if (closed || typeof msg.type !== 'string' || !msg.type.startsWith('cafe-voice-')) return false
      reconcile()
      if (msg.type === 'cafe-voice-status') { send(id, { type: 'cafe-voice-limits', ...(timingFor(id) ? { timing: timingFor(id) } : {}) }); return true }
      if (msg.type === 'cafe-voice-leave') { remove(id); return true }
      if (msg.type === 'cafe-voice-join') {
        const seat = tableFor(id)
        if (!seat) { error(id, 'Sit at a Nescafé table to join its conversation.'); return true }
        if (!allowed()) { error(id, 'Campus voice is paused by the relay usage limit or availability check.'); return true }
        const existing = members.get(id)
        if (existing) { send(id, state(id)); return true }
        if (now() - (joins.get(id) ?? -Infinity) < 1500) { error(id, 'Give the table connection a moment.'); return true }
        const previous = windows.get(id)
        if (previous?.ended && now() < previous.cooldownUntil) {
          if (now() - (previous.noticeAt ?? -Infinity) >= 1000) { previous.noticeAt = now(); send(id, state(id)); error(id, 'Take a 2-minute break before starting another conversation.') }
          return true
        }
        joins.set(id, now())
        if (windows.size >= 4096 && !previous) { error(id, 'Table voice is busy. Try again shortly.'); return true }
        if ([...members.values()].filter(m => m.table === seat.table).length >= 4) { error(id, 'This table conversation is full.'); return true }
        const member: Member = { id, name: seat.name, table: seat.table, sessionId: randomUUID(), mic: msg.mic === true, iceAt: -Infinity, icePending: false, signals: 0, window: now(), controls: 0, controlWindow: now(), warned: false }
        const expiresAt = now() + CAFE_VOICE_LIMIT_MS
        windows.set(id, { expiresAt, cooldownUntil: expiresAt + CAFE_VOICE_COOLDOWN_MS, ended: false })
        members.set(id, member); broadcast(); void ice(id, member); return true
      }
      const own = members.get(id)
      if (!own || msg.sessionId !== own.sessionId) return true
      if (msg.type === 'cafe-voice-mic') { if (now() - own.controlWindow >= 10000) { own.controlWindow = now(); own.controls = 0 }; if (++own.controls > 20) return true }
      if (msg.type === 'cafe-voice-mic' && typeof msg.mic === 'boolean') { if (own.mic !== msg.mic) { own.mic = msg.mic; broadcast() } }
      if (msg.type === 'cafe-voice-ice-request') void ice(id, own)
      if (msg.type === 'cafe-voice-signal') {
        if (now() - own.window >= 10000) { own.window = now(); own.signals = 0 }
        if (++own.signals > 240) return true
        const target = typeof msg.to === 'string' ? members.get(msg.to) : undefined, signal = parseOatSignal(msg.signal)
        if (!target || target.id === id || target.table !== own.table || target.sessionId !== msg.toSessionId || !signal?.connectionId || signal.kind !== 'ice' && (signal.sdp.length > 12000 || /^m=(video|application)\s/m.test(signal.sdp))) return true
        send(target.id, { type: 'cafe-voice-signal', from: id, fromSessionId: own.sessionId, sessionId: target.sessionId, signal })
      }
      return true
    },
    close() { closed = true; stopBudget?.(); members.clear(); joins.clear(); windows.clear() },
  }
}
