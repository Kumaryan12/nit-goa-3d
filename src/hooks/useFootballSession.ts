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
import { FootballMotionBuffer, FootballPoseProgress } from '../lib/footballMotion'
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
    setConnection('connecting'); session.current = { id: null, snapshot: null, motion: new RemoteMotionBuffer(), ballMotion:new FootballMotionBuffer() }; setPlayers([])
    try {
      const url = new URL(import.meta.env.VITE_FOOTBALL_URL || '/football', window.location.href)
      if (url.protocol === 'http:') url.protocol = 'ws:'; if (url.protocol === 'https:') url.protocol = 'wss:'
      if (!['ws:','wss:'].includes(url.protocol)) throw new Error('Invalid football server URL')
      socket = new WebSocket(url)
    } catch { setConnection('offline'); return }
    let kick = controls.current.kick, reset = controls.current.reset, poseAt = -Infinity, poseSequence=0
    const progress=new FootballPoseProgress()
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
        progress.observe(valid.players[0].poseSequence,performance.now())
        // Face the goal assigned to this team, including a rotated pitch.
        const direction=footballToWorld({x:valid.players[0].dx,z:valid.players[0].dz},{...pitchRef.current,center:{x:0,z:0}})
        controls.current.actor={position:{...position.current},direction,moving:false,running:false,active:true}
        controls.current.arrivalDirection=direction
        setConnection('live'); return
      }
      const snapshot = parseFootballSnapshot(value)
      if (!snapshot || !session.current.id || (session.current.snapshot && snapshot.sequence <= session.current.snapshot.sequence)) return
      session.current.snapshot = snapshot
      session.current.playerIndex=new Map(snapshot.players.map(player=>[player.id,player]))
      session.current.ballMotion?.push(snapshot,performance.now())
      watchdog.received()
      const field = pitchRef.current
      if (field) session.current.motion?.push({ sequence: snapshot.sequence, serverTime: snapshot.serverTime ?? Date.now(), people: snapshot.players.map(player => {
        const point = footballToWorld(player, field), direction = footballToWorld({ x: player.dx, z: player.dz }, { ...field, center: { x: 0, z: 0 } })
        return { id: player.id, pose: { ...point, y: field.elevation + .11, yaw: Math.atan2(-direction.x, -direction.z), epoch: 0, space: 'outdoors', visible: true, active: player.active, moving: player.moving, running: player.running } }
      }) }, performance.now())
      const nextKey = snapshot.players.map(player => player.id).join(',')
      if (nextKey !== key) { key = nextKey; setPlayers(snapshot.players) }
      const self = snapshot.players.find(player => player.id === session.current.id), current = position.current
      // Allow normal transport delay; correct only when accepted poses have
      // actually stopped progressing, rather than comparing two different times.
      if (self && current && pitchRef.current) {
        progress.observe(self.poseSequence,performance.now())
        const local = footballToLocal(current, pitchRef.current)
        if (progress.stalled(performance.now()) && Math.hypot(local.x - self.x, local.z - self.z) > 2) position.current = footballToWorld(self, pitchRef.current)
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
      const actionChanged=kick !== controls.current.kick
      const point = footballToLocal(actor.position, field), c = Math.cos(field.rotation), s = Math.sin(field.rotation)
      const direction = { x: actor.direction.x * c - actor.direction.z * s, z: actor.direction.x * s + actor.direction.z * c }
      if (now - poseAt >= 50 || actionChanged && now-poseAt>=45) {
        socket.send(JSON.stringify({ type:'pose', sequence:++poseSequence, x:point.x, z:point.z, dx:direction.x, dz:direction.z, active:allowed, running:actor.running })); poseAt = now
      }
      if (actionChanged) { kick = controls.current.kick; if (allowed) socket.send(JSON.stringify({type:'kick',mode:controls.current.action ?? 'shot',running:actor.running,...direction})) }
      if (reset !== controls.current.reset) { reset = controls.current.reset; if (allowed) socket.send(JSON.stringify({type:'reset'})) }
    }, 25)
    return () => { active = false; stopAuth(); watchdog.stop(); clearInterval(timer); clearTimeout(timeout); clearTimeout(recoveryTimer); socket.close(); session.current = { id: null, snapshot: null }; delete controls.current.arrivalDirection }
  }, [joined, retry, automaticRetry, controls, position])
  return { connection, players, session }
}
