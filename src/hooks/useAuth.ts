import { useEffect, useState } from 'react'
import { firebasePublicConfig, getFirebaseAuth } from '../lib/firebase'
import { safeAuthDestination } from '../lib/community'
import { trackCampusEvent } from '../lib/analytics'
export interface CampusUser {
  id: string
  email: string | null
  email_confirmed_at: string | null
  displayName: string | null
}
export function useAuth() {
  const [user, setUser] = useState<CampusUser | null>(null),
    [loading, setLoading] = useState(!!firebasePublicConfig),
    [error, setError] = useState('')
  useEffect(() => {
    if (!firebasePublicConfig) return
    let active = true,
      unsubscribe: (() => void) | undefined
    void Promise.all([getFirebaseAuth(), import('firebase/auth')])
      .then(([auth, sdk]) => {
        if (!active) return
        void sdk
          .getRedirectResult(auth)
          .then((result) => {
            if (!result || !active) return
            trackCampusEvent('login', { method: 'google' })
            const destination = safeAuthDestination(sessionStorage.getItem('campus-return'))
            sessionStorage.removeItem('campus-return')
            if (destination) {
              history.replaceState({}, '', destination)
              window.dispatchEvent(new PopStateEvent('popstate'))
            }
          })
          .catch(() => {
            if (active)
              setError('Google sign-in could not complete. Please try again.')
          })
        unsubscribe = sdk.onIdTokenChanged(
          auth,
          (next) => {
            if (active) {
              setUser(
                next
                  ? {
                      id: next.uid,
                      email: next.email,
                      email_confirmed_at: next.emailVerified
                        ? 'verified'
                        : null,
                      displayName: next.displayName,
                    }
                  : null,
              )
              setLoading(false)
              setError('')
            }
          },
          () => {
            if (active) {
              setUser(null)
              setLoading(false)
              setError('Your sign-in could not be verified. Please try again.')
            }
          },
        )
      })
      .catch(() => {
        if (active) {
          setLoading(false)
          setError('Campus sign-in is temporarily unavailable.')
        }
      })
    return () => {
      active = false
      unsubscribe?.()
    }
  }, [])
  return { user, loading, error, configured: !!firebasePublicConfig }
}
