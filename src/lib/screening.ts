import type { HostelPlan } from './hostelInterior.ts'

export const SCREENING_CAPACITY = 32
export const SCREENING_MAX_SECONDS = 4 * 60 * 60
export const SCREENING_REACTIONS = ['👏', '❤️', '😂', '🎉'] as const
export function screeningConnectionStatus(connection: string, available: boolean, unavailable: boolean, error = '', queue = 0): string | null {
  if (connection === 'offline') return error || 'The campus connection is offline. Reconnect to use screenings.'
  if (connection === 'waiting') return `The campus is full. You’re ${queue} in the queue.`
  if (connection === 'reconnecting') return 'Connection interrupted. Reconnecting…'
  if (connection !== 'live') return 'Connecting to the campus…'
  if (unavailable) return 'Screenings are unavailable on this campus connection. Reconnect to try again.'
  return available ? null : 'Checking the screening room…'
}
export interface ScreeningMedia { kind: 'video' | 'youtube'; url: string; videoId?: string }
export interface ScreeningSeat { x: number; y: number; z: number; yaw: number }
export interface ScreeningLayout { seats: ScreeningSeat[] }
export interface ScreeningMessage { id: number; sender: string; name: string; text: string; time: number }
export interface ScreeningState {
  type: 'screening-state'; revision: number; serverTime: number; session: number
  media: ScreeningMedia | null; title: string; playing: boolean; position: number; changedAt: number; hostOnline: boolean
  participants: { id: string; seat: number }[]; messages: ScreeningMessage[]
}
export function screeningMedia(value: unknown): ScreeningMedia | null {
  if (typeof value !== 'string' || value.length > 2048) return null
  try {
    const u = new URL(value.trim())
    if (u.protocol !== 'https:' || u.username || u.password || u.port && u.port !== '443') return null
    const host = u.hostname.toLowerCase()
    if (['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be', 'www.youtube-nocookie.com'].includes(host)) {
      const id = host === 'youtu.be' ? u.pathname.slice(1) : u.pathname === '/watch' ? u.searchParams.get('v') : /^\/(embed|shorts)\/([^/]+)$/.exec(u.pathname)?.[2]
      return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? { kind: 'youtube', url: `https://www.youtube.com/watch?v=${id}`, videoId: id } : null
    }
    // Playback goes straight to the viewer, never through a server URL proxy.
    if (!host.includes('.') || host.endsWith('.local') || host.endsWith('.localhost') || /^[\d.]+$/.test(host) || host.includes(':') || !/\.(mp4|webm|m4v)$/i.test(u.pathname)) return null
    u.hash = ''
    return { kind: 'video', url: u.href }
  } catch { return null }
}
export function screeningPosition(state: Pick<ScreeningState, 'position' | 'playing' | 'changedAt'>, now: number): number {
  return Math.min(SCREENING_MAX_SECONDS, Math.max(0, state.position + (state.playing ? Math.max(0, now - state.changedAt) / 1000 : 0)))
}
export function createScreeningLayout(plan: HostelPlan | null): ScreeningLayout {
  const hall = plan?.seminar?.halls.find(h => h.id === 'seated')
  if (!hall || !plan) return { seats: [] }
  // Middle rows, alternating either side of the centre aisle. Leave the
  // physical seat cushion beneath the avatar's seated hip height.
  return { seats: hall.seats.slice(4 * 14, 4 * 14 + SCREENING_CAPACITY).map(p => ({ x: p.x, y: plan.base + .14 + p.elevation + .03, z: p.z, yaw: -Math.PI / 2 })) }
}
export function parseScreeningState(value: unknown): ScreeningState | null {
  if (!value || typeof value !== 'object') return null
  const s = value as ScreeningState, finite = (n: number) => Number.isFinite(n) && n >= 0 && n <= 1e14
  if (s.type !== 'screening-state' || !Number.isSafeInteger(s.revision) || s.revision < 0 || !Number.isSafeInteger(s.session) || s.session < 0 || !finite(s.serverTime) || !finite(s.changedAt) || !finite(s.position) || s.position > SCREENING_MAX_SECONDS || typeof s.playing !== 'boolean' || typeof s.hostOnline !== 'boolean' || typeof s.title !== 'string' || s.title.length > 80 || !Array.isArray(s.participants) || s.participants.length > SCREENING_CAPACITY || !Array.isArray(s.messages) || s.messages.length > 40) return null
  const media = s.media === null ? null : screeningMedia(s.media?.url)
  if (s.media !== null && (!media || media.kind !== s.media.kind) || !media && (s.playing || s.participants.length)) return null
  const ids = new Set<string>(), seats = new Set<number>()
  for (const p of s.participants) {
    if (!p || !/^[A-Za-z0-9_-]{1,128}$/.test(p.id) || ids.has(p.id) || !Number.isInteger(p.seat) || p.seat < 0 || p.seat >= SCREENING_CAPACITY || seats.has(p.seat)) return null
    ids.add(p.id); seats.add(p.seat)
  }
  for (const m of s.messages) if (!m || !Number.isSafeInteger(m.id) || m.id < 0 || !/^[A-Za-z0-9_-]{1,128}$/.test(m.sender) || typeof m.name !== 'string' || m.name.length > 80 || typeof m.text !== 'string' || m.text.length > 280 || !finite(m.time)) return null
  return { type: s.type, revision: s.revision, serverTime: s.serverTime, session: s.session, media, title: s.title, playing: s.playing, position: s.position, changedAt: s.changedAt, hostOnline: s.hostOnline, participants: s.participants.map(p => ({ id: p.id, seat: p.seat })), messages: s.messages.map(m => ({ id: m.id, sender: m.sender, name: m.name, text: m.text, time: m.time })) }
}
