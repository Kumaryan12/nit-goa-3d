import type { SupabaseClient } from '@supabase/supabase-js'
export interface PublicBackendConfig { url: string; key: string }
export function validatePublicConfig(url?: string, key?: string): PublicBackendConfig | null {
  if (!url || !key || /service_role|sb_secret_|admin.secret/i.test(key)) return null
  try {
    const parsed = new URL(url)
    if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password) return null
    if (key.startsWith('sb_publishable_') && key.length > 25) return { url: parsed.origin, key }
    // Legacy public JWTs must explicitly carry the anon role.
    const payload = JSON.parse(atob(key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
    return payload.role === 'anon' ? { url: parsed.origin, key } : null
  } catch { return null }
}
export const publicBackendConfig = validatePublicConfig(import.meta.env?.VITE_SUPABASE_URL, import.meta.env?.VITE_SUPABASE_ANON_KEY)
let client: Promise<SupabaseClient> | null = null
export function getSupabase(): Promise<SupabaseClient> {
  if (!publicBackendConfig) return Promise.reject(new Error('Community persistence is unavailable in demo mode.'))
  client ??= import('@supabase/supabase-js').then(({ createClient }) => createClient(publicBackendConfig.url, publicBackendConfig.key, { auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }))
  return client
}
