import { useEffect, useId, useRef, useState } from 'react'
import type { CampusLiveSession } from '../hooks/useCampusSession'
import type { CampusPose } from '../lib/campusProtocol'
import { nearbySeat, SOCIAL_LABELS, SOCIAL_SYMBOLS } from '../lib/social'
import type { SocialAction, SocialSeat } from '../lib/social'
import './SocialActions.css'

export default function SocialActions({ live, pose, seats, walking, concert, disabled }: { live: CampusLiveSession; pose: React.RefObject<CampusPose | null>; seats: SocialSeat[]; walking: boolean; concert: boolean; disabled: boolean }) {
  const [open, setOpen] = useState(false), container = useRef<HTMLDivElement>(null), toggle = useRef<HTMLButtonElement>(null), id = useId()
  const self = live.people.find(p => p.id === live.session.current.id), social = self?.social, seated = social?.action === 'sit'
  const connected = live.connection === 'live' || live.socialPreview
  const riding = !!self?.ride || (pose.current?.vehicle ?? 'walk') !== 'walk'
  const available = connected && (walking || concert) && !disabled && !seated && (concert || !riding && !pose.current?.moving && !pose.current?.airborne)
  const seat = walking && !riding && pose.current?.space === 'outdoors' ? nearbySeat(seats, pose.current, live.people.flatMap(p => p.social?.seatId ? [p.social.seatId] : [])) : null
  useEffect(() => {
    if (!open) return
    const outside = (event: PointerEvent) => { if (event.target instanceof Node && !container.current?.contains(event.target)) setOpen(false) }
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setOpen(false); toggle.current?.focus() } }
    document.addEventListener('pointerdown', outside); document.addEventListener('keydown', escape)
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape) }
  }, [open])
  return <div className="social-actions" ref={container}>
    <button ref={toggle} className="toolbar-button" aria-expanded={open} aria-controls={id} onClick={() => setOpen(v => !v)}><span aria-hidden="true">{social ? SOCIAL_SYMBOLS[social.action] : '👋'}</span> {seated ? 'Seated' : 'Actions'}</button>
    {open && <section id={id} className="social-action-panel" aria-labelledby={`${id}-title`}>
      <div className="social-action-heading"><div><span className="eyebrow">A campus, together</span><h2 id={`${id}-title`}>Say it with a gesture</h2></div><button className="panel-close" aria-label="Close social actions" onClick={() => { setOpen(false); toggle.current?.focus() }}>×</button></div>
      <p>{live.socialPreview ? 'Try a gesture in your local preview.' : concert ? 'Cheer on the stage. Everyone at the OAT can see your reaction.' : 'Wave to a friend, celebrate, or take a seat at the OAT.'}</p>
      <div className="social-action-grid">
        {(['wave', 'dance', 'applause', 'heart', 'cheer'] as SocialAction[]).map(action => <button key={action} className="social-action-tile" aria-label={SOCIAL_LABELS[action]} aria-pressed={social?.action === action} disabled={!available || live.socialPending} onClick={() => live.socialAction(action)}><span aria-hidden="true">{SOCIAL_SYMBOLS[action]}</span>{SOCIAL_LABELS[action]}</button>)}
      </div>
      {seated ? <button className="navigate-button" disabled={live.socialPending} onClick={() => live.socialAction('stop')}>Stand up</button>
        : <button className="fly-button social-seat-button" disabled={!available || !seat || concert || live.socialPending} onClick={() => seat && live.socialAction('sit', seat.id)}>Sit on nearby OAT bench</button>}
      {social && !seated && <button className="text-button social-stop" onClick={() => live.socialAction('stop')}>Stop action</button>}
      <p className="social-action-note" role="status">{live.socialError || (!connected ? 'Connect through People & chat to share an action.' : disabled ? 'Finish the current activity to use an action.' : seated ? 'Move to stand, or choose Stand up. Your place stays reserved while you sit.' : !walking && !concert ? 'Start walking or join an OAT concert to use actions.' : riding ? 'Dismount before choosing a gesture.' : pose.current?.moving && !concert ? 'Stand still to start a gesture.' : concert ? 'Audience reactions keep you in your seat.' : seat ? 'An open bench seat is within reach.' : 'Find a seat beside the central aisle or outer edge of the rear OAT benches.')}</p>
    </section>}
  </div>
}
