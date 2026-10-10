import { createOatIceProvider } from './oatIce.ts'
import type { OatIceProvider } from './oatIce.ts'
import { createMeteredIceProvider } from './oatMeteredIce.ts'
import { createCloudflareUsageReader, createFirestoreUsageStore, createOatUsageMonitor } from './oatUsage.ts'
import type { OatUsageMonitor } from './oatUsage.ts'
import { firebaseAdmin } from './firebaseAdmin.ts'

export interface OatVoiceService { iceProvider?: OatIceProvider; budget?: OatUsageMonitor }
export function createOatVoiceService(env: Record<string, string | undefined> = process.env): OatVoiceService {
  // Switching providers must be explicit. A Cloudflare quota outage must never
  // silently switch to another metered relay or issue unmonitored credentials.
  if (env.OAT_RELAY_PROVIDER === 'cloudflare') {
    const read = createCloudflareUsageReader(env)
    const budget = createOatUsageMonitor(env.OAT_TURN_CYCLE_ANCHOR || '', cycle => {
      if (!env.OAT_TURN_KEY_ID || !/^[a-zA-Z0-9_-]{1,128}$/.test(env.OAT_TURN_KEY_ID) || !env.OAT_TURN_API_TOKEN) return Promise.reject(new Error('Relay configuration is incomplete'))
      return read(cycle)
    }, createFirestoreUsageStore(() => firebaseAdmin().db, env.OAT_CLOUDFLARE_ACCOUNT_ID || ''))
    const iceProvider = createOatIceProvider(env, fetch, Date.now, { ttl: 600, allowed: budget.allowed })
    return { iceProvider, budget }
  }
  if (env.OAT_RELAY_PROVIDER && env.OAT_RELAY_PROVIDER !== 'metered') throw new Error('Invalid OAT relay provider')
  // The current deployment remains on Metered until Cloudflare is configured.
  // Legacy Cloudflare configurations also require a budget before activation.
  if (!env.OAT_RELAY_PROVIDER && !env.OAT_METERED_DOMAIN && !env.OAT_METERED_API_KEY && (env.OAT_TURN_KEY_ID || env.OAT_TURN_API_TOKEN)) return createOatVoiceService({ ...env, OAT_RELAY_PROVIDER: 'cloudflare' })
  return { iceProvider: createMeteredIceProvider(env) }
}
