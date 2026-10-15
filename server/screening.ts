import { existsSync, readFileSync } from 'node:fs'
import { screeningMedia, screeningPosition, SCREENING_CAPACITY, SCREENING_MAX_SECONDS, SCREENING_REACTIONS } from '../src/lib/screening.ts'
import type { ScreeningLayout, ScreeningState } from '../src/lib/screening.ts'
import type { CampusIdentity } from './access.ts'
import { campusName, chatText } from '../src/lib/campusProtocol.ts'
import type { CampusSnapshot } from '../src/lib/campusProtocol.ts'

export function publishedScreeningLayout(): ScreeningLayout {
  const file = ['dist/map/nit-goa-screening-layout.json', 'public/map/nit-goa-screening-layout.json'].find(existsSync)
  if (!file) return { seats: [] }
  const layout = JSON.parse(readFileSync(file, 'utf8')) as ScreeningLayout
  if (!layout || !Array.isArray(layout.seats) || layout.seats.length !== SCREENING_CAPACITY || layout.seats.some(p => !p || ![p.x, p.y, p.z, p.yaw].every(Number.isFinite) || Math.abs(p.x) > 1200 || Math.abs(p.z) > 1200 || Math.abs(p.y) > 64 || Math.abs(p.yaw) > Math.PI)) throw Error('Invalid screening seating layout.')
  return layout
}
export function createScreeningRoom(layout: ScreeningLayout, now = Date.now) {
  let revision = 0, session = 0, media: ScreeningState['media'] = null, title = '', playing = false, position = 0, changedAt = now(), hostOnline = false, messageId = 0
  const people = new Map<string, number>(), hosts = new Set<string>(), actions = new Map<string, number>(), chatTimes = new Map<string, number>()
  let messages: ScreeningState['messages'] = []
  const snapshot = (): ScreeningState => ({ type: 'screening-state', revision, session, serverTime: now(), media, title, playing, position, changedAt, hostOnline, participants: [...people].map(([id, seat]) => ({ id, seat })), messages: [...messages] })
  const freeze = () => { position = screeningPosition({ position, playing, changedAt }, now()); changedAt = now(); playing = false }
  const connected = (identity: CampusIdentity) => { if (identity.role !== 'admin' && hosts.has(identity.id)) { hosts.delete(identity.id); hostOnline = hosts.size > 0; if (!hostOnline) freeze(); revision++ } if (identity.role === 'admin' && !hosts.has(identity.id)) { hosts.add(identity.id); hostOnline = true; revision++ } }
  const remove = (id: string) => {
    let changed = people.delete(id)
    if (hosts.delete(id)) { hostOnline = hosts.size > 0; if (!hostOnline) freeze(); changed = true }
    if (changed) revision++
    return changed
  }
  const handle = (identity: CampusIdentity, msg: Record<string, unknown>): { ok?: true; error?: string; changed?: boolean } => {
    const id = identity.id, at = now(), action = msg.action
    if (action === 'leave') { if (people.delete(id)) revision++; return { ok: true, changed: true } }
    if (action === 'sync') return { ok: true }
    if (action !== 'load' && msg.session !== session) return { error: 'The screening has changed. Please try again.' }
    if (at - (actions.get(id) ?? -Infinity) < 300) return { error: 'Give that action a moment.' }
    actions.set(id, at)
    if (actions.size > 128) for (const key of actions.keys()) if (!people.has(key) && !hosts.has(key) && at - actions.get(key)! > 60000) { actions.delete(key); chatTimes.delete(key) }
    if (action === 'join') {
      if (!media) return { error: 'The host has not started a screening yet.' }
      if (!people.has(id)) {
        let seat = 0; while ([...people.values()].includes(seat)) seat++
        if (seat >= Math.min(SCREENING_CAPACITY, layout.seats.length)) return { error: 'The screening is full. Try again when a seat opens.' }
        people.set(id, seat); revision++
      }
      return { ok: true, changed: true }
    }
    if (action === 'chat' || action === 'react') {
      if (!people.has(id)) return { error: 'Join the screening to chat.' }
      const text = action === 'react' ? SCREENING_REACTIONS.find(r => r === msg.text) : chatText(msg.text)
      if (!text) return { error: 'Write a short message.' }
      if (at - (chatTimes.get(id) ?? -Infinity) < 1500) return { error: 'Please wait a moment before posting again.' }
      chatTimes.set(id, at); messages = [...messages.filter(m => at - m.time < 15 * 60000), { id: ++messageId, sender: id, name: campusName(identity.name), text, time: at }].slice(-40); revision++
      return { ok: true, changed: true }
    }
    if (identity.role !== 'admin') return { error: 'Only the campus administrator can host screenings.' }
    if (action === 'load') {
      const next = screeningMedia(msg.url), name = typeof msg.title === 'string' ? campusName(msg.title) : ''
      if (!next || !name) return { error: 'Use a YouTube link or a public HTTPS MP4, WebM or M4V video link.' }
      media = next; title = name; playing = false; position = 0; changedAt = at; session++; messages = []; revision++
    } else if (action === 'end') {
      media = null; title = ''; playing = false; position = 0; changedAt = at; people.clear(); messages = []; session++; revision++
    } else if (action === 'play' || action === 'pause' || action === 'seek') {
      if (!media) return { error: 'Choose a video first.' }
      if (action === 'seek' && (typeof msg.position !== 'number' || !Number.isFinite(msg.position) || msg.position < 0 || msg.position > SCREENING_MAX_SECONDS)) return { error: 'Choose a valid time within four hours.' }
      position = action === 'seek' ? msg.position as number : screeningPosition({ position, playing, changedAt }, at)
      changedAt = at; if (action !== 'seek') playing = action === 'play'; revision++
    } else return { error: 'Unknown screening action.' }
    return { ok: true, changed: true }
  }
  const seatVisitors = (state: CampusSnapshot): CampusSnapshot => ({ ...state, people: state.people.map(person => {
    const seat = people.get(person.id), place = seat === undefined ? null : layout.seats[seat]
    if (!place || seat === undefined) { if (person.ride && people.has(person.ride.driverId)) { const { ride: _ride, ...standing } = person; return standing } return person }
    const { concert: _concert, social: _social, drink: _drink, ride: _ride, impact: _impact, ...p } = person
    return { ...p, screening: { seat }, activity: 'walk', pose: { ...place, space: 'seminar:0', epoch: person.pose?.epoch ?? 0, moving: false, running: false, airborne: false, vehicle: 'walk', active: person.pose?.active ?? true, visible: true } }
  }) })
  const removeMessages = (id: string) => { const count = messages.length; messages = messages.filter(m => m.sender !== id); if (messages.length !== count) revision++; return messages.length !== count }
  return { removeMessages, snapshot, connected, remove, handle, seatVisitors, has: (id: string) => people.has(id), reconcile: () => { if (playing && screeningPosition({ position, playing, changedAt }, now()) >= SCREENING_MAX_SECONDS) { freeze(); revision++ } } }
}
