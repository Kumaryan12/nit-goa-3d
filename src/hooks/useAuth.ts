import { useEffect, useState } from 'react'
import { firebasePublicConfig, getFirebaseAuth } from '../lib/firebase'
import { safeAuthDestination } from '../lib/community'
import { trackCampusEvent } from '../lib/analytics'
import { observeAuthStartup } from '../lib/authStartup'
import { withRequestDeadline } from '../lib/accountRequest'
export interface CampusUser {
  id: string
  email: string | null
  email_confirmed_at: string | null
  displayName: string | null
}
export function useAuth() {
  const [user, setUser] = useState<CampusUser | null>(null),
    [loading, setLoading] = useState(!!firebasePublicConfig),
    [error, setError] = useState(''),
    [attempt, setAttempt] = useState(0)
  useEffect(() => {
    if (!firebasePublicConfig) return
    setLoading(true)
    setError('')
    let active = true,
      unsubscribe: (() => void) | undefined
    void withRequestDeadline(() => Promise.all([getFirebaseAuth(), import('firebase/auth')]), 12000)
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
        unsubscribe = observeAuthStartup<import('firebase/auth').User | null>(
          (next, failed) => sdk.onIdTokenChanged(auth, next, failed),
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
              setError('Google is taking longer than usual to restore your sign-in. Please retry.')
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
  }, [attempt])
  return { user, loading, error, configured: !!firebasePublicConfig, retry: () => setAttempt(value => value + 1) }
}
