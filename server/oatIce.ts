import { parseOatIceServers } from '../src/lib/oatIce.ts'
import type { OatIceConfiguration } from '../src/lib/oatIce.ts'

export type OatIceProvider = (participant: string) => Promise<OatIceConfiguration>
const TTL = 7200

export function createOatIceProvider(
  env: Record<string, string | undefined> = process.env,
  request: typeof fetch = fetch,
  now: () => number = Date.now,
): OatIceProvider | undefined {
  const key = env.OAT_TURN_KEY_ID, secret = env.OAT_TURN_API_TOKEN
  if (!key && !secret) return undefined
  const cache = new Map<string, { expiresAt: number; pending: Promise<OatIceConfiguration> }>()
  return participant => {
    const cached = cache.get(participant)
    if (cached && cached.expiresAt > now() + 600000) return cached.pending
    for (const [id, entry] of cache) if (entry.expiresAt <= now()) cache.delete(id)
    if (cache.size >= 128) cache.delete(cache.keys().next().value!)
    const issuedAt = now()
    const pending = (async () => {
      if (!key || !/^[a-zA-Z0-9_-]{1,128}$/.test(key) || !secret) throw new Error('TURN configuration is incomplete')
      const response = await request(`https://rtc.live.cloudflare.com/v1/turn/keys/${key}/credentials/generate-ice-servers`, {
        method: 'POST', headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ttl: TTL }), signal: AbortSignal.timeout(5000), redirect: 'error',
      })
      if (!response.ok) throw new Error('TURN credential service is unavailable')
      const body = await response.text()
      if (body.length > 16384) throw new Error('Invalid TURN configuration')
      const iceServers = parseOatIceServers(JSON.parse(body).iceServers)
      if (!iceServers?.some(server => server.urls.some(url => /^turns?:/i.test(url)))) throw new Error('TURN relay missing')
      return { iceServers, expiresAt: issuedAt + TTL * 1000 }
    })()
    cache.set(participant, { expiresAt: issuedAt + TTL * 1000, pending })
    void pending.catch(() => { if (cache.get(participant)?.pending === pending) cache.delete(participant) })
    return pending
  }
}
