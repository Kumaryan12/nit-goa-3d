import { campusPoseRow, campusWireSnapshot } from '../src/lib/campusWire.ts'
import type { CampusDelta } from '../src/lib/campusWire.ts'
import type { CampusSnapshot } from '../src/lib/campusProtocol.ts'

export const LIVE_KEEPALIVE_MS = 5000
const KEYFRAME_MS = 30000
const metadata = ({ pose: _pose, ...p }: CampusSnapshot['people'][number]) => JSON.stringify(p)

// One baseline per authenticated socket, AFTER privacy/compatibility filtering.
// Call next only when the socket can accept the send; skipped backpressure ticks
// must never advance the baseline beyond what that viewer actually received.
export class CampusStream {
  private previous: CampusSnapshot | null = null
  private signature = ''
  private sentAt = -Infinity
  private fullAt = -Infinity
  next(input: CampusSnapshot, compact: boolean, now: number, force = false): string | null {
    const state = compact ? campusWireSnapshot(input) : input, signature = JSON.stringify(state.people)
    if (!force && signature === this.signature && now - this.sentAt < LIVE_KEEPALIVE_MS) return null
    // Reuse the already serialized roster instead of walking it twice per
    // viewer/tick; the strings remain ordinary JSON with escaped profile data.
    const header = JSON.stringify({ type: state.type, sequence: state.sequence, serverTime: state.serverTime })
    const full = header.slice(0, -1) + ',"people":' + signature + '}'
    let message = full
    if (compact && !force && this.previous && now - this.fullAt < KEYFRAME_MS) {
      const before = new Map(this.previous.people.map(p => [p.id, p]))
      const delta: CampusDelta = { type: 'campus-delta', baseSequence: this.previous.sequence, sequence: state.sequence, serverTime: state.serverTime, people: [], poses: [], removed: [] }
      for (const p of state.people) {
        const old = before.get(p.id)
        if (!old || metadata(old) !== metadata(p)) delta.people.push(p)
        else if (JSON.stringify(old.pose) !== JSON.stringify(p.pose)) delta.poses.push(campusPoseRow(p.id, p.pose))
        before.delete(p.id)
      }
      delta.removed = [...before.keys()]
      const encoded = JSON.stringify(delta)
      if (encoded.length < full.length) message = encoded
    }
    if (message === full) this.fullAt = now
    this.previous = state; this.signature = signature; this.sentAt = now
    return message
  }
}
