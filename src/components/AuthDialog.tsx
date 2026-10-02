import { useState } from 'react'
import Modal from './Modal'
import { getSupabase, publicBackendConfig } from '../lib/supabase'
export default function AuthDialog({ onClose }: { onClose: () => void }) {
  const [email, setEmail] = useState(''), [busy, setBusy] = useState(false), [message, setMessage] = useState('')
  return <Modal title="Community sign-in" onClose={onClose}>
    {!publicBackendConfig ? <><p>Community persistence is unavailable in demo mode.</p><p className="panel-muted">You can explore the campus and browse clearly labelled demo illustrations. Uploading, likes and reports require a configured Supabase backend.</p></> : <form onSubmit={async (event) => {
      event.preventDefault(); if (busy) return; setBusy(true); setMessage('')
      try { const client = await getSupabase(); const redirect = new URL(window.location.href); redirect.hash = ''; const { error } = await client.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: redirect.href } }); if (error) throw error; setMessage('Check your email for a sign-in link. You can close this window.') }
      catch { setMessage('Unable to send your sign-in link. Check your connection and try again.') } finally { setBusy(false) }
    }}><p>Sign in with an email link to contribute, like and report campus photos.</p><label>Email<input name="email" required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label><button className="navigate-button" disabled={busy || !navigator.onLine}>{busy ? 'Sending…' : 'Send sign-in link'}</button></form>}
    <p role="status">{message}</p>
  </Modal>
}
