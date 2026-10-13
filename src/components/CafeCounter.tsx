import Modal from './Modal'
import { createPortal } from 'react-dom'
import { useCafeVoice } from '../hooks/useCafeVoice'
import { cafeSeatTable } from '../lib/cafeVoiceProtocol'
import CafeTableVoice from './CafeTableVoice'
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
  const seated = own?.social?.action === 'sit' && own.social.until > now && cafeSeatTable(own.social.seatId) !== null
  const voice = useCafeVoice(live, seated ? own?.social?.seatId : undefined, !!seated && walking && !disabled && live.connection === 'live')
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
  useEffect(() => { if (seated) setOpen(true) }, [seated, own?.social?.seatId])
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
  // Keep the confirmation visible after walking away, even when the café
  // controls disappear or the campus toolbar is hidden.
  const leaveNotice = voice.leaveNotice && createPortal(<div className="cafe-voice-leave-notice" role="status">
    <span>{voice.leaveNotice}</span><button aria-label="Dismiss conversation message" onClick={voice.dismissLeaveNotice}>×</button>
  </div>, anchor.current?.closest('.explorer') ?? document.querySelector('.explorer') ?? document.body)
  const leaveConfirmation = voice.leaveConfirmation && createPortal(<Modal title="Do you want to leave the conversation?" className="cafe-leave-confirmation" onClose={voice.cancelLeave}>
    <p>{voice.leaveConfirmation === 'stand' ? 'You’ll leave table voice and stand up.' : 'Your microphone and table audio will stop.'}</p>
    <div className="cafe-drink-actions"><button autoFocus onClick={voice.cancelLeave}>{voice.leaveConfirmation === 'stand' ? 'Stay seated' : 'Stay in conversation'}</button><button onClick={voice.confirmLeave}>{voice.leaveConfirmation === 'stand' ? 'Leave and stand up' : 'Leave conversation'}</button></div>
  </Modal>, anchor.current?.closest('.explorer') ?? document.querySelector('.explorer') ?? document.body)
  if (!walking || !near && !drink && !seated) return <>{leaveNotice}{leaveConfirmation}</>
  const sipLabel = drink?.kind === 'water' ? 'Drink water' : drink ? `Sip ${DRINK_LABELS[drink.kind].toLowerCase()}` : 'Take a sip'
  const note = live.cafeError || live.socialError || (live.cafePending ? 'Preparing your drink…' : live.socialPending ? 'Confirming your seat…' : !connected ? 'Sign in and join the live campus to order.' : !onFoot ? 'Dismount to order.' : !stationary ? 'Stop for a moment to order or take a sip.' : disabled ? 'Finish the current activity first.' : drink ? `${DRINK_LABELS[drink.kind]} in hand.${seated ? ' Enjoy your seat.' : seat ? ' A chair is within reach.' : near ? ' Walk beside a chair to sit.' : ''}` : seated ? 'Choose a drink, take a sip and chat with your table.' : 'Drinks are on the house. Walk beside a chair to sit.')
  return <>{leaveNotice}{leaveConfirmation}<div className="social-actions cafe-counter" ref={anchor}>
    <button ref={toggle} className="toolbar-button" aria-expanded={open} aria-controls={id} onClick={() => setOpen(v => !v)}>{drink ? symbols[drink.kind] : '☕'} {drink ? DRINK_LABELS[drink.kind] : 'Nescafé'}{voice.view.mic && <span className="cafe-mic-indicator" aria-label="Table microphone on">●</span>}</button>
    {open && <CampusPopover anchor={anchor}><section ref={popover} id={id} className="social-action-panel cafe-menu" aria-labelledby={`${id}-title`} aria-busy={live.cafePending}>
      <div className="social-action-heading"><h2 id={`${id}-title`}>At Nescafé</h2><button className="panel-close" aria-label="Close café menu" onClick={() => { setOpen(false); toggle.current?.focus() }}>×</button></div>
      {(near || seated) && <div className="social-action-grid cafe-drink-choices" role="group" aria-label="Choose a drink">{CAFE_DRINKS.map(kind => <button key={kind} className="social-action-tile" aria-pressed={drink?.kind === kind} disabled={!ready || cooling} onClick={() => live.requestDrink('get', kind)} aria-label={`Get ${DRINK_LABELS[kind].toLowerCase()}`}><span aria-hidden="true">{symbols[kind]}</span>{DRINK_LABELS[kind]}</button>)}</div>}
      {drink && <div className="cafe-drink-actions"><button disabled={!ready || cooling} onClick={() => live.requestDrink('sip')}>{sipLabel}</button><button disabled={live.cafePending} onClick={() => live.requestDrink('put-away')}>Put away</button></div>}
      {(near || seat || seated) && <div className="cafe-drink-actions cafe-seat-action"><button disabled={!ready || !seated && !seat} title={!seated && !seat ? 'Walk beside an unoccupied café chair.' : undefined} onClick={() => { if (seated) { live.socialAction('stop') } else if (seat) live.socialAction('sit', seat.id) }}><span aria-hidden="true">{seated ? '↑' : '🪑'}</span> {seated ? 'Stand up' : 'Sit at a table'}</button></div>}
      {seated && <CafeTableVoice voice={voice} enabled={live.connection === 'live' && !disabled} ownId={live.session.current.id} />}
      <p className="social-action-note" role="status">{note}</p>
    </section></CampusPopover>}
  </div>
    {(voice.view.mic || voice.view.pending) && createPortal(<div className="cafe-voice-pill" role="group" aria-label="Active table microphone">
      <span>{voice.view.mic ? '● Table mic on' : 'Connecting table voice…'}</span>
      <button onClick={voice.view.mic ? voice.muteMic : voice.leave} aria-label={voice.view.mic ? 'Mute table microphone' : 'Cancel table voice'}>{voice.view.mic ? 'Mute' : 'Cancel'}</button>
    </div>, anchor.current?.closest('.explorer') ?? document.body)}
  </>
}
