import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { authenticateLiveSocket } from '../lib/liveAuth'
import { campusId, chatText, parseCampusChat, parseCampusSnapshot, publishedCampusPose } from '../lib/campusProtocol'
import type { CampusActivity, CampusChat, CampusPerson, CampusPose, CampusSession } from '../lib/campusProtocol'
import { isSocialAction, nearbySeat, SOCIAL_DURATION } from '../lib/social'
import type { SocialAction, SocialSeat } from '../lib/social'
import { defaultAvatarColor } from '../lib/profile'
export type CampusConnection = 'idle' | 'connecting' | 'waiting' | 'live' | 'offline'
export function useCampusSession(enabled: boolean, pose: React.RefObject<CampusPose | null>, walking: boolean, activity: CampusActivity, preview = false, seats: SocialSeat[] = []) {
  const session = useRef<CampusSession>({ id: null, snapshot: null }), socket = useRef<WebSocket | null>(null)
  const mode = useRef({ walking, activity }); mode.current = { walking, activity }
  const [connection, setConnection] = useState<CampusConnection>('idle'), [people, setPeople] = useState<CampusPerson[]>([])
  const [messages, setMessages] = useState<CampusChat[]>([]), [error, setError] = useState(''), [queue, setQueue] = useState(0), [retry, setRetry] = useState(0)
  const [rideError, setRideError] = useState('')
  const [socialError, setSocialError] = useState(''), [socialPending, setSocialPending] = useState(false)
  const previewAction = useRef<((action: SocialAction | 'stop', seatId?: string) => boolean) | null>(null), seatsRef = useRef(seats); seatsRef.current = seats
  const [muted, setMuted] = useState<Set<string>>(() => new Set())
  const visibleMessages = useMemo(() => messages.filter(m => !muted.has(m.sender)), [messages, muted])
  useEffect(() => {
    if (!enabled && preview && import.meta.env.DEV) {
      // The existing development-only campus preview has no network identity.
      // Keep its gestures local so the same controls can be checked offline.
      const person: CampusPerson = { id: 'local-preview', name: 'Preview', handle: null, color: defaultAvatarColor('local-preview'), activity: 'walk', pose: null }
      let sequence = 0, origin: CampusPose | null = null, lastAction = 0
      const publish = (roster = false) => { session.current = { id: person.id, snapshot: { type: 'campus-state', sequence: ++sequence, serverTime: Date.now(), people: [{ ...person }] } }; if (roster) setPeople([{ ...person }]) }
      const stop = () => { if (origin) { person.pose = { ...origin, epoch: Math.max(origin.epoch, person.pose?.epoch ?? 0) + 1 }; pose.current = person.pose; origin = null } delete person.social; publish(true) }
      previewAction.current = (action, seatId) => {
        setSocialError('')
        if (action === 'stop') { stop(); return true }
        const current = pose.current, now = Date.now()
        if (!isSocialAction(action) || !mode.current.walking || !current || current.moving || current.airborne || (current.vehicle ?? 'walk') !== 'walk') { setSocialError('Stand still on foot to use an action.'); return false }
        if (now - lastAction < 650) { setSocialError('Give that action a moment.'); return false }
        if (person.social?.action === 'sit') { setSocialError('Stand up before choosing another action.'); return false }
        const seat = action === 'sit' ? nearbySeat(seatsRef.current.filter(s => s.id === seatId), current) : null
        if (action === 'sit' && (!seat || current.space !== 'outdoors')) { setSocialError('Walk closer to a rear OAT bench.'); return false }
        if (seat) { origin = { ...current }; person.pose = { ...current, x: seat.x, y: seat.y, z: seat.z, yaw: seat.yaw, epoch: current.epoch + 1, moving: false, running: false }; pose.current = person.pose }
        person.social = { action, startedAt: now, until: now + SOCIAL_DURATION[action], ...(seat ? { seatId: seat.id } : {}) }
        lastAction = now; publish(true); return true
      }
      setConnection('idle'); setPeople([]); setSocialError(''); setSocialPending(false); publish(true)
      const timer = window.setInterval(() => {
        if (person.social && (Date.now() >= person.social.until || !mode.current.walking || document.hidden || person.social.action !== 'sit' && (pose.current?.moving || pose.current?.airborne))) stop()
        if (person.social?.action !== 'sit') person.pose = pose.current ? { ...pose.current, visible: mode.current.walking } : null
        person.activity = mode.current.activity; publish()
      }, 100)
      return () => { clearInterval(timer); previewAction.current = null; session.current = { id: null, snapshot: null }; setPeople([]) }
    }
    if (!enabled) { setConnection('idle'); setPeople([]); setMessages([]); session.current = { id: null, snapshot: null }; return }
    let active = true, initialized = false, rosterKey = '', stopAuth = () => {}
    setRideError(''); setSocialError(''); setSocialPending(false); setConnection('connecting'); setPeople([]); setMessages([]); setError(''); setQueue(0); session.current = { id: null, snapshot: null }
    const url = new URL('/presence', window.location.href); url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
    const ws = new WebSocket(url); socket.current = ws
    const timeout = window.setTimeout(() => { if (!initialized) { setError('The live campus did not respond. Rejoin to try again.'); ws.close() } }, 20000)
    ws.onopen = () => { stopAuth = authenticateLiveSocket(ws) }
    const addMessage = (message: CampusChat) => setMessages(previous => previous.some(m => m.id === message.id) ? previous : [...previous.filter(m => Date.now() - m.time < 15 * 60000), message].slice(-80))
    ws.onmessage = event => {
      if (!active || typeof event.data !== 'string' || event.data.length > 131072) return
      let value
      try { value = JSON.parse(event.data) } catch { return }
      if (!value || typeof value !== 'object') return
      if (value.type === 'waiting' && Number.isInteger(value.position) && value.position > 0 && value.position <= 100) { clearTimeout(timeout); setQueue(value.position); setConnection('waiting'); return }
      if (value.type === 'buggy-result') { setRideError(typeof value.error === 'string' ? value.error.slice(0, 240) : ''); return }
      if (value.type === 'social-result') { setSocialPending(false); setSocialError(typeof value.error === 'string' ? value.error.slice(0, 240) : ''); return }
      if (value.type === 'error' || value.type === 'notice') { if (typeof value.message === 'string') setError(value.message.slice(0, 240)); return }
      if (value.type === 'campus-welcome' && campusId(value.id) && Array.isArray(value.history) && value.history.length <= 50) {
        session.current.id = value.id; initialized = true; clearTimeout(timeout); setConnection('live'); setQueue(0); setError('')
        setMessages(value.history.map(parseCampusChat).filter((m: CampusChat | null): m is CampusChat => !!m && m.scope === 'campus'))
        return
      }
      if (!initialized) return
      if (value.type === 'chat-remove' && campusId(value.sender)) { setMessages(previous => previous.filter(m => m.sender !== value.sender)); return }
      const message = parseCampusChat(value)
      if (message) { addMessage(message); return }
      const snapshot = parseCampusSnapshot(value)
      if (!snapshot || (session.current.snapshot && snapshot.sequence <= session.current.snapshot.sequence)) return
      session.current.snapshot = snapshot
      // Per-frame poses stay in a ref; names/activity update React only as needed.
      const key = JSON.stringify(snapshot.people.map(p => [p.id, p.name, p.handle, p.color, p.activity, p.pose?.space, p.pose?.visible, p.pose?.vehicle, p.ride?.driverId, p.ride?.seat, p.social?.action, p.social?.startedAt, p.social?.seatId]))
      if (key !== rosterKey) { rosterKey = key; setPeople(snapshot.people) }
    }
    ws.onerror = () => { if (active) setError('The live connection was interrupted. Rejoin to try again.') }
    ws.onclose = () => { clearTimeout(timeout); if (active) { setConnection('offline'); setPeople([]); setSocialPending(false); session.current = { id: null, snapshot: null } } }
    const publish = () => {
      if (!initialized || ws.readyState !== WebSocket.OPEN || ws.bufferedAmount > 16384) return
      const current = pose.current
      if (!current) return
      const focused = !document.hidden && document.hasFocus()
      ws.send(JSON.stringify({ type: 'pose', activity: mode.current.activity, pose: publishedCampusPose(current, mode.current.walking, mode.current.activity, focused) }))
    }
    const timer = window.setInterval(publish, 100)
    window.addEventListener('blur', publish); document.addEventListener('visibilitychange', publish)
    return () => { active = false; stopAuth(); clearInterval(timer); clearTimeout(timeout); window.removeEventListener('blur', publish); document.removeEventListener('visibilitychange', publish); ws.close(); socket.current = null; session.current = { id: null, snapshot: null } }
  }, [enabled, retry, pose, preview])
  const sendChat = useCallback((text: string, scope: 'campus' | 'nearby') => {
    const clean = chatText(text), ws = socket.current
    if (!clean || !session.current.id || ws?.readyState !== WebSocket.OPEN || ws.bufferedAmount > 16384) { setError('Connect to the live campus and write a message to send.'); return false }
    setError(''); ws.send(JSON.stringify({ type: 'chat', text: clean, scope })); return true
  }, [])
  const rideBuggy = useCallback((driverId: string | null) => {
    const ws = socket.current
    if (!session.current.id || ws?.readyState !== WebSocket.OPEN || ws.bufferedAmount > 16384) { setRideError('Connect to the live campus to share a buggy.'); return }
    if (driverId !== null && !campusId(driverId)) return
    setRideError(''); ws.send(JSON.stringify({ type: 'buggy-ride', driverId }))
  }, [])
  const socialAction = useCallback((action: SocialAction | 'stop', seatId?: string) => {
    if (previewAction.current) return previewAction.current(action, seatId)
    const ws = socket.current
    if (!session.current.id || ws?.readyState !== WebSocket.OPEN || ws.bufferedAmount > 16384) { setSocialError('Connect to the live campus to share an action.'); return false }
    setSocialError(''); setSocialPending(true); ws.send(JSON.stringify({ type: 'social-action', action, ...(seatId ? { seatId } : {}) })); return true
  }, [])
  return { socialAction, socialError, socialPending, socialPreview: preview && !enabled && import.meta.env.DEV, rideBuggy, rideError, connection, people, messages: visibleMessages, muted, toggleMute: (id: string) => setMuted(previous => { const next = new Set(previous); if (next.has(id)) next.delete(id); else next.add(id); return next }), error, queue, session, sendChat, rejoin: () => setRetry(v => v + 1), clearError: () => setError('') }
}
export type CampusLiveSession = ReturnType<typeof useCampusSession>
