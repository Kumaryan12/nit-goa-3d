import { useEffect, useState } from 'react'
import { firebasePublicConfig, getFirebaseAuth } from '../lib/firebase'
import { campusDestination, navigate } from '../lib/community'
import type { Auth } from 'firebase/auth'
export default function SignInForm({ destination }: { destination?: '/student' | '/admin' } = {}) {
  const [auth, setAuth] = useState<Auth | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [redirect, setRedirect] = useState(false)
  useEffect(() => {
    if (!firebasePublicConfig) return
    let active = true
    void getFirebaseAuth()
      .then((auth) => {
        if (active) setAuth(auth)
      })
      .catch(() => {
        if (active) setError('Google sign-in is temporarily unavailable.')
      })
    return () => {
      active = false
    }
  }, [])
  const signIn = async () => {
    if (!auth || busy) return
    setBusy(true)
    setError('')
    try {
      const sdk = await import('firebase/auth'),
        provider = new sdk.GoogleAuthProvider()
      provider.setCustomParameters({ prompt: 'select_account' })
      if (redirect) {
        sessionStorage.setItem('campus-return', destination || campusDestination())
        await sdk.signInWithRedirect(auth, provider)
        return
      }
      await sdk.signInWithPopup(auth, provider)
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
        disabled={!auth || busy}
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
