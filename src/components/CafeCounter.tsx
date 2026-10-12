import { useEffect, useId, useRef, useState } from 'react'
import CampusPopover from './CampusPopover'
import type { CampusLiveSession } from '../hooks/useCampusSession'
import type { CampusPose } from '../lib/campusProtocol'
import { CAFE_DRINKS, DRINK_LABELS, nearbyCafeCounter } from '../lib/cafeDrinks'
import type { CafeCounter as Counter } from '../lib/cafeDrinks'
import { nearbySeat } from '../lib/social'
import type { SocialSeat } from '../lib/social'
import './SocialActions.css'
import './CafeCounter.css'

const symbols = { coffee: '☕', 'cold-coffee': '🧋', water: '💧' }
export default function CafeCounter({ live, pose, counters, seats, walking, disabled }: { live: CampusLiveSession; pose: React.RefObject<CampusPose | null>; counters: Counter[]; seats: SocialSeat[]; walking: boolean; disabled: boolean }) {
  const [open, setOpen] = useState(false), [now, setNow] = useState(Date.now())
  const anchor = useRef<HTMLDivElement>(null), popover = useRef<HTMLElement>(null), toggle = useRef<HTMLButtonElement>(null), id = useId()
  const visit = useRef({ offered: false, awaySince: 0 })
  const own = live.people.find(p => p.id === live.session.current.id), drink = own?.drink && own.drink.until > now ? own.drink : undefined
  const near = nearbyCafeCounter(counters, pose.current)
  const onFoot = (pose.current?.vehicle ?? 'walk') === 'walk' && !own?.ride
  const connected = live.connection === 'live' || live.socialPreview
  const stationary = !pose.current?.moving && !pose.current?.airborne
  const ready = connected && walking && onFoot && stationary && !disabled && !live.cafePending && !live.socialPending && !live.ridePending
  const cooling = !!drink && now < Math.max(drink.takenAt, drink.sipAt ?? 0) + 3000
  const seated = own?.social?.action === 'sit' && own.social.until > now && own.social.seatId?.startsWith('cafe-')
  const seat = onFoot && pose.current?.space === 'outdoors' ? nearbySeat(seats, pose.current, live.people.flatMap(p => p.social?.seatId ? [p.social.seatId] : [])) : null
  // Offer the menu once per visit, after stopping. Closing it never changes
  // camera focus or held movement; brief steps at the counter edge don't reopen it.
  useEffect(() => {
    if (!walking) { visit.current = { offered: false, awaySince: 0 }; return }
    if (!near) {
      visit.current.awaySince ||= now
      if (now - visit.current.awaySince >= 3000) visit.current.offered = false
      return
    }
    visit.current.awaySince = 0
    if (ready && !visit.current.offered) { visit.current.offered = true; setOpen(true) }
  }, [walking, !!near, ready, now])
  useEffect(() => {
    if (!walking) return
    const timer = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(timer)
  }, [walking])
  useEffect(() => {
    if (!walking || !near && !drink && !seated || disabled) setOpen(false)
  }, [walking, !!near, !!drink, !!seated, disabled])
  useEffect(() => {
    if (!open) return
    const outside = (event: PointerEvent) => { if (event.target instanceof Node && !anchor.current?.contains(event.target) && !popover.current?.contains(event.target)) setOpen(false) }
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setOpen(false); toggle.current?.focus() } }
    document.addEventListener('pointerdown', outside); document.addEventListener('keydown', escape)
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape) }
  }, [open])
  if (!walking || !near && !drink && !seated) return null
  const sipLabel = drink?.kind === 'water' ? 'Drink water' : drink ? `Sip ${DRINK_LABELS[drink.kind].toLowerCase()}` : 'Take a sip'
  const note = live.cafeError || live.socialError || (live.cafePending ? 'Preparing your drink…' : live.socialPending ? 'Confirming your seat…' : !connected ? 'Sign in and join the live campus to order.' : !onFoot ? 'Dismount to order.' : !stationary ? 'Stop for a moment to order or take a sip.' : disabled ? 'Finish the current activity first.' : drink ? `${DRINK_LABELS[drink.kind]} in hand.${seated ? ' Enjoy your seat.' : seat ? ' A chair is within reach.' : near ? ' Walk beside a chair to sit.' : ''}` : seated ? 'Enjoy your seat. Choose a drink at the counter.' : 'Drinks are on the house. Walk beside a chair to sit.')
  return <div className="social-actions cafe-counter" ref={anchor}>
    <button ref={toggle} className="toolbar-button" aria-expanded={open} aria-controls={id} onClick={() => setOpen(v => !v)}>{drink ? symbols[drink.kind] : '☕'} {drink ? DRINK_LABELS[drink.kind] : 'Nescafé'}</button>
    {open && <CampusPopover anchor={anchor}><section ref={popover} id={id} className="social-action-panel cafe-menu" aria-labelledby={`${id}-title`} aria-busy={live.cafePending}>
      <div className="social-action-heading"><h2 id={`${id}-title`}>At Nescafé</h2><button className="panel-close" aria-label="Close café menu" onClick={() => { setOpen(false); toggle.current?.focus() }}>×</button></div>
      {near && <div className="social-action-grid cafe-drink-choices" role="group" aria-label="Choose a drink">{CAFE_DRINKS.map(kind => <button key={kind} className="social-action-tile" aria-pressed={drink?.kind === kind} disabled={!ready || cooling} onClick={() => live.requestDrink('get', kind)} aria-label={`Get ${DRINK_LABELS[kind].toLowerCase()}`}><span aria-hidden="true">{symbols[kind]}</span>{DRINK_LABELS[kind]}</button>)}</div>}
      {drink && <div className="cafe-drink-actions"><button disabled={!ready || cooling} onClick={() => live.requestDrink('sip')}>{sipLabel}</button><button disabled={live.cafePending} onClick={() => live.requestDrink('put-away')}>Put away</button></div>}
      {(near || seat || seated) && <div className="cafe-drink-actions cafe-seat-action"><button disabled={!ready || !seated && !seat} title={!seated && !seat ? 'Walk beside an unoccupied café chair.' : undefined} onClick={() => seated ? live.socialAction('stop') : seat && live.socialAction('sit', seat.id)}><span aria-hidden="true">{seated ? '↑' : '🪑'}</span> {seated ? 'Stand up' : 'Sit at a table'}</button></div>}
      <p className="social-action-note" role="status">{note}</p>
    </section></CampusPopover>}
  </div>
}
