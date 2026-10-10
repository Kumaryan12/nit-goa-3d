import { useEffect, useId, useRef, useState } from 'react'
import { CAMPUS_CAPACITY, CAMPUS_COLORS, canHearNearby, chatText } from '../lib/campusProtocol'
import type { CampusLiveSession } from '../hooks/useCampusSession'
import type { CampusPose } from '../lib/campusProtocol'
import { usePeopleFinder } from '../hooks/usePeopleFinder'
import type { FinderLandmark } from '../lib/peopleFinder'
import { initials, avatarTextColor } from '../lib/profile'
const activities = { walk: 'Walking around', overview: 'Exploring the map', football: 'Playing football', concert: 'At the OAT' }
export default function CampusSocial({ live, open, onClose, pose, walking, landmarks, finderEnabled, onToggleFinder, targetId, onFind }: { landmarks: FinderLandmark[]; finderEnabled: boolean; onToggleFinder: () => void; targetId: string | null; onFind: (id: string) => void; live: CampusLiveSession; open: boolean; onClose: () => void; pose: React.RefObject<CampusPose | null>; walking: boolean }) {
  const located = usePeopleFinder(live.session, pose, landmarks, live.muted, open && walking && finderEnabled)
  const [collapsed, setCollapsed] = useState(false), contentId = useId()
  const [tab, setTab] = useState<'chat' | 'people'>('chat'), [scope, setScope] = useState<'campus' | 'nearby'>('campus'), [text, setText] = useState('')
  const [sending, setSending] = useState(false), [deliveryError, setDeliveryError] = useState('')
  const pending = useRef<{ text: string; known: Set<string> } | null>(null)
  const { muted, toggleMute } = live
  const bottom = useRef<HTMLDivElement>(null), composer = useRef<HTMLInputElement>(null), lastSend = useRef(0)
  const self = live.session.current.id, near = walking && !!pose.current?.visible
  const messages = live.messages.filter(m => m.scope === scope && !muted.has(m.sender))
  useEffect(() => { if (open && tab === 'chat') bottom.current?.scrollIntoView({ block: 'nearest' }) }, [live.messages, open, scope, tab])
  useEffect(() => { if (!near && scope === 'nearby') setScope('campus') }, [near, scope])
  useEffect(() => {
    if (pending.current && live.messages.some(m => m.sender === self && m.text === pending.current!.text && !pending.current!.known.has(m.id))) { const sent = pending.current.text; pending.current = null; setText(current => chatText(current) === sent ? '' : current); setSending(false) }
  }, [live.messages, self])
  useEffect(() => { if (live.error || live.connection !== 'live') { pending.current = null; setSending(false) } }, [live.error, live.connection])
  useEffect(() => { if (!sending) return; const timer = setTimeout(() => { pending.current = null; setSending(false); setDeliveryError('Delivery has not been confirmed. Your message is still here; check the connection before retrying.') }, 5000); return () => clearTimeout(timer) }, [sending])
  if (!open) return null
  return <aside className={`campus-social ${collapsed ? 'panel-collapsed' : ''}`} aria-label="Live campus people and chat" onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); onClose() } }}>
    <div className="campus-social-heading"><h2>People &amp; chat</h2><div className="panel-heading-actions"><button className="panel-collapse" aria-expanded={!collapsed} aria-controls={contentId} aria-label={collapsed ? 'Expand campus chat' : 'Minimize campus chat'} onClick={() => setCollapsed(value => !value)}>{collapsed ? 'Expand' : '−'}</button><button className="panel-close" aria-label="Close campus chat" onClick={onClose}>×</button></div></div>
    <div id={contentId} className="campus-social-content" hidden={collapsed}>
    <p className="campus-social-status" role="status"><i className={live.connection === 'live' ? 'connected' : ''} />{live.connection === 'live' ? `${live.people.length} / ${CAMPUS_CAPACITY} here now` : live.connection === 'waiting' ? `Campus is full · Queue position ${live.queue}` : live.connection === 'reconnecting' ? 'Reconnecting to the live campus…' : live.connection === 'connecting' ? 'Joining the live campus…' : live.connection === 'idle' ? 'Live campus needs Google sign-in' : 'Live connection is offline'}</p>
    {live.connection === 'offline' && <button className="navigate-button" onClick={live.rejoin}>Rejoin live campus ↗</button>}
    {(live.error || deliveryError) && <div className="campus-chat-error" role="alert">{live.error || deliveryError}<button aria-label="Dismiss chat notice" onClick={() => { live.clearError(); setDeliveryError('') }}>×</button></div>}
    <div className="campus-social-tabs" role="group" aria-label="Campus social panel"><button aria-pressed={tab === 'chat'} onClick={() => setTab('chat')}>Conversation</button><button aria-pressed={tab === 'people'} onClick={() => setTab('people')}>People · {live.people.length}</button></div>
    {tab === 'people' ? <div className="campus-people-list">
      {walking && <div className="finder-settings"><label><input type="checkbox" checked={finderEnabled} onChange={onToggleFinder}/>Show people finder</label><label><input type="checkbox" checked={live.shareLocator} onChange={event => live.setShareLocator(event.target.checked)}/>Show my finder location</label><p className="campus-social-note">On by default. When your location is hidden, nearby avatars stay visible. Mute hides a person’s messages and finder marker for this visit.</p>{live.locatorError && <p role="alert" className="campus-chat-error">{live.locatorError}</p>}</div>}
      <p className="campus-social-note">Public profiles open in a new tab.</p>{live.people.map(person => { const location = located.find(p => p.person.id === person.id); return <div key={person.id} className="campus-person-row">
      <span className="campus-person-initials" style={{ background: CAMPUS_COLORS[person.color], color: avatarTextColor(person.color) }}>{initials(person.name)}</span>
      <div className="campus-person-info">{person.handle ? <a href={`/people/${person.handle}`} target="_blank" rel="noopener noreferrer">{person.name} ↗</a> : <strong>{person.name}</strong>}<small>{person.id === self ? 'You · ' : ''}{activities[person.activity]}{walking && canHearNearby(pose.current, person.pose) && person.id !== self ? ' · Nearby' : ''}</small>{walking && person.id !== self && <small>{location ? `${location.location} · ${Math.round(location.distance)} m` : person.locatorVisible === false ? 'Finder location hidden' : 'Location unavailable'}</small>}</div>
      {person.id !== self && <div className="campus-person-actions">{walking && <button className="campus-find" disabled={!location} aria-pressed={targetId === person.id} onClick={() => onFind(person.id)}>Find</button>}<button className="campus-mute" aria-pressed={muted.has(person.id)} aria-label={`${muted.has(person.id) ? 'Unmute' : 'Mute'} ${person.name}`} onClick={() => toggleMute(person.id)}>{muted.has(person.id) ? 'Unmute' : 'Mute'}</button></div>}
    </div> })}{!live.people.length && <div className="campus-social-empty">People will appear here when the live connection is ready.</div>}</div> : <>
      <div className="campus-chat-channel"><label htmlFor="campus-chat-scope">Send to</label><select id="campus-chat-scope" value={scope} onChange={event => setScope(event.target.value as typeof scope)}><option value="campus">Everyone on campus</option><option value="nearby" disabled={!near}>Nearby · within 35 m</option></select></div>
      <div className="campus-chat-log" role="log" aria-label={`${scope === 'campus' ? 'Campus' : 'Nearby'} conversation`} aria-live="polite" aria-relevant="additions text">
        {!messages.length && <div className="campus-social-empty"><span>✦</span><h3>{scope === 'campus' ? 'A hello goes a long way.' : 'Meet the people around you.'}</h3><p>{scope === 'campus' ? 'Say hi, invite someone to football, or find your friends at the OAT.' : 'Only people within 35 m on your floor receive these messages.'}</p></div>}
        {messages.map(message => <article key={message.id} className={`campus-chat-message ${message.sender === self ? 'from-self' : ''}`}><div><strong>{message.sender === self ? 'You' : message.name}</strong><time dateTime={new Date(message.time).toISOString()}>{new Date(message.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time></div><p>{message.text}</p></article>)}<div ref={bottom} />
      </div>
      <form className="campus-chat-composer" onSubmit={event => { event.preventDefault(); if (sending || Date.now() - lastSend.current < 1000) return; if (live.sendChat(text, scope)) { pending.current = { text: chatText(text)!, known: new Set(live.messages.map(m => m.id)) }; setDeliveryError(''); lastSend.current = Date.now(); setSending(true); composer.current?.focus() } }}>
        <label className="sr-only" htmlFor="campus-chat-message">Your message</label><input ref={composer} id="campus-chat-message" value={text} onChange={event => setText(event.target.value)} maxLength={280} autoComplete="off" placeholder="Say hello…" disabled={live.connection !== 'live'} /><button type="submit" aria-label="Send chat message" disabled={live.connection !== 'live' || !text.trim() || sending}>{sending ? '…' : '↑'}</button>
      </form><p className="campus-social-note">{scope === 'campus' ? 'Shared with everyone in this room. Recent chat lasts for this live session.' : 'Nearby messages are live only. Walk mode is needed to send.'} Be kind. Keep personal details private.</p>
    </>}
    </div>
  </aside>
}
