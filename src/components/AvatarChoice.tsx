import { useState } from 'react'
import { campusAPI } from '../lib/firebase'
import { isAvatarStyle } from '../lib/profile'
import type { AvatarStyle } from '../lib/profile'
import NitGoaLogo from './NitGoaLogo'
import AvatarStylePicker from './AvatarStylePicker'

export default function AvatarChoice({ onSaved, onBack }: { onSaved: (style: AvatarStyle) => void; onBack: () => void }) {
  const [choice, setChoice] = useState<AvatarStyle | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState('')
  return <main className="avatar-onboarding">
    <header className="avatar-onboarding-header"><span className="avatar-onboarding-brand"><NitGoaLogo /> NITG <b>Explored</b></span><button type="button" className="text-button" onClick={onBack} disabled={busy}>← Back</button></header>
    <form className="avatar-onboarding-form" onSubmit={async event => {
      event.preventDefault()
      if (!choice || busy) return
      setBusy(true); setError('')
      try {
        const saved = await campusAPI('/api/me/avatar', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ avatar_style: choice }) })
        if (!isAvatarStyle(saved?.avatar_style)) throw new Error('Your avatar could not be saved. Try again.')
        onSaved(saved.avatar_style)
      } catch { setError('Your avatar could not be saved. Check your connection and try again.') }
      finally { setBusy(false) }
    }}>
      <span className="community-kicker">MEET YOUR CAMPUS SELF</span>
      <h1>Make an entrance.</h1>
      <p>Would you like a girl or boy avatar?</p>
      <AvatarStylePicker value={choice} onChange={setChoice} disabled={busy} />
      <button className="community-primary avatar-choice-continue" disabled={!choice || busy} aria-busy={busy}>{busy ? 'Saving your avatar…' : 'Enter campus ↗'}</button>
      {error && <p className="community-notice" role="alert">{error}</p>}
      <small>Change it anytime in My profile.</small>
    </form>
  </main>
}
