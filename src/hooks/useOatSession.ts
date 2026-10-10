import { authenticateLiveSocket } from '../lib/liveAuth'
import { useCallback, useEffect, useRef, useState } from 'react'
import { oatAudioURL, oatPlaybackURL, oatMusicPosition, OAT_UPLOAD_LIMIT, parseOatSignal, parseOatSnapshot } from '../lib/oatProtocol'
import type { OatSignal, OatSnapshot } from '../lib/oatProtocol'
import { OatAudio } from '../lib/oatAudio'
import { OatVoiceRecovery } from '../lib/oatVoiceRecovery'
import { parseOatIceConfiguration, parseOatIceServers } from '../lib/oatIce'
import { liveRetryDelay } from '../lib/liveRecovery'
import { watchLiveConnection } from '../lib/liveWatchdog'

interface VoicePeer { connectionId: string; createdAt: number; pc: RTCPeerConnection; timeout: ReturnType<typeof setTimeout>; candidates: RTCIceCandidateInit[]; chain: Promise<void> }
export type OatConnection = 'idle' | 'connecting' | 'waiting' | 'live' | 'offline'
export type OatMic = 'off' | 'requesting' | 'connecting' | 'live'
function iceServers(): RTCIceServer[] {
  try { return parseOatIceServers(JSON.parse(import.meta.env.VITE_OAT_ICE_SERVERS || '[{"urls":"stun:stun.l.google.com:19302"}]')) ?? [] } catch { return [] }
}
function serverURL() {
  const url = new URL(import.meta.env.VITE_OAT_URL || '/oat', window.location.href)
  if (url.protocol === 'http:') url.protocol = 'ws:'; if (url.protocol === 'https:') url.protocol = 'wss:'
  if (!['ws:', 'wss:'].includes(url.protocol)) throw new Error('Invalid concert server URL')
  return url
}
export interface OatRuntime {
  openSocket: (url: URL) => WebSocket
  authenticate: typeof authenticateLiveSocket
  capture: () => Promise<MediaStream>
  createPeer: (configuration: RTCConfiguration) => RTCPeerConnection
}
const browserRuntime: OatRuntime = {
  openSocket: url => new WebSocket(url), authenticate: authenticateLiveSocket,
  capture: () => navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: false }, video: false }),
  createPeer: configuration => new RTCPeerConnection(configuration),
}
export function useOatSession(joined: boolean, name: string, retry: number, runtime: OatRuntime = browserRuntime) {
  const [connection, setConnection] = useState<OatConnection>('idle'), [snapshot, setSnapshot] = useState<OatSnapshot | null>(null)
  const recoveryAttempt = useRef(0), [automaticRetry, setAutomaticRetry] = useState(0)
  useEffect(() => { recoveryAttempt.current = 0 }, [joined, retry])
  const [queuePosition, setQueuePosition] = useState(0)
  const [selfId, setSelfId] = useState<string | null>(null), [error, setError] = useState(''), [mic, setMic] = useState<OatMic>('off')
  const [listening, setListening] = useState(false), [soundBlocked, setSoundBlocked] = useState(false), [volume, setVolume] = useState(.7)
  const [micLevel, setMicLevel] = useState(0), [voiceLevel, setVoiceLevel] = useState(0)
  const [voiceStatus, setVoiceStatus] = useState(''), [uploading, setUploading] = useState(false), [playhead, setPlayhead] = useState(0)
  const socket = useRef<WebSocket | null>(null), id = useRef<string | null>(null), token = useRef(''), state = useRef<OatSnapshot | null>(null), clockOffset = useRef(0)
  const musicAudio = useRef<HTMLAudioElement | null>(null), stream = useRef<MediaStream | null>(null)
  const capturedMic = useRef<MediaStream | null>(null), mixer = useRef<OatAudio | null>(null), voiceConnected = useRef(false)
  const peers = useRef(new Map<string, VoicePeer>()), enabled = useRef(false), gain = useRef(.7), micAttempt = useRef(0), upload = useRef<AbortController | null>(null)
  const micAcknowledgements = useRef(false), micPending = useRef(false), micTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const audioChanged = useRef<() => void>(() => {}), retryVoice = useRef<(peerId: string) => void>(() => {})
  const recovery = useRef<OatVoiceRecovery | null>(null)
  if (!recovery.current) recovery.current = new OatVoiceRecovery(peerId => retryVoice.current(peerId), () => setVoiceStatus('Voice could not connect. Tap Retry voice connection. Some networks require a TURN relay.'))
  const ensureAudio = useCallback(() => {
    if (!mixer.current) {
      mixer.current = new OatAudio()
      mixer.current.context.onstatechange = () => audioChanged.current()
    }
    if (musicAudio.current) mixer.current.attachMusic(musicAudio.current)
    mixer.current.setListening(enabled.current, gain.current)
    return mixer.current
  }, [])
  const earlyCandidates = useRef(new Map<string, RTCIceCandidateInit[]>())
  const ice = useRef<RTCIceServer[]>(iceServers()), icePending = useRef(false)
  const pendingSignals = useRef<{ from: string; signal: OatSignal }[]>([])
  const voiceReconcile = useRef<() => void>(() => {}), signalReceive = useRef<(from: string, signal: OatSignal) => void>(() => {})
  const send = useCallback((message: unknown) => { if (socket.current?.readyState === WebSocket.OPEN && id.current) { socket.current.send(JSON.stringify(message)); return true } return false }, [])
  const closePeer = useCallback((peerId: string) => { const peer = peers.current.get(peerId); if (peer) { clearTimeout(peer.timeout); peer.pc.close(); peers.current.delete(peerId) } }, [])
  const stopMic = useCallback(() => {
    micAttempt.current++; micPending.current = false; clearTimeout(micTimeout.current); setMicLevel(0); recovery.current?.reset(); capturedMic.current?.getTracks().forEach(track => track.stop()); capturedMic.current = null
    stream.current?.getTracks().forEach(track => track.stop()); stream.current = null
    mixer.current?.stopMicrophone()
    for (const peerId of peers.current.keys()) closePeer(peerId)
    setMic('off'); if (state.current?.performerId === id.current) send({ type: 'mic', enabled: false, requestId: micAttempt.current })
  }, [send, closePeer])
  const audioURL = useCallback((url: string) => {
    return oatPlaybackURL(url, window.location.href, serverURL().href)
  }, [])
  const syncMusic = useCallback(() => {
    const audio = musicAudio.current, room = state.current
    if (!audio || !room) return
    const m = room.music, target = oatMusicPosition(m, Date.now() + clockOffset.current)
    setPlayhead(target)
    const graph = mixer.current
    const mixedForAudience = room.micOn && room.performerId !== id.current && voiceConnected.current && !!mixer.current?.voicePlaying
    audio.volume = graph ? 1 : gain.current; audio.muted = graph ? false : !enabled.current
    graph?.setListening(enabled.current, gain.current)
    if (!m.url) { audio.pause(); audio.removeAttribute('src'); return }
    const url = audioURL(m.url)
    if (audio.src !== url) { audio.src = url; audio.load() }
    if (audio.readyState >= 1 && Math.abs(audio.currentTime - target) > .4) { try { audio.currentTime = target } catch { /* Metadata is still loading. */ } }
    if (m.playing && (enabled.current || stream.current) && !mixedForAudience) {
      if (audio.paused && !audio.ended) void audio.play().catch(() => setSoundBlocked(true))
      else if (audio.ended && target < audio.duration - .1) void audio.play().catch(() => setSoundBlocked(true))
    } else audio.pause()
  }, [audioURL])
  audioChanged.current = () => {
    if (mixer.current?.context.state === 'closed') return
    setSoundBlocked((enabled.current || !!stream.current) && mixer.current?.context.state !== 'running')
    syncMusic()
  }
  const enableSound = useCallback(() => {
    enabled.current = true; setListening(true); setSoundBlocked(false)
    try {
      const graph = ensureAudio()
      // Resume now, while the Join/Enable sound click still has user activation.
      void graph.unlock().then(() => { setSoundBlocked(graph.context.state !== 'running'); syncMusic() }).catch(() => setSoundBlocked(true))
    } catch { setSoundBlocked(true); setError('Concert audio is unavailable in this browser.') }
    syncMusic()
  }, [ensureAudio, syncMusic])
  const muteSound = useCallback(() => {
    enabled.current = false; setListening(false); setSoundBlocked(false)
    mixer.current?.setListening(false, gain.current)
    if (musicAudio.current && !stream.current) { if (!mixer.current) musicAudio.current.muted = true; musicAudio.current.pause() }
  }, [])
  const changeVolume = useCallback((value: number) => { gain.current = Math.max(0, Math.min(1, value)); setVolume(gain.current); mixer.current?.setListening(enabled.current, gain.current); syncMusic() }, [syncMusic])
  const createPeer = useCallback((peerId: string, connectionId: string = crypto.randomUUID()): VoicePeer => {
    const pc = runtime.createPeer({ iceServers: ice.current }), peer: VoicePeer = { connectionId, createdAt: performance.now(), pc, candidates: [], chain: Promise.resolve(), timeout: setTimeout(() => {
      if (peers.current.get(peerId) === peer && pc.connectionState !== 'connected') {
        setVoiceStatus('Reconnecting live voice…'); recovery.current?.schedule(peerId)
      }
    }, 15000) }
    peer.candidates = earlyCandidates.current.get(peerId + ':' + connectionId) ?? earlyCandidates.current.get(peerId + ':legacy') ?? []; earlyCandidates.current.delete(peerId + ':' + connectionId); earlyCandidates.current.delete(peerId + ':legacy')
    for (const key of earlyCandidates.current.keys()) if (key.startsWith(peerId + ':')) earlyCandidates.current.delete(key)
    peers.current.set(peerId, peer)
    pc.onicecandidate = event => { if (event.candidate && peers.current.get(peerId) === peer) send({ type: 'signal', to: peerId, signal: { kind: 'ice', connectionId: peer.connectionId, candidate: event.candidate.toJSON() } }) }
    pc.onconnectionstatechange = () => {
      if (peers.current.get(peerId) !== peer) return
      if (pc.connectionState === 'connected') {
        clearTimeout(peer.timeout); recovery.current?.connected(peerId)
        if (state.current?.performerId !== id.current) voiceConnected.current = true
        const count = [...peers.current.values()].filter(value => value.pc.connectionState === 'connected').length
        setVoiceStatus(state.current?.performerId === id.current ? `Voice connected to ${count} listener${count === 1 ? '' : 's'}` : 'Live voice connected')
        syncMusic()
      } else if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        if (state.current?.performerId !== id.current) voiceConnected.current = false
        setVoiceStatus('Reconnecting live voice…'); syncMusic()
        recovery.current?.schedule(peerId, pc.connectionState === 'disconnected')
      }
    }
    pc.ontrack = event => {
      if (peers.current.get(peerId) !== peer || state.current?.performerId !== peerId || !state.current.micOn) return
      try {
        const graph = ensureAudio()
        graph.receive(event.streams[0] ?? new MediaStream([event.track]))
        event.track.onmute = () => { if (peers.current.get(peerId) === peer) { voiceConnected.current = false; syncMusic() } }
        event.track.onunmute = () => { if (peers.current.get(peerId) === peer) { voiceConnected.current = pc.connectionState === 'connected'; syncMusic() } }
        if (enabled.current && graph.context.state !== 'running') setSoundBlocked(true)
        syncMusic()
      } catch { setError('Could not play live voice. Tap Enable sound to try again.') }
    }
    return peer
  }, [send, syncMusic, ensureAudio, runtime])
  const offerTo = useCallback((peerId: string) => {
    if (icePending.current || !stream.current || peers.current.has(peerId)) return
    try {
      const peer = createPeer(peerId)
      for (const track of stream.current.getAudioTracks()) peer.pc.addTrack(track, stream.current)
      peer.chain = peer.chain.then(async () => {
        const offer = await peer.pc.createOffer(); await peer.pc.setLocalDescription(offer)
        if (peers.current.get(peerId) === peer && state.current?.micOn && state.current.performerId === id.current) send({ type: 'signal', to: peerId, signal: { kind: 'offer', connectionId: peer.connectionId, sdp: offer.sdp } })
      }).catch(() => { if (peers.current.get(peerId) === peer) { closePeer(peerId); setVoiceStatus('Reconnecting live voice…'); recovery.current?.schedule(peerId) } })
    } catch { setVoiceStatus('Live voice is unavailable in this browser.') }
  }, [createPeer, send, closePeer])
  retryVoice.current = peerId => {
    const room = state.current
    if (!room?.micOn || !room.participants.some(p => p.id === peerId)) { recovery.current?.remove(peerId); return }
    closePeer(peerId)
    if (room.performerId === id.current && stream.current) offerTo(peerId)
    else if (room.performerId === peerId) { mixer.current?.disconnectVoice(); voiceConnected.current = false; send({ type: 'voice-ready' }); syncMusic() }
  }
  const reconnectVoice = useCallback(() => {
    enableSound(); recovery.current?.reset()
    const room = state.current
    if (room?.performerId === id.current) for (const participant of room.participants) { if (participant.id !== id.current) retryVoice.current(participant.id) }
    else if (room?.performerId) retryVoice.current(room.performerId)
  }, [enableSound])
  voiceReconcile.current = () => {
    const room = state.current
    if (!room?.micOn) {
      for (const peerId of peers.current.keys()) closePeer(peerId)
      earlyCandidates.current.clear(); recovery.current?.reset()
      voiceConnected.current = false
      mixer.current?.disconnectVoice()
      setVoiceStatus('')
      return
    }
    for (const peerId of peers.current.keys()) if (!room.participants.some(p => p.id === peerId) || (room.performerId !== id.current && peerId !== room.performerId)) { recovery.current?.remove(peerId); closePeer(peerId) }
    if (room.performerId === id.current && stream.current) for (const participant of room.participants) if (participant.id !== id.current) offerTo(participant.id)
    if (room.performerId === id.current && room.participants.length === 1) setVoiceStatus('Waiting for listeners')
  }
  signalReceive.current = (from, signal) => {
    if (icePending.current) { if (pendingSignals.current.length < 256) pendingSignals.current.push({ from, signal }); return }
    const room = state.current
    if (!room?.micOn || (room.performerId !== id.current && room.performerId !== from)) return
    let peer = peers.current.get(from)
    if (signal.connectionId && peer?.connectionId !== signal.connectionId) {
      if (signal.kind === 'offer' && room.performerId === from) {
        recovery.current?.remove(from); closePeer(from); peer = undefined
      } else if (signal.kind === 'ice' && room.performerId === from) {
        const key = from + ':' + signal.connectionId, pending = earlyCandidates.current.get(key) ?? []
        if (pending.length < 64) pending.push(signal.candidate)
        if (earlyCandidates.current.size < 8 || earlyCandidates.current.has(key)) earlyCandidates.current.set(key, pending)
        return
      } else return // An answer/candidate from an obsolete connection cannot affect its replacement.
    }
    if (!peer) {
      if (room.performerId === from && signal.kind === 'ice') {
        const key = from + ':legacy', pending = earlyCandidates.current.get(key) ?? []
        if (pending.length < 64) pending.push(signal.candidate)
        earlyCandidates.current.set(key, pending); return
      }
      if (room.performerId === id.current || signal.kind !== 'offer') return
      try { peer = createPeer(from, signal.connectionId) } catch { setVoiceStatus('Live voice is unavailable in this browser.'); return }
    }
    const target = peer
    target.chain = target.chain.then(async () => {
      if (peers.current.get(from) !== target) return
      if (signal.kind === 'ice') { if (target.pc.remoteDescription) await target.pc.addIceCandidate(signal.candidate); else target.candidates.push(signal.candidate); return }
      await target.pc.setRemoteDescription({ type: signal.kind, sdp: signal.sdp })
      for (const candidate of target.candidates.splice(0)) await target.pc.addIceCandidate(candidate)
      if (signal.kind === 'offer') {
        const answer = await target.pc.createAnswer(); await target.pc.setLocalDescription(answer)
        send({ type: 'signal', to: from, signal: { kind: 'answer', connectionId: target.connectionId, sdp: answer.sdp } })
      }
    }).catch(() => { if (peers.current.get(from) === target) { closePeer(from); voiceConnected.current = false; setVoiceStatus('Reconnecting live voice…'); recovery.current?.schedule(from); syncMusic() } })
  }
  const startMic = useCallback(async () => {
    if (!id.current || state.current?.performerId !== id.current || stream.current || capturedMic.current) return
    if (!navigator.mediaDevices?.getUserMedia) { setError('Live singing needs HTTPS or localhost and a browser with microphone support.'); return }
    const attempt = ++micAttempt.current; setMic('requesting'); setError('')
    try {
      const graph = ensureAudio()
      // Unlock before getUserMedia yields; Safari may discard activation after the prompt.
      const resumed = graph.unlock().catch(() => {})
      const media = await runtime.capture()
      if (attempt !== micAttempt.current || state.current?.performerId !== id.current || !id.current || socket.current?.readyState !== WebSocket.OPEN) { media.getTracks().forEach(track => track.stop()); return }
      capturedMic.current = media
      await resumed
      if (attempt !== micAttempt.current || state.current?.performerId !== id.current || !capturedMic.current) { media.getTracks().forEach(track => track.stop()); return }
      stream.current = graph.startMicrophone(media)
      for (const track of media.getAudioTracks()) track.onended = () => stopMic()
      micPending.current = true; setMic('connecting')
      if (!send({ type: 'mic', enabled: true, requestId: attempt })) throw new Error('The concert disconnected. Rejoin before starting your microphone.')
      micTimeout.current = setTimeout(() => {
        if (micPending.current) { stopMic(); setError('The concert did not confirm your microphone. Try starting it again.') }
      }, 8000)
      syncMusic()
    } catch (err) {
      if (attempt !== micAttempt.current) return
      stopMic(); setError(err instanceof DOMException && err.name === 'NotAllowedError' ? 'Microphone permission was denied. Allow it in your browser to sing live.' : err instanceof Error ? err.message : 'Could not open your microphone. Check that it is connected and available.')
    }
  }, [send, stopMic, syncMusic, ensureAudio, runtime])
  useEffect(() => {
    if (!joined) { setConnection('idle'); return }
    let active = true, initialized = false, recoveryTimer: number | undefined, iceTimer: number | undefined
    ice.current = iceServers(); icePending.current = false; pendingSignals.current = []
    setConnection('connecting'); setError(''); setVoiceStatus(''); setSnapshot(null); state.current = null
    const music = new Audio(); music.crossOrigin = 'anonymous'; music.preload = 'metadata'; musicAudio.current = music
    mixer.current?.attachMusic(music); mixer.current?.setListening(enabled.current, gain.current)
    music.onloadedmetadata = () => {
      syncMusic()
      const room = state.current
      if (room && room.performerId === id.current && Number.isFinite(music.duration) && music.duration > 0) send({ type: 'duration', url: room.music.url, duration: music.duration })
    }
    music.onerror = () => { if (state.current?.music.url) setError('This track could not be played. Try another audio file or a direct audio link.') }
    let ws: WebSocket
    try { ws = runtime.openSocket(serverURL()); socket.current = ws } catch { setConnection('offline'); return () => { music.pause() } }
    const watchdog = watchLiveConnection(ws)
    const timeout = window.setTimeout(() => { if (!initialized) ws.close(4000, 'Connection timeout') }, 45000)
    let stopAuth = () => {}
    const finishIce = () => {
      icePending.current = false
      for (const pending of pendingSignals.current.splice(0)) signalReceive.current(pending.from, pending.signal)
      voiceReconcile.current()
      if (state.current?.micOn && state.current.performerId !== id.current && !peers.current.has(state.current.performerId!)) send({ type: 'voice-ready' })
    }
    ws.onopen = () => { stopAuth = runtime.authenticate(ws) }
    ws.onmessage = event => {
      if (!active || typeof event.data !== 'string' || event.data.length > 65536) return
      let value: Record<string, unknown>
      try { value = JSON.parse(event.data); if (!value || typeof value !== 'object') return } catch { return }
      if (value.type === 'waiting' && typeof value.position === 'number') { clearTimeout(timeout); setConnection('waiting'); setQueuePosition(value.position); return }
      if (value.type === 'welcome' && typeof value.id === 'string' && typeof value.uploadToken === 'string') {
        micAcknowledgements.current = value.micAcknowledgements === true
        icePending.current = value.icePending === true
        if (icePending.current) iceTimer = window.setTimeout(() => { setVoiceStatus('Relay unavailable. Trying a direct voice connection…'); finishIce() }, 7500)
        id.current = value.id; token.current = value.uploadToken; setSelfId(value.id); initialized = true; recoveryAttempt.current = 0; clearTimeout(timeout); setConnection('live'); watchdog.received()
        send({ type: 'name', name }); send({ type: 'clock', clientTime: Date.now() }); return
      }
      if (value.type === 'ice-config') {
        clearTimeout(iceTimer)
        const configuration = parseOatIceConfiguration(value)
        if (configuration) {
          ice.current = configuration.iceServers
          for (const [peerId, peer] of peers.current) {
            try { peer.pc.setConfiguration({ ...peer.pc.getConfiguration(), iceServers: ice.current }); if (peer.pc.connectionState !== 'connected') recovery.current?.schedule(peerId) }
            catch { recovery.current?.schedule(peerId) }
          }
          iceTimer = window.setTimeout(() => send({ type: 'ice-refresh' }), Math.max(30000, configuration.expiresAt - Date.now() - 600000))
        } else {
          setVoiceStatus('Relay unavailable. Trying a direct voice connection…')
          iceTimer = window.setTimeout(() => send({ type: 'ice-refresh' }), 30000)
        }
        finishIce(); return
      }
      if (value.type === 'clock' && typeof value.serverTime === 'number' && typeof value.clientTime === 'number') { clockOffset.current = value.serverTime - (Date.now() + value.clientTime) / 2; return }
      if (value.type === 'mic-result') {
        if (micPending.current && value.requestId === micAttempt.current) {
          if (value.error) { stopMic(); setError(String(value.error).slice(0, 200)) }
          else if (value.enabled === true && stream.current && state.current?.performerId === id.current) {
            micPending.current = false; clearTimeout(micTimeout.current); setMic('live')
          }
        }
        return
      }
      if (value.type === 'error' && typeof value.message === 'string') { setError(value.message.slice(0, 200)); return }
      if (value.type === 'signal' && typeof value.from === 'string') { const signal = parseOatSignal(value.signal); if (signal) signalReceive.current(value.from, signal); return }
      if (value.type === 'voice-ready' && typeof value.from === 'string' && state.current?.performerId === id.current) {
        const peer = peers.current.get(value.from)
        // Coalesce listener and performer recovery requests while a new offer is in flight.
        if (peer && performance.now() - peer.createdAt < 800 && ['new', 'connecting'].includes(peer.pc.connectionState)) return
        closePeer(value.from); offerTo(value.from); return
      }
      const next = parseOatSnapshot(value)
      if (!next || !id.current || (state.current && next.sequence < state.current.sequence)) return
      watchdog.received()
      const previous = state.current; state.current = next; setSnapshot(next)
      if (!micAcknowledgements.current && micPending.current && next.performerId === id.current && next.micOn && stream.current) {
        micPending.current = false; clearTimeout(micTimeout.current); setMic('live')
      }
      if (previous?.performerId === id.current && next.performerId !== id.current) stopMic()
      voiceReconcile.current(); syncMusic()
    }
    const disconnect = () => {
      if (!active) return
      clearTimeout(timeout); clearTimeout(iceTimer); icePending.current = false; pendingSignals.current = []; setConnection('offline'); stopMic(); muteSound(); setVoiceStatus(''); state.current = null; setSnapshot(null); setSelfId(null); id.current = null
      mixer.current?.disconnectVoice(); voiceConnected.current = false; music.pause(); upload.current?.abort()
    }
    ws.onerror = () => { if (active) setError('The concert connection was interrupted. Checking connection…') }
    ws.onclose = event => {
      stopAuth(); watchdog.stop(); disconnect()
      if (!active) return
      const delay = liveRetryDelay(event.code, recoveryAttempt.current)
      if (delay === null) return
      recoveryAttempt.current++; setConnection('connecting'); setError('Reconnecting to the concert. Your microphone is off.')
      recoveryTimer = window.setTimeout(() => { if (active) setAutomaticRetry(value => value + 1) }, delay)
    }
    const timer = window.setInterval(() => { syncMusic(); setMicLevel(mixer.current?.microphoneLevel() ?? 0); setVoiceLevel(mixer.current?.voiceLevel() ?? 0) }, 250), clock = window.setInterval(() => send({ type: 'clock', clientTime: Date.now() }), 10000)
    return () => {
      active = false; stopAuth(); watchdog.stop(); clearTimeout(timeout); clearTimeout(iceTimer); icePending.current = false; pendingSignals.current = []; clearTimeout(recoveryTimer); clearInterval(timer); clearInterval(clock); stopMic(); muteSound(); upload.current?.abort(); earlyCandidates.current.clear()
      ws.close(); socket.current = null; id.current = null; token.current = ''; state.current = null; setSnapshot(null); setSelfId(null); setVoiceStatus('')
      voiceConnected.current = false; mixer.current?.close(); mixer.current = null
      music.onloadedmetadata = null; music.onerror = null; music.pause(); music.removeAttribute('src'); musicAudio.current = null
    }
  }, [joined, retry, automaticRetry, name, send, syncMusic, stopMic, muteSound, closePeer, offerTo, runtime])
  useEffect(() => () => { mixer.current?.close(); mixer.current = null; recovery.current?.reset() }, [])
  const action = useCallback((message: unknown) => { setError(''); send(message) }, [send])
  const loadTrack = useCallback((url: string, title: string, playing = false) => {
    const valid = oatAudioURL(url)
    if (!valid) { setError('Use an audio file or a direct HTTPS audio link. YouTube and Spotify page links cannot play here.'); return }
    enableSound(); action({ type: 'track', url: valid, title, playing })
  }, [action, enableSound])
  const shareFile = useCallback(async (file: File) => {
    if (upload.current || !id.current || state.current?.performerId !== id.current) return
    if (file.size > OAT_UPLOAD_LIMIT || !file.size) { setError('Choose an audio file smaller than 12 MB.'); return }
    const controller = new AbortController(); upload.current = controller; setUploading(true); setError('')
    try {
      const base = serverURL(); base.protocol = base.protocol === 'wss:' ? 'https:' : 'http:'
      const response = await fetch(new URL('/oat/audio', base), { method: 'POST', headers: { 'Content-Type': file.type || 'application/octet-stream', 'X-Oat-Token': token.current }, body: file, signal: controller.signal })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Upload failed.')
      if (!controller.signal.aborted && state.current?.performerId === id.current) loadTrack(result.url, file.name.replace(/\.[^.]+$/, ''))
    } catch (err) { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'Upload failed. Try again.') }
    finally { if (upload.current === controller) upload.current = null; setUploading(false) }
  }, [loadTrack])
  const transport = useCallback((playing: boolean, position?: number) => {
    const m = state.current?.music; if (!m) return
    enableSound(); action({ type: 'transport', playing, position: position ?? oatMusicPosition(m, Date.now() + clockOffset.current) })
  }, [action, enableSound])
  return { connection, queuePosition, snapshot, selfId, error, mic, micLevel, voiceLevel, listening, soundBlocked, volume, voiceStatus, uploading, playhead, action, startMic, stopMic, enableSound, reconnectVoice, muteSound, changeVolume, loadTrack, shareFile, transport }
}
export type OatSession = ReturnType<typeof useOatSession>
