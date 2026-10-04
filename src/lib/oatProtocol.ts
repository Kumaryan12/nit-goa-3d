export const OAT_CAPACITY = 24
export const OAT_UPLOAD_LIMIT = 12 * 1024 * 1024
export const OAT_BACKING_TRACK = '/audio/oat-backing.wav'
export function oatInviteURL(pageURL: string) {
  return new URL('/campus?location=open-air-theatre&concert=1', pageURL).href
}
export function oatPlaybackURL(url: string, pageURL: string, concertServerURL: string) {
  if (url.startsWith('/oat/audio/')) {
    const base = new URL(concertServerURL)
    if (base.protocol === 'wss:') base.protocol = 'https:'
    if (base.protocol === 'ws:') base.protocol = 'http:'
    return new URL(url, base).href
  }
  return new URL(url, new URL(pageURL).origin).href
}
export interface OatParticipant { id: string; name: string }
export interface OatMusic { url: string; title: string; position: number; playing: boolean; updatedAt: number; duration: number }
export interface OatSnapshot {
  type: 'state'; sequence: number; serverTime: number; participants: OatParticipant[]
  performerId: string | null; queue: string[]; micOn: boolean; music: OatMusic; concertTitle: string
}
export interface OatIceCandidate { candidate: string; sdpMid?: string | null; sdpMLineIndex?: number | null }
export type OatSignal = { kind: 'offer' | 'answer'; sdp: string } | { kind: 'ice'; candidate: OatIceCandidate }
export const oatName = (value: unknown) => typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 32) : ''
export function oatAudioURL(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 2048) return null
  if (value === OAT_BACKING_TRACK || /^\/oat\/audio\/[a-f0-9-]{36}$/.test(value)) return value
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.username || url.password) return null
    if (/(^|\.)(youtube\.com|youtu\.be|spotify\.com)$/.test(url.hostname)) return null
    return url.href
  } catch { return null }
}
export function oatMusicPosition(music: OatMusic, serverNow: number): number {
  const position = music.position + (music.playing ? Math.max(0, serverNow - music.updatedAt) / 1000 : 0)
  return music.duration > 0 ? Math.min(position, music.duration) : position
}
export function parseOatSnapshot(value: unknown): OatSnapshot | null {
  if (!value || typeof value !== 'object') return null
  const s = value as OatSnapshot, m = s.music
  if (s.type !== 'state' || !Number.isSafeInteger(s.sequence) || s.sequence < 0 || !Number.isFinite(s.serverTime) || !Array.isArray(s.participants) || s.participants.length > OAT_CAPACITY || !Array.isArray(s.queue) || typeof s.micOn !== 'boolean' || !oatName(s.concertTitle) || s.concertTitle !== oatName(s.concertTitle)) return null
  if (!s.participants.every(p => p && typeof p.id === 'string' && p.id.length <= 64 && !!oatName(p.name) && p.name === oatName(p.name))) return null
  const ids = new Set(s.participants.map(p => p.id))
  if (ids.size !== s.participants.length || (s.performerId !== null && !ids.has(s.performerId)) || s.queue.some(id => !ids.has(id) || id === s.performerId) || new Set(s.queue).size !== s.queue.length || (s.micOn && !s.performerId)) return null
  if (!m || (m.url !== '' && oatAudioURL(m.url) !== m.url) || typeof m.title !== 'string' || m.title.length > 120 || typeof m.playing !== 'boolean' || ![m.position, m.updatedAt, m.duration].every(Number.isFinite) || m.position < 0 || m.duration < 0 || m.duration > 14400 || (m.playing && !m.url)) return null
  return s
}
export function parseOatSignal(value: unknown): OatSignal | null {
  if (!value || typeof value !== 'object') return null
  const s = value as OatSignal
  if ((s.kind === 'offer' || s.kind === 'answer') && typeof s.sdp === 'string' && s.sdp.length > 0 && s.sdp.length <= 24000) return { kind: s.kind, sdp: s.sdp }
  if (s.kind !== 'ice' || !s.candidate || typeof s.candidate.candidate !== 'string' || s.candidate.candidate.length > 2048) return null
  const c = s.candidate
  if (c.sdpMid != null && (typeof c.sdpMid !== 'string' || c.sdpMid.length > 64)) return null
  if (c.sdpMLineIndex != null && (!Number.isInteger(c.sdpMLineIndex) || c.sdpMLineIndex < 0 || c.sdpMLineIndex > 16)) return null
  return { kind: 'ice', candidate: { candidate: c.candidate, sdpMid: c.sdpMid, sdpMLineIndex: c.sdpMLineIndex } }
}
