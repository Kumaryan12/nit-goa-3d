import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { getSupabase, publicBackendConfig } from '../lib/supabase'
export function useAuth() {
  const [user, setUser] = useState<User | null>(null), [loading, setLoading] = useState(!!publicBackendConfig), [error, setError] = useState('')
  useEffect(() => {
    if (!publicBackendConfig) return
    let active = true, unsubscribe: (() => void) | undefined
    getSupabase().then(async (client) => {
      if (!active) return
      const listener = client.auth.onAuthStateChange((_event, session) => { if (active) { setUser(session?.user ?? null); setLoading(false) } }); unsubscribe = () => listener.data.subscription.unsubscribe()
      const { data, error: sessionError } = await client.auth.getUser()
      if (active) { setUser(data.user); setLoading(false); if (sessionError && !sessionError.message.includes('session missing')) setError('Unable to verify your session. Please sign in.') }
    }).catch(() => { if (active) { setLoading(false); setError('Community sign-in is temporarily unavailable.') } })
    return () => { active = false; unsubscribe?.() }
  }, [])
  return { user, loading, error, configured: !!publicBackendConfig }
}
