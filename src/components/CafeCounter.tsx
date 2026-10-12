import { useEffect, useId, useRef, useState } from 'react'
import CampusPopover from './CampusPopover'
import type { CampusLiveSession } from '../hooks/useCampusSession'
import type { CampusPose } from '../lib/campusProtocol'
import { CAFE_DRINKS, DRINK_LABELS, nearbyCafeCounter } from '../lib/cafeDrinks'
import type { CafeCounter as Counter } from '../lib/cafeDrinks'
import './SocialActions.css'
import './CafeCounter.css'

const symbols = { coffee: '☕', 'cold-coffee': '🧋', water: '💧' }
export default function CafeCounter({ live, pose, counters, walking, disabled }: { live: CampusLiveSession; pose: React.RefObject<CampusPose | null>; counters: Counter[]; walking: boolean; disabled: boolean }) {
  const [open, setOpen] = useState(false), [now, setNow] = useState(Date.now())
  const anchor = useRef<HTMLDivElement>(null), popover = useRef<HTMLElement>(null), toggle = useRef<HTMLButtonElement>(null), id = useId()
  const own = live.people.find(p => p.id === live.session.current.id), drink = own?.drink && own.drink.until > now ? own.drink : undefined
  const near = nearbyCafeCounter(counters, pose.current)
  const onFoot = (pose.current?.vehicle ?? 'walk') === 'walk' && !own?.ride
  const connected = live.connection === 'live' || live.socialPreview
  const stationary = !pose.current?.moving && !pose.current?.airborne
  const ready = connected && walking && onFoot && stationary && !disabled && !live.cafePending && !live.socialPending && !live.ridePending
  const cooling = !!drink && now < Math.max(drink.takenAt, drink.sipAt ?? 0) + 3000
  useEffect(() => {
    if (!walking) return
    const timer = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(timer)
  }, [walking])
  useEffect(() => {
    if (!walking || !near && !drink) setOpen(false)
  }, [walking, !!near, !!drink])
  useEffect(() => {
    if (!open) return
    const outside = (event: PointerEvent) => { if (event.target instanceof Node && !anchor.current?.contains(event.target) && !popover.current?.contains(event.target)) setOpen(false) }
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setOpen(false); toggle.current?.focus() } }
    document.addEventListener('pointerdown', outside); document.addEventListener('keydown', escape)
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape) }
  }, [open])
  if (!walking || !near && !drink) return null
  const note = live.cafeError || (live.cafePending ? 'Getting your drink…' : !connected ? 'Sign in and join the live campus to order.' : !onFoot ? 'Dismount to order.' : !stationary ? 'Stop for a moment to order or take a sip.' : disabled ? 'Finish the current activity first.' : drink ? `${DRINK_LABELS[drink.kind]} in hand · enjoy it at a table.` : 'On the house. Choose your drink.')
  return <div className="social-actions cafe-counter" ref={anchor}>
    <button ref={toggle} className="toolbar-button" aria-expanded={open} aria-controls={id} onClick={() => setOpen(v => !v)}>{drink ? symbols[drink.kind] : '☕'} {drink ? DRINK_LABELS[drink.kind] : 'Nescafé'}</button>
    {open && <CampusPopover anchor={anchor}><section ref={popover} id={id} className="social-action-panel cafe-menu" aria-labelledby={`${id}-title`} aria-busy={live.cafePending}>
      <div className="social-action-heading"><h2 id={`${id}-title`}>Coffee break</h2><button className="panel-close" aria-label="Close café menu" onClick={() => { setOpen(false); toggle.current?.focus() }}>×</button></div>
      {near && <div className="social-action-grid cafe-drink-choices">{CAFE_DRINKS.map(kind => <button key={kind} className="social-action-tile" disabled={!ready || cooling} onClick={() => live.requestDrink('get', kind)} aria-label={`Get ${DRINK_LABELS[kind].toLowerCase()}`}><span aria-hidden="true">{symbols[kind]}</span>{DRINK_LABELS[kind]}</button>)}</div>}
      {drink && <div className="cafe-drink-actions"><button disabled={!ready || cooling} onClick={() => live.requestDrink('sip')}>Take a sip</button><button disabled={live.cafePending} onClick={() => live.requestDrink('put-away')}>Put away</button></div>}
      <p className="social-action-note" role="status">{note}</p>
    </section></CampusPopover>}
  </div>
}
