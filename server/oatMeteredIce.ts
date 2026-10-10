import { parseOatIceServers } from '../src/lib/oatIce.ts'
import type { OatIceConfiguration } from '../src/lib/oatIce.ts'
import type { OatIceProvider } from './oatIce.ts'

// Use a credential-scoped API key, never the account-wide Metered secret.
// The config deadline is for refetching; it does not change the relay key's lifetime.
export function createMeteredIceProvider(
  env: Record<string, string | undefined> = process.env,
  request: typeof fetch = fetch,
  now: () => number = Date.now,
): OatIceProvider | undefined {
  const domain = env.OAT_METERED_DOMAIN, apiKey = env.OAT_METERED_API_KEY
  if (!domain && !apiKey) return undefined
  let cached: { until: number; pending: Promise<OatIceConfiguration> } | undefined
  return () => {
    if (cached && cached.until > now()) return cached.pending
    const issuedAt = now()
    const pending = (async () => {
      if (!domain || !/^[a-z0-9](?:[a-z0-9_-]{0,61}[a-z0-9])?\.metered\.live$/.test(domain) || !apiKey || apiKey.length > 512) throw new Error('TURN configuration is incomplete')
      const url = new URL(`https://${domain}/api/v1/turn/credentials`)
      url.searchParams.set('apiKey', apiKey)
      const response = await request(url, { signal: AbortSignal.timeout(5000), redirect: 'error', headers: { Accept: 'application/json' } })
      if (!response.ok) throw new Error('TURN credential service is unavailable')
      const body = await response.text()
      if (body.length > 16384) throw new Error('Invalid TURN configuration')
      const iceServers = parseOatIceServers(JSON.parse(body))
      if (!iceServers?.some(server => server.urls.some(url => /^turns?:/i.test(url)))) throw new Error('TURN relay missing')
      return { iceServers, expiresAt: issuedAt + 1800000 }
    })()
    cached = { until: issuedAt + 300000, pending }
    void pending.catch(() => { if (cached?.pending === pending) cached = undefined })
    return pending
  }
}
