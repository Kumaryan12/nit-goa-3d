import { parseOatIceServers } from '../src/lib/oatIce.ts'
import type { OatIceConfiguration } from '../src/lib/oatIce.ts'

export type OatIceProvider = ((participant: string) => Promise<OatIceConfiguration>) & { revokeAll?: () => Promise<void> }

export function createOatIceProvider(
  env: Record<string, string | undefined> = process.env,
  request: typeof fetch = fetch,
  now: () => number = Date.now,
  options: { ttl?: number; allowed?: () => boolean } = {},
): OatIceProvider | undefined {
  const key = env.OAT_TURN_KEY_ID, secret = env.OAT_TURN_API_TOKEN
  if (!key && !secret) return undefined
  const TTL = options.ttl ?? 7200, allowed = options.allowed ?? (() => true)
  if (!Number.isInteger(TTL) || TTL < 600 || TTL > 7200) throw new Error('Invalid relay lifetime')
  const cache = new Map<string, { expiresAt: number; pending: Promise<OatIceConfiguration> }>()
  const issued = new Map<string, number>()
  let generating = 0, revoking: Promise<void> | undefined
  const revoke = async (username: string) => {
    const response = await request(`https://rtc.live.cloudflare.com/v1/turn/keys/${key}/credentials/${encodeURIComponent(username)}/revoke`, {
      method: 'POST', headers: { Authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(5000), redirect: 'error',
    })
    if (!response.ok) throw new Error('Relay revocation is unavailable')
    issued.delete(username)
  }
  const provider: OatIceProvider = participant => {
    if (!allowed()) return Promise.reject(new Error('Live voice is paused'))
    const cached = cache.get(participant)
    if (cached && cached.expiresAt > now() + Math.min(600000, TTL * 500)) return cached.pending
    for (const [id, entry] of cache) if (entry.expiresAt <= now()) cache.delete(id)
    for (const [username, expiresAt] of issued) if (expiresAt <= now()) issued.delete(username)
    if (issued.size + generating >= 512) return Promise.reject(new Error('Relay issuance is busy'))
    if (cache.size >= 128) cache.delete(cache.keys().next().value!)
    const issuedAt = now()
    generating++
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
      for (const server of iceServers) if (server.username) issued.set(server.username, issuedAt + TTL * 1000)
      if (!allowed()) {
        await Promise.allSettled(iceServers.filter(server => server.username).map(server => revoke(server.username!)))
        throw new Error('Live voice is paused')
      }
      return { iceServers, expiresAt: issuedAt + TTL * 1000 }
    })().finally(() => { generating-- })
    cache.set(participant, { expiresAt: issuedAt + TTL * 1000, pending })
    void pending.catch(() => { if (cache.get(participant)?.pending === pending) cache.delete(participant) })
    return pending
  }
  provider.revokeAll = () => {
    if (revoking) return revoking
    cache.clear()
    revoking = (async () => {
      const usernames = [...issued.keys()].filter(username => issued.get(username)! > now())
      for (let i = 0; i < usernames.length; i += 4) await Promise.allSettled(usernames.slice(i, i + 4).map(revoke))
    })().finally(() => { revoking = undefined })
    return revoking
  }
  return provider
}
