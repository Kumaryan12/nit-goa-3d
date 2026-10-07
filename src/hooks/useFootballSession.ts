import { authenticateLiveSocket } from '../lib/liveAuth'
import { useEffect, useRef, useState } from 'react'
import { createFootballState, footballToLocal, footballToWorld } from '../lib/football'
import type { FootballControls, FootballPitch } from '../lib/football'
import { parseFootballSnapshot } from '../lib/footballProtocol'
import type { FootballPlayer, FootballSession } from '../lib/footballProtocol'
import type { LocalCoordinate } from '../lib/geo'
import { liveRetryDelay } from '../lib/liveRecovery'
import { watchLiveConnection } from '../lib/liveWatchdog'
import { RemoteMotionBuffer } from '../lib/remoteMotion'
export type FootballConnection = 'idle' | 'connecting' | 'waiting' | 'live' | 'offline'
export function useFootballSession(joined: boolean, retry: number, controls: React.RefObject<FootballControls>, position: React.RefObject<LocalCoordinate | null>, pitch: FootballPitch | null) {
  const session = useRef<FootballSession>({ id: null, snapshot: null })
  const [connection, setConnection] = useState<FootballConnection>('idle'), [players, setPlayers] = useState<FootballPlayer[]>([])
  const pitchRef = useRef(pitch); pitchRef.current = pitch
  const recoveryAttempt = useRef(0), [automaticRetry, setAutomaticRetry] = useState(0)
  useEffect(() => { recoveryAttempt.current = 0 }, [joined, retry])
  useEffect(() => {
    if (!joined || !pitchRef.current) { session.current = { id: null, snapshot: null }; setPlayers([]); setConnection('idle'); return }
    let active = true, key = '', initialized = false, recoveryTimer: number | undefined
    let socket: WebSocket
    setConnection('connecting'); session.current = { id: null, snapshot: null, motion: new RemoteMotionBuffer() }; setPlayers([])
    try {
      const url = new URL(import.meta.env.VITE_FOOTBALL_URL || '/football', window.location.href)
      if (url.protocol === 'http:') url.protocol = 'ws:'; if (url.protocol === 'https:') url.protocol = 'wss:'
      if (!['ws:','wss:'].includes(url.protocol)) throw new Error('Invalid football server URL')
      socket = new WebSocket(url)
    } catch { setConnection('offline'); return }
    let kick = controls.current.kick, reset = controls.current.reset, poseAt = 0
    const watchdog = watchLiveConnection(socket)
    const timeout = window.setTimeout(() => { if (!initialized) socket.close(4000, 'Connection timeout') }, 45000)
    let stopAuth = () => {}
    socket.onopen = () => { stopAuth = authenticateLiveSocket(socket) }
    socket.onmessage = event => {
      if (!active || typeof event.data !== 'string' || event.data.length > 65536) return
      let value
      try { value = JSON.parse(event.data) } catch { return }
      if (value.type === 'waiting') { clearTimeout(timeout); setConnection('waiting'); return }
      if (value.type === 'welcome' && typeof value.id === 'string') {
        const valid = parseFootballSnapshot({ type: 'state', sequence: 0, ball: createFootballState(), players: [value.player] })
        if (!valid || valid.players[0].id !== value.id || !pitchRef.current) return
        session.current.id = value.id; initialized = true; recoveryAttempt.current = 0; clearTimeout(timeout); watchdog.received()
        position.current = footballToWorld(valid.players[0], pitchRef.current)
        setConnection('live'); return
      }
      const snapshot = parseFootballSnapshot(value)
      if (!snapshot || !session.current.id || (session.current.snapshot && snapshot.sequence <= session.current.snapshot.sequence)) return
      session.current.snapshot = snapshot
      watchdog.received()
      const field = pitchRef.current
      if (field) session.current.motion?.push({ sequence: snapshot.sequence, serverTime: snapshot.serverTime ?? Date.now(), people: snapshot.players.map(player => {
        const point = footballToWorld(player, field), direction = footballToWorld({ x: player.dx, z: player.dz }, { ...field, center: { x: 0, z: 0 } })
        return { id: player.id, pose: { ...point, y: field.elevation + .11, yaw: Math.atan2(-direction.x, -direction.z), epoch: 0, space: 'outdoors', visible: true, active: player.active, moving: player.moving, running: player.running } }
      }) }, performance.now())
      const nextKey = snapshot.players.map(player => player.id).join(',')
      if (nextKey !== key) { key = nextKey; setPlayers(snapshot.players) }
      const self = snapshot.players.find(player => player.id === session.current.id), current = position.current
      // Recover rejected teleports or long frame stalls from the server position.
      if (self && current && pitchRef.current) {
        const local = footballToLocal(current, pitchRef.current)
        if (Math.hypot(local.x - self.x, local.z - self.z) > 2) position.current = footballToWorld(self, pitchRef.current)
      }
    }
    socket.onclose = event => {
      clearTimeout(timeout); stopAuth(); watchdog.stop()
      if (!active) return
      setPlayers([]); session.current = { id: null, snapshot: null }
      const delay = liveRetryDelay(event.code, recoveryAttempt.current)
      if (delay === null) { setConnection('offline'); return }
      recoveryAttempt.current++; setConnection('connecting')
      recoveryTimer = window.setTimeout(() => { if (active) setAutomaticRetry(value => value + 1) }, delay)
    }
    const timer = window.setInterval(() => {
      const actor = controls.current.actor, field = pitchRef.current
      if (socket.readyState !== WebSocket.OPEN || socket.bufferedAmount > 16384 || !initialized || !actor || !field) return
      const allowed = actor.active && !document.hidden && document.hasFocus(), now = performance.now()
      if (now - poseAt >= 95) {
        const point = footballToLocal(actor.position, field), c = Math.cos(field.rotation), s = Math.sin(field.rotation)
        const direction = { x: actor.direction.x * c - actor.direction.z * s, z: actor.direction.x * s + actor.direction.z * c }
        socket.send(JSON.stringify({ type:'pose', x:point.x, z:point.z, dx:direction.x, dz:direction.z, active:allowed, running:actor.running })); poseAt = now
      }
      if (kick !== controls.current.kick) { kick = controls.current.kick; if (allowed) socket.send(JSON.stringify({type:'kick'})) }
      if (reset !== controls.current.reset) { reset = controls.current.reset; if (allowed) socket.send(JSON.stringify({type:'reset'})) }
    }, 50)
    return () => { active = false; stopAuth(); watchdog.stop(); clearInterval(timer); clearTimeout(timeout); clearTimeout(recoveryTimer); socket.close(); session.current = { id: null, snapshot: null } }
  }, [joined, retry, automaticRetry, controls, position])
  return { connection, players, session }
}
