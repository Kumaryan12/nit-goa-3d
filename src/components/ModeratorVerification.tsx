import { useEffect, useState } from 'react'
import { campusAPI, getFirebaseAuth } from '../lib/firebase'
export default function ModeratorVerification({
  onVerified,
}: {
  onVerified: (token: string) => void
}) {
  const [enrolled, setEnrolled] = useState<boolean | null>(null),
    [qr, setQR] = useState(''),
    [secret, setSecret] = useState(''),
    [code, setCode] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  useEffect(() => {
    let active = true
    void campusAPI('/api/moderator/verification')
      .then((data) => {
        if (active) setEnrolled(data.enrolled)
      })
      .catch((error) => {
        if (active)
          setError(
            error instanceof Error
              ? error.message
              : 'Verification could not load.',
          )
      })
    return () => {
      active = false
    }
  }, [])
  async function action(action: string) {
    const result = await campusAPI('/api/moderator/verification', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, code }),
    })
    if (result.token) onVerified(result.token)
    else {
      setQR(result.qr)
      setSecret(result.secret)
      setEnrolled(true)
    }
  }
  async function run(work: () => Promise<void>) {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      await work()
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Verification failed.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="moderator-verification">
      <span className="community-kicker">PROTECT YOUR MODERATOR ACCOUNT</span>
      <h2>One extra check.</h2>
      <p>
        Confirm your Google account, then verify an authenticator code to use
        moderator actions.
      </p>
      <button
        className="community-secondary"
        disabled={busy}
        onClick={() =>
          void run(async () => {
            const [auth, sdk] = await Promise.all([
              getFirebaseAuth(),
              import('firebase/auth'),
            ])
            if (!auth.currentUser) throw new Error('Sign in again.')
            await sdk.reauthenticateWithPopup(
              auth.currentUser,
              new sdk.GoogleAuthProvider(),
            )
            await auth.currentUser.getIdToken(true)
            const data = await campusAPI('/api/moderator/verification')
            setEnrolled(data.enrolled)
          })
        }
      >
        Confirm Google account
      </button>
      {enrolled === null ? (
        <p role="status">Checking your authenticator…</p>
      ) : !enrolled ? (
        <button
          className="community-primary"
          disabled={busy}
          onClick={() => void run(() => action('enroll'))}
        >
          Set up an authenticator
        </button>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault()
            void run(async () => {
              await action('verify')
              setCode('')
              setQR('')
              setSecret('')
            })
          }}
        >
          {qr && (
            <>
              <p>
                Scan this with your authenticator, then enter its six-digit
                code.
              </p>
              <img
                width={190}
                height={190}
                src={qr}
                alt="Authenticator setup QR code"
              />
              <details>
                <summary>Can’t scan?</summary>
                <p>
                  Enter this setup key in your authenticator. Keep it private.
                </p>
                <code>{secret}</code>
              </details>
            </>
          )}
          <label htmlFor="moderator-code">
            Authenticator code
            <input
              id="moderator-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              required
              value={code}
              onChange={(event) =>
                setCode(event.target.value.replace(/\D/g, ''))
              }
            />
          </label>
          <button
            className="community-primary"
            disabled={busy || code.length !== 6}
          >
            {busy ? 'Verifying…' : 'Verify and open crowd desk'}
          </button>
        </form>
      )}
      {error && (
        <p role="alert" className="community-notice">
          {error}
        </p>
      )}
    </section>
  )
}
