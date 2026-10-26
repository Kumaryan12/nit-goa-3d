import type { ServerOptions } from 'ws'
import { LIVE_KEEPALIVE_MS } from './campusStream.ts'

// Fresh, bounded zlib contexts avoid cross-message secret reuse and keep the
// free instance's CPU/memory cost predictable. Browsers negotiate this natively.
export const liveCompression: ServerOptions['perMessageDeflate'] = {
  serverNoContextTakeover: true, clientNoContextTakeover: true,
  serverMaxWindowBits: 10, concurrencyLimit: 2, threshold: 512,
  zlibDeflateOptions: { level: 1, memLevel: 4 },
}
export class LiveStateCadence {
  private signature = ''
  private sentAt = -Infinity
  shouldSend(state: { sequence?: number; serverTime?: number }, now: number): boolean {
    const { sequence: _sequence, serverTime: _serverTime, ...content } = state
    const signature = JSON.stringify(content)
    if (signature === this.signature && now - this.sentAt < LIVE_KEEPALIVE_MS) return false
    this.signature = signature; this.sentAt = now; return true
  }
}
