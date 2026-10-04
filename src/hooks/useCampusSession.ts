import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { authenticateLiveSocket } from '../lib/liveAuth'
import { campusId, chatText, parseCampusChat, parseCampusSnapshot } from '../lib/campusProtocol'
import type { CampusActivity, CampusChat, CampusPerson, CampusPose, CampusSession } from '../lib/campusProtocol'
export type CampusConnection = 'idle' | 'connecting' | 'waiting' | 'live' | 'offline'
export function useCampusSession(enabled: boolean, pose: React.RefObject<CampusPose | null>, walking: boolean, activity: CampusActivity) {
  const session = useRef<CampusSession>({ id: null, snapshot: null }), socket = useRef<WebSocket | null>(null)
  const mode = useRef({ walking, activity }); mode.current = { walking, activity }
  const [connection, setConnection] = useState<CampusConnection>('idle'), [people, setPeople] = useState<CampusPerson[]>([])
  const [messages, setMessages] = useState<CampusChat[]>([]), [error, setError] = useState(''), [queue, setQueue] = useState(0), [retry, setRetry] = useState(0)
  const [rideError, setRideError] = useState('')
  const [muted, setMuted] = useState<Set<string>>(() => new Set())
  const visibleMessages = useMemo(() => messages.filter(m => !muted.has(m.sender)), [messages, muted])
  useEffect(() => {
    if (!enabled) { setConnection('idle'); setPeople([]); setMessages([]); session.current = { id: null, snapshot: null }; return }
    let active = true, initialized = false, rosterKey = '', stopAuth = () => {}
    setRideError(''); setConnection('connecting'); setPeople([]); setMessages([]); setError(''); setQueue(0); session.current = { id: null, snapshot: null }
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
      const key = JSON.stringify(snapshot.people.map(p => [p.id, p.name, p.handle, p.color, p.activity, p.pose?.space, p.pose?.visible, p.pose?.vehicle, p.ride?.driverId, p.ride?.seat]))
      if (key !== rosterKey) { rosterKey = key; setPeople(snapshot.people) }
    }
    ws.onerror = () => { if (active) setError('The live connection was interrupted. Rejoin to try again.') }
    ws.onclose = () => { clearTimeout(timeout); if (active) { setConnection('offline'); setPeople([]); session.current = { id: null, snapshot: null } } }
    const publish = () => {
      if (!initialized || ws.readyState !== WebSocket.OPEN || ws.bufferedAmount > 16384) return
      const current = pose.current
      if (!current) return
      const focused = !document.hidden && document.hasFocus()
      const visible = mode.current.walking && current.visible
      ws.send(JSON.stringify({ type: 'pose', activity: mode.current.activity, pose: { ...current, yaw: Math.atan2(Math.sin(current.yaw), Math.cos(current.yaw)), visible, active: visible && focused && current.active, moving: visible && focused && current.moving } }))
    }
    const timer = window.setInterval(publish, 100)
    window.addEventListener('blur', publish); document.addEventListener('visibilitychange', publish)
    return () => { active = false; stopAuth(); clearInterval(timer); clearTimeout(timeout); window.removeEventListener('blur', publish); document.removeEventListener('visibilitychange', publish); ws.close(); socket.current = null; session.current = { id: null, snapshot: null } }
  }, [enabled, retry, pose])
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
  return { rideBuggy, rideError, connection, people, messages: visibleMessages, muted, toggleMute: (id: string) => setMuted(previous => { const next = new Set(previous); if (next.has(id)) next.delete(id); else next.add(id); return next }), error, queue, session, sendChat, rejoin: () => setRetry(v => v + 1), clearError: () => setError('') }
}
export type CampusLiveSession = ReturnType<typeof useCampusSession>
