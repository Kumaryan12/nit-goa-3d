import { useCallback, useEffect, useRef, useState } from 'react'
import type { CampusLiveSession } from './useCampusSession'
import { parseScreeningState, screeningPosition, screeningConnectionStatus } from '../lib/screening'
import type { ScreeningState } from '../lib/screening'

export function useScreening(campus: Pick<CampusLiveSession, 'sendScreening' | 'subscribeScreening' | 'session' | 'connection' | 'error' | 'queue' | 'rejoin'>, admin = false) {
  const [room, setRoom] = useState<ScreeningState | null>(null), [error, setError] = useState(''), [pending, setPending] = useState(false)
  const [muted, setMuted] = useState(true), [volume, setVolume] = useState(.7)
  const [unavailable, setUnavailable] = useState(false)
  const current = useRef<ScreeningState | null>(null), requested = useRef(false), timer = useRef<number | undefined>(undefined)
  const anchor = useRef({ server: Date.now(), local: performance.now() }), syncAt = useRef(0)
  const waiting = useRef(false), syncedConnection = useRef(false)
  const serverNow = useCallback(() => anchor.current.server + performance.now() - anchor.current.local, [])
  const command = useCallback((action: string, values: Record<string, unknown> = {}) => {
    if (action !== 'sync') setError('')
    const ok = campus.sendScreening({ type: 'screening', action, session: current.current?.session ?? 0, ...values })
    if (!ok) setError('Connect to the live campus to use screenings.')
    return ok
  }, [campus.sendScreening])
  const clearPending = useCallback(() => { waiting.current = false; setPending(false); clearTimeout(timer.current) }, [])
  const requestJoin = useCallback(() => {
    if (waiting.current) return
    if (!command('join')) { requested.current = false; return }
    waiting.current = true; setPending(true)
    timer.current = window.setTimeout(() => { clearPending(); requested.current = false; command('leave'); setError('Your seat was not confirmed. Please try joining again.') }, 8000)
  }, [command, clearPending])
  useEffect(() => campus.subscribeScreening(value => {
    const v = value as Record<string, unknown>
    if (v.type === 'cafe-voice-reset') { current.current = null; setRoom(null); clearPending(); return }
    if (v.type === 'screening-result') {
      if (v.action === 'join') { clearPending(); if (v.error) requested.current = false }
      if (typeof v.error === 'string') setError(v.error.slice(0, 240))
      return
    }
    const state = parseScreeningState(v)
    if (!state || current.current && (state.revision < current.current.revision || state.revision === current.current.revision && state.serverTime < current.current.serverTime)) return
    const received = performance.now(), latency = syncAt.current ? Math.min(1000, Math.max(0, received - syncAt.current) / 2) : 0
    syncAt.current = 0; anchor.current = { server: state.serverTime + latency, local: received }
    current.current = state; setRoom(state); setUnavailable(false)
    if (!state.media) { requested.current = false; clearPending() }
    else if (requested.current && !state.participants.some(p => p.id === campus.session.current.id) && !waiting.current) requestJoin()
  }), [campus.subscribeScreening, campus.session, clearPending, requestJoin])
  useEffect(() => {
    if (campus.connection !== 'live') { syncedConnection.current = false; current.current = null; setRoom(null); clearPending(); setUnavailable(false); return }
    const sync = () => { syncAt.current = performance.now(); command('sync') }
    if (!syncedConnection.current) { syncedConnection.current = true; sync() }
    const deadline = window.setTimeout(() => { if (!current.current) setUnavailable(true) }, 8000)
    const interval = window.setInterval(sync, 10000)
    return () => { clearInterval(interval); clearTimeout(deadline) }
  }, [campus.connection, command, clearPending])
  useEffect(() => () => clearTimeout(timer.current), [])
  const join = useCallback(() => { requested.current = true; requestJoin() }, [requestJoin])
  const leave = useCallback(() => { requested.current = false; clearPending(); command('leave') }, [command, clearPending])
  const self = room?.participants.find(p => p.id === campus.session.current.id)
  const connectionStatus = screeningConnectionStatus(campus.connection, !!room, unavailable, campus.error, campus.queue)
  return { connectionStatus, reconnect: campus.rejoin, admin, muted, setMuted, volume, setVolume, room, error, pending, joined: !!self, seat: self?.seat, command, join, leave, serverNow, position: () => current.current ? screeningPosition(current.current, serverNow()) : 0, live: campus.connection === 'live' && !!room && !unavailable }
}
export type ScreeningSession = ReturnType<typeof useScreening>
