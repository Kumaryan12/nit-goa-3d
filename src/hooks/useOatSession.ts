import { authenticateLiveSocket } from '../lib/liveAuth'
import { useCallback, useEffect, useRef, useState } from 'react'
import { oatAudioURL, oatPlaybackURL, oatMusicPosition, OAT_UPLOAD_LIMIT, parseOatSignal, parseOatSnapshot } from '../lib/oatProtocol'
import type { OatSignal, OatSnapshot } from '../lib/oatProtocol'
import { liveRetryDelay } from '../lib/liveRecovery'
import { watchLiveConnection } from '../lib/liveWatchdog'

interface VoicePeer { pc: RTCPeerConnection; candidates: RTCIceCandidateInit[]; chain: Promise<void> }
interface ConcertMixer { context: AudioContext; music: MediaElementAudioSourceNode; monitor: GainNode; backing: GainNode; microphone: MediaStreamAudioSourceNode | null; output: MediaStreamAudioDestinationNode | null }
export type OatConnection = 'idle' | 'connecting' | 'waiting' | 'live' | 'offline'
export type OatMic = 'off' | 'requesting' | 'live'
function iceServers(): RTCIceServer[] {
  try { const value = JSON.parse(import.meta.env.VITE_OAT_ICE_SERVERS || '[{"urls":"stun:stun.l.google.com:19302"}]'); return Array.isArray(value) ? value : [] } catch { return [] }
}
function serverURL() {
  const url = new URL(import.meta.env.VITE_OAT_URL || '/oat', window.location.href)
  if (url.protocol === 'http:') url.protocol = 'ws:'; if (url.protocol === 'https:') url.protocol = 'wss:'
  if (!['ws:', 'wss:'].includes(url.protocol)) throw new Error('Invalid concert server URL')
  return url
}
export function useOatSession(joined: boolean, name: string, retry: number) {
  const [connection, setConnection] = useState<OatConnection>('idle'), [snapshot, setSnapshot] = useState<OatSnapshot | null>(null)
  const recoveryAttempt = useRef(0), [automaticRetry, setAutomaticRetry] = useState(0)
  useEffect(() => { recoveryAttempt.current = 0 }, [joined, retry])
  const [queuePosition, setQueuePosition] = useState(0)
  const [selfId, setSelfId] = useState<string | null>(null), [error, setError] = useState(''), [mic, setMic] = useState<OatMic>('off')
  const [listening, setListening] = useState(false), [soundBlocked, setSoundBlocked] = useState(false), [volume, setVolume] = useState(.7)
  const [voiceStatus, setVoiceStatus] = useState(''), [uploading, setUploading] = useState(false), [playhead, setPlayhead] = useState(0)
  const socket = useRef<WebSocket | null>(null), id = useRef<string | null>(null), token = useRef(''), state = useRef<OatSnapshot | null>(null), clockOffset = useRef(0)
  const musicAudio = useRef<HTMLAudioElement | null>(null), voiceAudio = useRef<HTMLAudioElement | null>(null), stream = useRef<MediaStream | null>(null)
  const capturedMic = useRef<MediaStream | null>(null), mixer = useRef<ConcertMixer | null>(null), voiceConnected = useRef(false)
  const peers = useRef(new Map<string, VoicePeer>()), enabled = useRef(false), gain = useRef(.7), micAttempt = useRef(0), upload = useRef<AbortController | null>(null)
  const earlyCandidates = useRef(new Map<string, RTCIceCandidateInit[]>())
  const voiceReconcile = useRef<() => void>(() => {}), signalReceive = useRef<(from: string, signal: OatSignal) => void>(() => {})
  const send = useCallback((message: unknown) => { if (socket.current?.readyState === WebSocket.OPEN && id.current) { socket.current.send(JSON.stringify(message)); return true } return false }, [])
  const closePeer = useCallback((peerId: string) => { const peer = peers.current.get(peerId); if (peer) { peer.pc.close(); peers.current.delete(peerId) } }, [])
  const stopMic = useCallback(() => {
    micAttempt.current++; capturedMic.current?.getTracks().forEach(track => track.stop()); capturedMic.current = null
    stream.current?.getTracks().forEach(track => track.stop()); stream.current = null
    mixer.current?.microphone?.disconnect(); mixer.current?.backing.disconnect()
    if (mixer.current) { mixer.current.microphone = null; mixer.current.output = null }
    for (const peerId of peers.current.keys()) closePeer(peerId)
    setMic('off'); if (state.current?.performerId === id.current) send({ type: 'mic', enabled: false })
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
    const mixedForAudience = room.micOn && room.performerId !== id.current && voiceConnected.current
    audio.volume = graph ? 1 : gain.current; audio.muted = graph ? false : !enabled.current
    if (graph) graph.monitor.gain.value = enabled.current ? gain.current : 0
    if (!m.url) { audio.pause(); audio.removeAttribute('src'); return }
    const url = audioURL(m.url)
    if (audio.src !== url) { audio.src = url; audio.load() }
    if (audio.readyState >= 1 && Math.abs(audio.currentTime - target) > .4) { try { audio.currentTime = target } catch { /* Metadata is still loading. */ } }
    if (m.playing && (enabled.current || stream.current) && !mixedForAudience) {
      if (audio.paused && !audio.ended) void audio.play().catch(() => setSoundBlocked(true))
      else if (audio.ended && target < audio.duration - .1) void audio.play().catch(() => setSoundBlocked(true))
    } else audio.pause()
  }, [audioURL])
  const enableSound = useCallback(() => {
    enabled.current = true; setListening(true); setSoundBlocked(false)
    const room = state.current
    if (musicAudio.current && room?.music.url) { musicAudio.current.muted = false; if (room.music.playing) void musicAudio.current.play().catch(() => setSoundBlocked(true)) }
    if (voiceAudio.current) { voiceAudio.current.muted = false; if (voiceAudio.current.srcObject) void voiceAudio.current.play().catch(() => setSoundBlocked(true)) }
    send({ type: 'voice-ready' }); syncMusic()
  }, [send, syncMusic])
  const muteSound = useCallback(() => {
    enabled.current = false; setListening(false); setSoundBlocked(false)
    if (voiceAudio.current) { voiceAudio.current.muted = true; voiceAudio.current.pause() }
    if (mixer.current) mixer.current.monitor.gain.value = 0
    if (musicAudio.current && !stream.current) { if (!mixer.current) musicAudio.current.muted = true; musicAudio.current.pause() }
  }, [])
  const changeVolume = useCallback((value: number) => { gain.current = Math.max(0, Math.min(1, value)); setVolume(gain.current); if (voiceAudio.current) voiceAudio.current.volume = gain.current; syncMusic() }, [syncMusic])
  const createPeer = useCallback((peerId: string): VoicePeer => {
    const pc = new RTCPeerConnection({ iceServers: iceServers() }), peer: VoicePeer = { pc, candidates: [], chain: Promise.resolve() }
    peer.candidates = earlyCandidates.current.get(peerId) ?? []; earlyCandidates.current.delete(peerId)
    peers.current.set(peerId, peer)
    pc.onicecandidate = event => { if (event.candidate) send({ type: 'signal', to: peerId, signal: { kind: 'ice', candidate: event.candidate.toJSON() } }) }
    pc.onconnectionstatechange = () => {
      if (peers.current.get(peerId) !== peer) return
      if (pc.connectionState === 'connected') { if (state.current?.performerId !== id.current) voiceConnected.current = true; setVoiceStatus('Live voice connected'); syncMusic() }
      else if (pc.connectionState === 'failed') { voiceConnected.current = false; setVoiceStatus('Live voice could not connect. Retry sound or try a different network.'); syncMusic() }
    }
    pc.ontrack = event => {
      if (state.current?.performerId !== peerId || !state.current.micOn || !voiceAudio.current) return
      const audio = voiceAudio.current
      audio.srcObject = event.streams[0] ?? new MediaStream([event.track]); audio.volume = gain.current; audio.muted = !enabled.current
      if (enabled.current) void audio.play().catch(() => setSoundBlocked(true))
    }
    return peer
  }, [send, syncMusic])
  const offerTo = useCallback((peerId: string) => {
    if (!stream.current || peers.current.has(peerId)) return
    try {
      const peer = createPeer(peerId)
      for (const track of stream.current.getAudioTracks()) peer.pc.addTrack(track, stream.current)
      peer.chain = peer.chain.then(async () => {
        const offer = await peer.pc.createOffer(); await peer.pc.setLocalDescription(offer)
        if (peers.current.get(peerId) === peer && state.current?.micOn && state.current.performerId === id.current) send({ type: 'signal', to: peerId, signal: { kind: 'offer', sdp: offer.sdp } })
      }).catch(() => { if (peers.current.get(peerId) === peer) { closePeer(peerId); setVoiceStatus('Could not connect live voice. Try turning the microphone off and on.') } })
    } catch { setVoiceStatus('Live voice is unavailable in this browser.') }
  }, [createPeer, send, closePeer])
  voiceReconcile.current = () => {
    const room = state.current
    if (!room?.micOn) {
      for (const peerId of peers.current.keys()) closePeer(peerId)
      earlyCandidates.current.clear()
      voiceConnected.current = false
      if (voiceAudio.current) { voiceAudio.current.pause(); voiceAudio.current.srcObject = null }
      setVoiceStatus('')
      return
    }
    for (const peerId of peers.current.keys()) if (!room.participants.some(p => p.id === peerId) || (room.performerId !== id.current && peerId !== room.performerId)) closePeer(peerId)
    if (room.performerId === id.current && stream.current) for (const participant of room.participants) if (participant.id !== id.current) offerTo(participant.id)
    if (room.performerId === id.current && room.participants.length === 1) setVoiceStatus('Waiting for listeners')
  }
  signalReceive.current = (from, signal) => {
    const room = state.current
    if (!room?.micOn || (room.performerId !== id.current && room.performerId !== from)) return
    let peer = peers.current.get(from)
    if (!peer) {
      if (room.performerId === from && signal.kind === 'ice') {
        const pending = earlyCandidates.current.get(from) ?? []
        if (pending.length < 64) pending.push(signal.candidate)
        earlyCandidates.current.set(from, pending); return
      }
      if (room.performerId === id.current || signal.kind !== 'offer') return
      try { peer = createPeer(from) } catch { setVoiceStatus('Live voice is unavailable in this browser.'); return }
    }
    const target = peer
    target.chain = target.chain.then(async () => {
      if (peers.current.get(from) !== target) return
      if (signal.kind === 'ice') { if (target.pc.remoteDescription) await target.pc.addIceCandidate(signal.candidate); else target.candidates.push(signal.candidate); return }
      await target.pc.setRemoteDescription({ type: signal.kind, sdp: signal.sdp })
      for (const candidate of target.candidates.splice(0)) await target.pc.addIceCandidate(candidate)
      if (signal.kind === 'offer') {
        const answer = await target.pc.createAnswer(); await target.pc.setLocalDescription(answer)
        send({ type: 'signal', to: from, signal: { kind: 'answer', sdp: answer.sdp } })
      }
    }).catch(() => { if (peers.current.get(from) === target) { closePeer(from); voiceConnected.current = false; setVoiceStatus('Voice connection interrupted. Use Enable / retry sound to reconnect.'); syncMusic() } })
  }
  const startMic = useCallback(async () => {
    if (!id.current || state.current?.performerId !== id.current || stream.current) return
    if (!navigator.mediaDevices?.getUserMedia) { setError('Live singing needs HTTPS or localhost and a browser with microphone support.'); return }
    const attempt = ++micAttempt.current; setMic('requesting'); setError('')
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: false }, video: false })
      if (attempt !== micAttempt.current || state.current?.performerId !== id.current || !id.current || socket.current?.readyState !== WebSocket.OPEN) { media.getTracks().forEach(track => track.stop()); return }
      capturedMic.current = media
      if (!musicAudio.current) throw new Error('Concert audio is unavailable')
      if (!mixer.current) {
        const context = new AudioContext(), music = context.createMediaElementSource(musicAudio.current), monitor = context.createGain(), backing = context.createGain()
        music.connect(monitor); monitor.connect(context.destination); music.connect(backing); backing.gain.value = .55
        mixer.current = { context, music, monitor, backing, microphone: null, output: null }
      }
      const graph = mixer.current
      await graph.context.resume()
      if (attempt !== micAttempt.current || state.current?.performerId !== id.current || !capturedMic.current) { media.getTracks().forEach(track => track.stop()); return }
      graph.microphone = graph.context.createMediaStreamSource(media); graph.output = graph.context.createMediaStreamDestination()
      graph.microphone.connect(graph.output); graph.backing.connect(graph.output)
      stream.current = graph.output.stream
      for (const track of media.getAudioTracks()) track.onended = stopMic
      setMic('live'); send({ type: 'mic', enabled: true }); syncMusic()
    } catch (err) {
      if (attempt !== micAttempt.current) return
      stopMic(); setError(err instanceof DOMException && err.name === 'NotAllowedError' ? 'Microphone permission was denied. Allow it in your browser to sing live.' : 'Could not open your microphone. Check that it is connected and available.')
    }
  }, [send, stopMic, syncMusic])
  useEffect(() => {
    if (!joined) { setConnection('idle'); return }
    let active = true, initialized = false, recoveryTimer: number | undefined
    setConnection('connecting'); setError(''); setVoiceStatus(''); setSnapshot(null); state.current = null
    const music = new Audio(), voice = new Audio(); music.crossOrigin = 'anonymous'; music.preload = 'metadata'; musicAudio.current = music; voiceAudio.current = voice
    music.onloadedmetadata = () => {
      syncMusic()
      const room = state.current
      if (room && room.performerId === id.current && Number.isFinite(music.duration) && music.duration > 0) send({ type: 'duration', url: room.music.url, duration: music.duration })
    }
    music.onerror = () => { if (state.current?.music.url) setError('This track could not be played. Try another audio file or a direct audio link.') }
    let ws: WebSocket
    try { ws = new WebSocket(serverURL()); socket.current = ws } catch { setConnection('offline'); return () => { music.pause(); voice.pause() } }
    const watchdog = watchLiveConnection(ws)
    const timeout = window.setTimeout(() => { if (!initialized) ws.close(4000, 'Connection timeout') }, 45000)
    let stopAuth = () => {}
    ws.onopen = () => { stopAuth = authenticateLiveSocket(ws) }
    ws.onmessage = event => {
      if (!active || typeof event.data !== 'string' || event.data.length > 65536) return
      let value: Record<string, unknown>
      try { value = JSON.parse(event.data); if (!value || typeof value !== 'object') return } catch { return }
      if (value.type === 'waiting' && typeof value.position === 'number') { clearTimeout(timeout); setConnection('waiting'); setQueuePosition(value.position); return }
      if (value.type === 'welcome' && typeof value.id === 'string' && typeof value.uploadToken === 'string') {
        id.current = value.id; token.current = value.uploadToken; setSelfId(value.id); initialized = true; recoveryAttempt.current = 0; clearTimeout(timeout); setConnection('live'); watchdog.received()
        send({ type: 'name', name }); send({ type: 'clock', clientTime: Date.now() }); return
      }
      if (value.type === 'clock' && typeof value.serverTime === 'number' && typeof value.clientTime === 'number') { clockOffset.current = value.serverTime - (Date.now() + value.clientTime) / 2; return }
      if (value.type === 'error' && typeof value.message === 'string') { setError(value.message.slice(0, 200)); return }
      if (value.type === 'signal' && typeof value.from === 'string') { const signal = parseOatSignal(value.signal); if (signal) signalReceive.current(value.from, signal); return }
      if (value.type === 'voice-ready' && typeof value.from === 'string' && state.current?.performerId === id.current) { closePeer(value.from); offerTo(value.from); return }
      const next = parseOatSnapshot(value)
      if (!next || !id.current || (state.current && next.sequence < state.current.sequence)) return
      watchdog.received()
      const previous = state.current; state.current = next; setSnapshot(next)
      if (previous?.performerId === id.current && next.performerId !== id.current) stopMic()
      voiceReconcile.current(); syncMusic()
    }
    const disconnect = () => {
      if (!active) return
      clearTimeout(timeout); setConnection('offline'); stopMic(); muteSound(); setVoiceStatus(''); state.current = null; setSnapshot(null); setSelfId(null); id.current = null
      voice.pause(); voice.srcObject = null; voiceConnected.current = false; music.pause(); upload.current?.abort()
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
    const timer = window.setInterval(syncMusic, 500), clock = window.setInterval(() => send({ type: 'clock', clientTime: Date.now() }), 10000)
    return () => {
      active = false; stopAuth(); watchdog.stop(); clearTimeout(timeout); clearTimeout(recoveryTimer); clearInterval(timer); clearInterval(clock); stopMic(); muteSound(); upload.current?.abort(); earlyCandidates.current.clear()
      ws.close(); socket.current = null; id.current = null; token.current = ''; state.current = null; setSnapshot(null); setSelfId(null); setVoiceStatus('')
      voiceConnected.current = false; if (mixer.current) { void mixer.current.context.close(); mixer.current = null }
      music.onloadedmetadata = null; music.onerror = null; music.pause(); music.removeAttribute('src'); voice.pause(); voice.srcObject = null; musicAudio.current = null; voiceAudio.current = null
    }
  }, [joined, retry, automaticRetry, name, send, syncMusic, stopMic, muteSound, closePeer, offerTo])
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
  return { connection, queuePosition, snapshot, selfId, error, mic, listening, soundBlocked, volume, voiceStatus, uploading, playhead, action, startMic, stopMic, enableSound, muteSound, changeVolume, loadTrack, shareFile, transport }
}
export type OatSession = ReturnType<typeof useOatSession>
