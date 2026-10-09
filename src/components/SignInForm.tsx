import { useEffect, useState } from 'react'
import { firebasePublicConfig, getFirebaseAuth } from '../lib/firebase'
import { campusDestination, navigate } from '../lib/community'
import type { Auth } from 'firebase/auth'
import { trackCampusEvent } from '../lib/analytics'
export default function SignInForm({ destination }: { destination?: '/student' | '/admin' } = {}) {
  const [auth, setAuth] = useState<Auth | null>(null),
    [sdk, setSdk] = useState<typeof import('firebase/auth') | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [redirect, setRedirect] = useState(false)
  useEffect(() => {
    if (!firebasePublicConfig) return
    let active = true
    void Promise.all([getFirebaseAuth(), import('firebase/auth')])
      .then(([auth, sdk]) => {
        if (active) { setAuth(auth); setSdk(sdk) }
      })
      .catch(() => {
        if (active) setError('Google sign-in is temporarily unavailable.')
      })
    return () => {
      active = false
    }
  }, [])
  const signIn = async () => {
    if (!auth || !sdk || busy) return
    setBusy(true)
    setError('')
    try {
      // Keep popup creation in the tap handler. Awaiting a module load here
      // can lose the user gesture on mobile browsers and block Google sign-in.
      const provider = new sdk.GoogleAuthProvider()
      provider.setCustomParameters({ prompt: 'select_account' })
      if (redirect) {
        sessionStorage.setItem('campus-return', destination || campusDestination())
        await sdk.signInWithRedirect(auth, provider)
        return
      }
      await sdk.signInWithPopup(auth, provider)
      trackCampusEvent('login', { method: 'google' })
      navigate(destination || campusDestination())
    } catch (error) {
      const code = (error as { code?: string }).code
      if (
        code === 'auth/popup-closed-by-user' ||
        code === 'auth/cancelled-popup-request'
      )
        setError('Sign-in was cancelled. Continue whenever you’re ready.')
      else if (code === 'auth/popup-blocked') {
        setRedirect(true)
        setError(
          'Your browser blocked the sign-in window. Continue in this tab instead.',
        )
      } else
        setError(
          'Google sign-in could not start. Check your connection and try again.',
        )
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="join-form">
      <button
        type="button"
        className="google-signin"
        onClick={() => void signIn()}
        disabled={!auth || !sdk || busy}
      >
        <img src="/brand/google-signin.png" alt="" aria-hidden="true" />
        <span>
          {busy
            ? 'Signing in…'
            : redirect
              ? 'Continue with Google in this tab'
              : 'Continue with Google'}
        </span>
      </button>
      <p className="join-note">
        {destination === '/admin'
          ? 'Use the campus owner’s Google account to open the admin space.'
          : 'Your profile can wait.'}
      </p>
      {!firebasePublicConfig && (
        <p className="community-notice">
          Google sign-in opens when the Firebase project is connected.
        </p>
      )}
      {error && (
        <p role="alert" className="community-notice">
          {error}
        </p>
      )}
    </div>
  )
}
