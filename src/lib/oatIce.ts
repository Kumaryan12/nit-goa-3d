export interface OatIceServer { urls: string[]; username?: string; credential?: string }
export interface OatIceConfiguration { iceServers: OatIceServer[]; expiresAt: number }

// Accept only bounded ICE configuration, never arbitrary provider metadata.
export function parseOatIceServers(value: unknown): OatIceServer[] | null {
  if (!Array.isArray(value) || !value.length || value.length > 8) return null
  const servers: OatIceServer[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') return null
    const urls = typeof item.urls === 'string' ? [item.urls] : item.urls
    if (!Array.isArray(urls) || !urls.length || urls.length > 12 || urls.some(url => typeof url !== 'string' || url.length > 256 || !/^(stun|stuns|turn|turns):[a-z0-9.-]+(?::\d{1,5})?(?:\?transport=(?:udp|tcp))?$/i.test(url))) return null
    const relay = urls.some(url => /^turns?:/i.test(url))
    if (relay && (typeof item.username !== 'string' || !item.username.length || item.username.length > 512 || typeof item.credential !== 'string' || !item.credential.length || item.credential.length > 512)) return null
    servers.push(relay ? { urls, username: item.username, credential: item.credential } : { urls })
  }
  return servers
}

export function parseOatIceConfiguration(value: unknown, now = Date.now()): OatIceConfiguration | null {
  if (!value || typeof value !== 'object') return null
  const input = value as Record<string, unknown>, iceServers = parseOatIceServers(input.iceServers)
  if (!iceServers || typeof input.expiresAt !== 'number' || !Number.isFinite(input.expiresAt) || input.expiresAt <= now || input.expiresAt > now + 172800000) return null
  return { iceServers, expiresAt: input.expiresAt }
}
