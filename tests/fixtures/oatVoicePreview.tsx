// Real hook, WebSocket server and WebRTC media. Synthetic tone replaces microphone capture.
import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { useOatSession } from '../../src/hooks/useOatSession'
import type { OatRuntime, OatSession } from '../../src/hooks/useOatSession'
import { OatAudio } from '../../src/lib/oatAudio'
import OatControls from '../../src/components/OatControls'
import '../../src/styles.css'

const handles: Record<string, { join: () => void; session: OatSession }> = {}
const pcs: Record<string, RTCPeerConnection[]> = { performer: [], listener: [] }
const traffic: Record<string, string[]> = { performer: [], listener: [] }
const iceReceived = new WeakMap<RTCPeerConnection, number>()
const routes: Record<string, string> = { performer: '', listener: '' }
const forceRelay = new URLSearchParams(location.search).has('relay')
const fixtureId = crypto.randomUUID()
const runtime = (name: string): OatRuntime => ({
  openSocket: () => {
    const ws = new WebSocket('ws://127.0.0.1:4193/oat'), send = ws.send.bind(ws)
    ws.send = value => { const message = JSON.parse(String(value)); if (message.type === 'signal') traffic[name].push('sent:' + message.signal.kind); send(value) }
    ws.addEventListener('message', event => { const message = JSON.parse(event.data); if (message.type === 'signal') traffic[name].push('received:' + message.signal.kind); if (message.type === 'error') traffic[name].push(message.message) })
    return ws
  },
  authenticate: socket => { socket.send(JSON.stringify({ type: 'authenticate', token: `voice-${name}-${fixtureId}` })); return () => {} },
  capture: async () => {
    const ctx = new AudioContext(), tone = ctx.createOscillator(), gain = ctx.createGain(), output = ctx.createMediaStreamDestination()
    tone.frequency.value = 440; gain.gain.value = .08; tone.connect(gain); gain.connect(output); tone.start()
    await ctx.resume()
    const track = output.stream.getAudioTracks()[0], stop = track.stop.bind(track)
    track.stop = () => { stop(); tone.stop(); void ctx.close() }
    return output.stream
  },
  createPeer: configuration => { const pc = new RTCPeerConnection({ ...configuration, ...(forceRelay ? { iceTransportPolicy: 'relay' } : {}) }); pcs[name].push(pc)
    const add = pc.addIceCandidate.bind(pc)
    pc.addIceCandidate = (...args) => { iceReceived.set(pc, (iceReceived.get(pc) ?? 0) + 1); return add(...args) }
    return pc },
})
const runtimes = { performer: runtime('performer'), listener: runtime('listener') }
function Person({ name }: { name: 'performer' | 'listener' }) {
  const [debug, setDebug] = useState('')
  const [joined, setJoined] = useState(false), [retry, setRetry] = useState(0), [bytes, setBytes] = useState(0)
  const session = useOatSession(joined, name, retry, runtimes[name])
  handles[name] = { join: () => { session.enableSound(); setJoined(true) }, session }
  useEffect(() => {
    const timer = setInterval(async () => {
      let bytes = 0
      routes[name] = ''
      for (const pc of pcs[name]) if (pc.connectionState === 'connected') {
        const stats = await pc.getStats()
        stats.forEach(report => { if (report.type === 'inbound-rtp' && report.kind === 'audio') { bytes += report.bytesReceived ?? 0 } })
        stats.forEach(report => {
          if (report.type !== 'transport' || !report.selectedCandidatePairId) return
          const pair = stats.get(report.selectedCandidatePairId), local = pair && stats.get(pair.localCandidateId), remote = pair && stats.get(pair.remoteCandidateId)
          routes[name] = `${local?.candidateType ?? 'unknown'} → ${remote?.candidateType ?? 'unknown'}`
        })
      }
      setBytes(bytes); setDebug('Route: ' + (routes[name] || 'pending') + ' / ' + pcs[name].map(pc => `${pc.connectionState}/${pc.iceConnectionState}/${pc.signalingState} ${pc.localDescription?.type ?? '-'}→${pc.remoteDescription?.type ?? '-'} ${pc.localDescription?.sdp.match(/m=audio [^\r\n]+/)?.[0]} ${pc.localDescription?.sdp.match(/a=(sendonly|sendrecv|recvonly|inactive)/g)?.join(',')} tracks:${pc.getSenders().map(s => s.track?.readyState + ':' + s.track?.enabled).join(',')} candidates:${pc.localDescription?.sdp.match(/a=candidate:/g)?.length ?? 0} remoteICE:${iceReceived.get(pc) ?? 0}`).join('; ') + ' / traffic: ' + traffic[name].join(','))
    }, 500)
    return () => clearInterval(timer)
  }, [name])
  return <article>
    <h2>{name}</h2>
    <output>{debug}</output>
    <output>Audio RTP bytes: {bytes} · connections created: {pcs[name].length}</output>
    <button onClick={() => {
      const pc = pcs[name].findLast(pc => pc.connectionState === 'connected')
      if (!pc) return
      pc.close(); Object.defineProperty(pc, 'connectionState', { value: 'failed', configurable: true }); pc.dispatchEvent(new Event('connectionstatechange'))
    }}>Simulate {name} connection failure</button>
    <OatControls session={session} joined={joined} onJoin={() => setJoined(true)} onRetry={() => setRetry(value => value + 1)} onClose={() => setJoined(false)}/>
  </article>
}
const until = async (condition: () => boolean) => {
  const deadline = Date.now() + 15000
  while (!condition()) { if (Date.now() > deadline) throw new Error('Timed out'); await new Promise(resolve => setTimeout(resolve, 50)) }
}
function Preview() {
  const [result, setResult] = useState('')
  const run = async () => {
    try {
      setResult('Starting two real media connections…')
      handles.performer.join(); handles.listener.join()
      await until(() => handles.performer.session.snapshot?.participants.length === 2)
      handles.performer.session.action({ type: 'stage' })
      await until(() => handles.performer.session.snapshot?.performerId === handles.performer.session.selfId)
      await handles.performer.session.startMic()
      await until(() => handles.listener.session.voiceLevel > .025)
      if (forceRelay) await until(() => routes.listener === 'relay → relay')
      setResult(forceRelay ? 'PASS: decoded live voice received through TURN (relay → relay)' : 'PASS: decoded live voice received by listener')
    } catch (error) { setResult(`FAIL: ${error instanceof Error ? error.message : String(error)}`) }
  }
  const direct = async () => {
    const audio = new OatAudio(), source = audio.context.createOscillator(), volume = audio.context.createGain(), output = audio.context.createMediaStreamDestination()
    const a = new RTCPeerConnection(), b = new RTCPeerConnection(), ac: RTCIceCandidate[] = [], bc: RTCIceCandidate[] = []
    void audio.unlock(); audio.setListening(true, .1)
    volume.gain.value = .08; source.connect(volume); volume.connect(output); source.start()
    a.onicecandidate = event => { if (event.candidate) { if (b.remoteDescription) void b.addIceCandidate(event.candidate); else bc.push(event.candidate) } }
    b.onicecandidate = event => { if (event.candidate) { if (a.remoteDescription) void a.addIceCandidate(event.candidate); else ac.push(event.candidate) } }
    b.ontrack = event => audio.receive(event.streams[0])
    a.addTrack(output.stream.getAudioTracks()[0], output.stream)
    try {
      setResult('Checking bare WebRTC without the app signaling…')
      await a.setLocalDescription(await a.createOffer()); await b.setRemoteDescription(a.localDescription!)
      for (const ice of bc) await b.addIceCandidate(ice)
      await b.setLocalDescription(await b.createAnswer()); await a.setRemoteDescription(b.localDescription!)
      for (const ice of ac) await a.addIceCandidate(ice)
      await until(() => audio.voiceLevel() > .025)
      setResult('PASS: bare WebRTC decoded audio')
    } catch { setResult(`Bare WebRTC failed: ${a.connectionState}/${a.iceConnectionState} ↔ ${b.connectionState}/${b.iceConnectionState}`) }
    finally { a.close(); b.close(); source.stop(); output.stream.getTracks().forEach(t => t.stop()); audio.close() }
  }
  return <main><h1>OAT audio rehearsal</h1><p>Local only. Synthetic tone; no microphone capture. Join both, take stage as performer, start microphone. Check Received voice level moves, then mute/retry/end turn.</p><button onClick={() => void direct()}>Check bare WebRTC</button><button onClick={() => void run()}>Start two-person audio rehearsal</button><p role="status">{result}</p><div className="voice-columns"><Person name="performer"/><Person name="listener"/></div><style>{`
    html, body, #root { width:auto; height:auto; overflow:visible; }
    body { background: #e7ede5; color: #22473d; font-family: system-ui; margin: 24px; }
    .voice-columns { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap:24px; }
    output { display:block; font-size:12px; margin-bottom:12px; }
    .oat-controls { position: static; width:100%; box-sizing:border-box; margin-top:12px; overflow:visible; }
    @media(max-width:700px) { .voice-columns { grid-template-columns: 1fr; } body{margin:12px;} }
  `}</style></main>
}
if (import.meta.env.DEV) createRoot(document.getElementById('root')!).render(<Preview/>);
