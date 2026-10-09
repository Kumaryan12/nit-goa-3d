import { useEffect, useId, useRef, useState } from 'react'
import CampusPopover from './CampusPopover'
import type { CampusLiveSession } from '../hooks/useCampusSession'
import type { CampusPose } from '../lib/campusProtocol'
import { nearbySeat, SOCIAL_LABELS, SOCIAL_SYMBOLS } from '../lib/social'
import type { SocialAction, SocialSeat } from '../lib/social'
import './SocialActions.css'

export default function SocialActions({ live, pose, seats, walking, concert, disabled }: { live: CampusLiveSession; pose: React.RefObject<CampusPose | null>; seats: SocialSeat[]; walking: boolean; concert: boolean; disabled: boolean }) {
  const popover = useRef<HTMLElement>(null)
  const [open, setOpen] = useState(false), container = useRef<HTMLDivElement>(null), toggle = useRef<HTMLButtonElement>(null), id = useId()
  const self = live.people.find(p => p.id === live.session.current.id), social = self?.social, seated = social?.action === 'sit'
  const connected = live.connection === 'live' || live.socialPreview
  const riding = !!self?.ride || (pose.current?.vehicle ?? 'walk') !== 'walk'
  const available = connected && (walking || concert) && !disabled && !seated && (concert || !riding && !pose.current?.moving && !pose.current?.airborne)
  const seat = walking && !riding && pose.current?.space === 'outdoors' ? nearbySeat(seats, pose.current, live.people.flatMap(p => p.social?.seatId ? [p.social.seatId] : [])) : null
  const reason = !connected ? 'Connect through People & chat to share an action.' : disabled ? 'Finish the current activity to use an action.' : !walking && !concert ? 'Start walking or join an OAT concert to use actions.' : riding ? 'Dismount before using an action.' : pose.current?.airborne ? 'Land before using an action.' : pose.current?.moving && !concert ? 'Stand still to use an action.' : concert ? 'Audience reactions keep you in your seat.' : !seat ? 'Walk beside the central aisle or outer edge of the rear OAT benches to sit.' : 'An open bench seat is within reach.'
  useEffect(() => {
    if (!open) return
    const outside = (event: PointerEvent) => { if (event.target instanceof Node && !container.current?.contains(event.target) && !popover.current?.contains(event.target)) setOpen(false) }
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setOpen(false); toggle.current?.focus() } }
    document.addEventListener('pointerdown', outside); document.addEventListener('keydown', escape)
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape) }
  }, [open])
  return <div className="social-actions" ref={container}>
    <button ref={toggle} className="toolbar-button" aria-expanded={open} aria-controls={id} onClick={() => setOpen(v => !v)}><span aria-hidden="true">{social ? SOCIAL_SYMBOLS[social.action] : '👋'}</span> {seated ? 'Seated' : 'Actions'}</button>
    {open && <CampusPopover anchor={container}><section ref={popover} id={id} aria-busy={live.socialPending} className="social-action-panel" aria-labelledby={`${id}-title`}>
      <div className="social-action-heading"><h2 id={`${id}-title`}>Actions</h2><div className="panel-heading-actions">{social && !seated && <button className="text-button social-stop" onClick={() => live.socialAction('stop')}>Stop</button>}<button className="panel-close" aria-label="Close social actions" onClick={() => { setOpen(false); toggle.current?.focus() }}>×</button></div></div>
      <div className="social-action-grid">
        {(['wave', 'dance', 'applause', 'heart', 'cheer'] as SocialAction[]).map(action => <button key={action} className="social-action-tile" aria-label={SOCIAL_LABELS[action]} aria-pressed={social?.action === action} aria-describedby={`${id}-note`} title={!available ? reason : undefined} disabled={!available || live.socialPending} onClick={() => live.socialAction(action)}><span aria-hidden="true">{SOCIAL_SYMBOLS[action]}</span>{SOCIAL_LABELS[action]}</button>)}
        <button className="social-action-tile social-seat-button" aria-label={seated ? 'Stand up' : 'Sit on nearby OAT bench'} aria-describedby={`${id}-note`} aria-busy={live.socialPending} title={seated ? 'Stand up' : !available || !seat || concert ? reason : 'Sit on nearby OAT bench'} disabled={live.socialPending || !seated && (!available || !seat || concert)} onClick={() => seated ? live.socialAction('stop') : seat && live.socialAction('sit', seat.id)}><span aria-hidden="true">{seated ? '↑' : '🪑'}</span>{seated ? 'Stand up' : 'Sit'}</button>
      </div>
      <p id={`${id}-note`} className="social-action-note" role="status">{live.socialError || (live.socialPending ? 'Waiting for the campus to confirm your action…' : seated ? 'Move to stand, or choose Stand up. Your place stays reserved while you sit.' : reason)}</p>
    </section></CampusPopover>}
  </div>
}
