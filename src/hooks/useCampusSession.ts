import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { authenticateLiveSocket } from '../lib/liveAuth'
import { campusId, chatText, parseCampusChat, parseCampusSnapshot, parseCampusPose, publishedCampusPose } from '../lib/campusProtocol'
import { liveRetryDelay } from '../lib/liveRecovery'
import { watchLiveConnection } from '../lib/liveWatchdog'
import { RemoteMotionBuffer } from '../lib/remoteMotion'
import type { CampusActivity, CampusChat, CampusPerson, CampusPose, CampusSession } from '../lib/campusProtocol'
import { isSocialAction, nearbySeat, SOCIAL_DURATION } from '../lib/social'
import type { SocialAction, SocialSeat } from '../lib/social'
import { defaultAvatarColor } from '../lib/profile'
export type CampusConnection = 'idle' | 'connecting' | 'reconnecting' | 'waiting' | 'live' | 'offline'
export function useCampusSession(enabled: boolean, pose: React.RefObject<CampusPose | null>, walking: boolean, activity: CampusActivity, preview = false, seats: SocialSeat[] = []) {
  const session = useRef<CampusSession>({ id: null, snapshot: null }), socket = useRef<WebSocket | null>(null)
  const mode = useRef({ walking, activity }); mode.current = { walking, activity }
  const [connection, setConnection] = useState<CampusConnection>('idle'), [people, setPeople] = useState<CampusPerson[]>([])
  const [messages, setMessages] = useState<CampusChat[]>([]), [error, setError] = useState(''), [queue, setQueue] = useState(0), [retry, setRetry] = useState(0)
  const [rideError, setRideError] = useState('')
  const recoveryAttempt = useRef(0)
  const [socialError, setSocialError] = useState(''), [socialPending, setSocialPending] = useState(false)
  const socialTimer = useRef<number | undefined>(undefined), socialSendTimer = useRef<number | undefined>(undefined), socialWaiting = useRef(false), lastPublishedAt = useRef(-Infinity)
  const clearSocialPending = useCallback(() => { clearTimeout(socialTimer.current); clearTimeout(socialSendTimer.current); socialWaiting.current = false; setSocialPending(false) }, [])
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
      setConnection('idle'); setPeople([]); setSocialError(''); clearSocialPending(); publish(true)
      const timer = window.setInterval(() => {
        if (person.social && (Date.now() >= person.social.until || !mode.current.walking || document.hidden || person.social.action !== 'sit' && (pose.current?.moving || pose.current?.airborne))) stop()
        if (person.social?.action !== 'sit') person.pose = pose.current ? { ...pose.current, visible: mode.current.walking } : null
        person.activity = mode.current.activity; publish()
      }, 100)
      return () => { clearInterval(timer); previewAction.current = null; session.current = { id: null, snapshot: null }; setPeople([]) }
    }
    if (!enabled) { recoveryAttempt.current = 0; setConnection('idle'); setPeople([]); setMessages([]); session.current = { id: null, snapshot: null }; return }
    let active = true, initialized = false, rosterKey = '', stopAuth = () => {}, recoveryTimer: number | undefined
    setRideError(''); setSocialError(''); clearSocialPending(); setConnection('connecting'); setPeople([]); setMessages([]); setError(''); setQueue(0); session.current = { id: null, snapshot: null }
    const url = new URL('/presence', window.location.href); url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
    const ws = new WebSocket(url); socket.current = ws
    const watchdog = watchLiveConnection(ws)
    session.current.motion = new RemoteMotionBuffer()
    const timeout = window.setTimeout(() => { if (!initialized) { setError('The campus is taking longer to respond. Retrying the live connection…'); ws.close(4000, 'Connection timeout') } }, 45000)
    ws.onopen = () => { stopAuth = authenticateLiveSocket(ws) }
    const addMessage = (message: CampusChat) => setMessages(previous => previous.some(m => m.id === message.id) ? previous : [...previous.filter(m => Date.now() - m.time < 15 * 60000), message].slice(-80))
    ws.onmessage = event => {
      if (!active || typeof event.data !== 'string' || event.data.length > 131072) return
      let value
      try { value = JSON.parse(event.data) } catch { return }
      if (!value || typeof value !== 'object') return
      if (value.type === 'waiting' && Number.isInteger(value.position) && value.position > 0 && value.position <= 100) { clearTimeout(timeout); setQueue(value.position); setConnection('waiting'); return }
      if (value.type === 'buggy-result') { setRideError(typeof value.error === 'string' ? value.error.slice(0, 240) : ''); return }
      if (value.type === 'social-result') { clearSocialPending(); setSocialError(typeof value.error === 'string' ? value.error.slice(0, 240) : ''); return }
      if (value.type === 'error' || value.type === 'notice') { if (typeof value.message === 'string') setError(value.message.slice(0, 240)); return }
      if (value.type === 'campus-welcome' && campusId(value.id) && Array.isArray(value.history) && value.history.length <= 50) {
        watchdog.received()
        if (Number.isInteger(value.spawnSlot) && value.spawnSlot >= 0 && value.spawnSlot < 32) { session.current.spawnSlot = value.spawnSlot; session.current.spawnPending = true }
        session.current.id = value.id; initialized = true; recoveryAttempt.current = 0; clearTimeout(timeout); setConnection('live'); setQueue(0); setError('')
        setMessages(value.history.map(parseCampusChat).filter((m: CampusChat | null): m is CampusChat => !!m && m.scope === 'campus'))
        return
      }
      if (!initialized) return
      if (value.type === 'pose-correction') {
        const corrected = parseCampusPose(value.pose)
        if (corrected) session.current.correction = corrected
        return
      }
      if (value.type === 'chat-remove' && campusId(value.sender)) { setMessages(previous => previous.filter(m => m.sender !== value.sender)); return }
      const message = parseCampusChat(value)
      if (message) { addMessage(message); return }
      const snapshot = parseCampusSnapshot(value)
      if (!snapshot || (session.current.snapshot && snapshot.sequence <= session.current.snapshot.sequence)) return
      session.current.snapshot = snapshot
      watchdog.received(); session.current.motion?.push(snapshot, performance.now())
      session.current.peopleById = new Map(snapshot.people.map(person => [person.id, person]))
      // Per-frame poses stay in a ref; names/activity update React only as needed.
      const key = JSON.stringify(snapshot.people.map(p => [p.id, p.name, p.handle, p.color, p.activity, p.pose?.space, p.pose?.visible, p.pose?.vehicle, p.ride?.driverId, p.ride?.seat, p.social?.action, p.social?.startedAt, p.social?.seatId]))
      if (key !== rosterKey) { rosterKey = key; setPeople(snapshot.people) }
    }
    ws.onerror = () => { if (active) setError('The live connection was interrupted. Checking connection…') }
    ws.onclose = event => {
      clearTimeout(timeout); stopAuth(); watchdog.stop()
      if (!active) return
      setPeople([]); clearSocialPending(); session.current = { id: null, snapshot: null }
      const delay = liveRetryDelay(event.code, recoveryAttempt.current)
      if (delay === null) { setConnection('offline'); return }
      recoveryAttempt.current++; setConnection('reconnecting'); setError('The connection was interrupted. Reconnecting automatically…')
      recoveryTimer = window.setTimeout(() => { if (active) setRetry(value => value + 1) }, delay)
    }
    const publish = () => {
      if (socialWaiting.current || !initialized || ws.readyState !== WebSocket.OPEN || ws.bufferedAmount > 16384) return
      if (mode.current.walking && session.current.spawnPending) return
      const current = pose.current
      if (!current) return
      const focused = !document.hidden && document.hasFocus()
      ws.send(JSON.stringify({ type: 'pose', activity: mode.current.activity, pose: publishedCampusPose(current, mode.current.walking, mode.current.activity, focused) })); lastPublishedAt.current = performance.now()
    }
    const timer = window.setInterval(publish, 100)
    window.addEventListener('blur', publish); window.addEventListener('focus', publish); window.addEventListener('pageshow', publish); document.addEventListener('visibilitychange', publish)
    return () => { active = false; clearSocialPending(); stopAuth(); watchdog.stop(); clearInterval(timer); clearTimeout(timeout); clearTimeout(recoveryTimer); window.removeEventListener('blur', publish); window.removeEventListener('focus', publish); window.removeEventListener('pageshow', publish); document.removeEventListener('visibilitychange', publish); ws.close(); socket.current = null; session.current = { id: null, snapshot: null } }
  }, [enabled, retry, pose, preview, clearSocialPending])
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
    if (socialWaiting.current) return false
    setSocialError(''); socialWaiting.current = true; setSocialPending(true)
    // Publish the stopped pose before the action, respecting the server's pose
    // rate limit. Otherwise a recent moving snapshot can reject a valid seat.
    socialSendTimer.current = window.setTimeout(() => {
      if (ws !== socket.current || ws.readyState !== WebSocket.OPEN) { clearSocialPending(); return }
      const current = pose.current
      if (current && !session.current.spawnPending) {
        ws.send(JSON.stringify({ type: 'pose', activity: mode.current.activity, pose: publishedCampusPose(current, mode.current.walking, mode.current.activity, !document.hidden && document.hasFocus()) }))
        lastPublishedAt.current = performance.now()
      }
      ws.send(JSON.stringify({ type: 'social-action', action, ...(seatId ? { seatId } : {}) }))
    }, Math.max(0, 75 - (performance.now() - lastPublishedAt.current)))
    socialTimer.current = window.setTimeout(() => {
      clearSocialPending(); setSocialError('The action was not confirmed. Reconnecting to refresh your seat…')
      // Reconnect before another attempt so a delayed acknowledgement cannot
      // be mistaken for the next action's result.
      ws.close(4000, 'Social action acknowledgement timeout')
    }, 5000)
    return true
  }, [pose, clearSocialPending])
  return { socialAction, socialError, socialPending, socialPreview: preview && !enabled && import.meta.env.DEV, rideBuggy, rideError, connection, people, messages: visibleMessages, muted, toggleMute: (id: string) => setMuted(previous => { const next = new Set(previous); if (next.has(id)) next.delete(id); else next.add(id); return next }), error, queue, session, sendChat, rejoin: () => { recoveryAttempt.current = 0; setRetry(v => v + 1) }, clearError: () => setError('') }
}
export type CampusLiveSession = ReturnType<typeof useCampusSession>
