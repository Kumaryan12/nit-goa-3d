// Four genuine WebRTC callers through the actual authenticated presence server.
// Synthetic tones replace human microphone capture; no production auth bypass.
import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { CafeVoiceClient } from '../../src/lib/cafeVoiceClient'
import type { TableVoiceView } from '../../src/lib/cafeVoiceClient'
import { CafeVoiceAudio } from '../../src/lib/cafeVoiceAudio'
import CafeTableVoice from '../../src/components/CafeTableVoice'
import '../../src/styles.css'
import '../../src/components/CafeCounter.css'
import '../../src/components/SocialActions.css'
const fixtureId = crypto.randomUUID(), clients: CafeVoiceClient[] = [], pcs: RTCPeerConnection[][] = [[], [], [], []], graphs: CafeVoiceAudio[] = [], tracks: MediaStreamTrack[] = []
const traffic: string[][] = [[], [], [], []]
const sockets: WebSocket[] = [], seated = [false, false, false, false]
const forceRelay = new URLSearchParams(location.search).has('relay')
const until = async (check: () => boolean) => { const deadline = Date.now() + 20000; while (!check()) { if (Date.now() > deadline) throw new Error('Audio timed out'); await new Promise(r => setTimeout(r, 50)) } }
async function tone(slot: number) {
  const context = new AudioContext(), oscillator = context.createOscillator(), gain = context.createGain(), output = context.createMediaStreamDestination()
  oscillator.frequency.value = 300 + slot * 150; gain.gain.value = .08; oscillator.connect(gain); gain.connect(output); oscillator.start(); await context.resume()
  const track = output.stream.getAudioTracks()[0], stop = track.stop.bind(track); tracks.push(track)
  track.stop = () => { stop(); oscillator.stop(); void context.close() }
  return output.stream
}
const self = (slot: number) => `table-${slot}-${fixtureId}`
function Person({ slot }: { slot: number }) {
  const [view, setView] = useState<TableVoiceView>({ joined: false, pending: false, mic: false, table: null, members: [], connected: 0, error: '' }), [metrics, setMetrics] = useState('Connecting to rehearsal'), [drink, setDrink] = useState('No drink'), [volume, setVolume] = useState(.06), [muted, setMuted] = useState<Set<string>>(new Set())
  useEffect(() => {
    const ws = new WebSocket('ws://127.0.0.1:4194/presence'); sockets[slot] = ws
    const voice = new CafeVoiceClient(value => { const message = value as { type: string; signal?: { kind: string } }; if (message.signal) traffic[slot].push('sent:' + message.signal.kind); if (ws.readyState !== WebSocket.OPEN) return false; ws.send(JSON.stringify(value)); return true }, setView, {
      capture: () => tone(slot), audio: () => { const graph = new CafeVoiceAudio(); graphs[slot] = graph; return graph },
      peer: configuration => { const pc = new RTCPeerConnection({ ...configuration, ...(forceRelay ? { iceTransportPolicy: 'relay' } : {}) }); pcs[slot].push(pc); return pc },
    }); clients[slot] = voice; voice.volume(.06)
    let pose = { x: 10 + slot, y: 0, z: 10, yaw: 0, epoch: 1, active: true, visible: true, moving: false, running: false, vehicle: 'walk', space: 'outdoors' }
    ws.onopen = () => ws.send(JSON.stringify({ type: 'authenticate', token: self(slot) }))
    ws.onmessage = event => {
      const message = JSON.parse(event.data)
      if (message.type === 'campus-welcome') { ws.send(JSON.stringify({ type: 'social-capabilities', cafeSeats: true })); ws.send(JSON.stringify({ type: 'pose', activity: 'walk', pose })); ws.send(JSON.stringify({ type: 'social-action', action: 'sit', seatId: `cafe-0-${slot}` })) }
      if (message.type === 'campus-state') { const own = message.people.find((p: { id: string }) => p.id === self(slot)); if (own?.pose) pose = own.pose; seated[slot] = own?.social?.action === 'sit'; setDrink(own?.drink ? `${own.drink.kind}${own.drink.sipAt ? ' · sipping' : ''}` : 'No drink') }
      if (message.type === 'cafe-voice-signal') traffic[slot].push('received:' + message.signal.kind); if (message.type.startsWith('cafe-voice-')) voice.receive(message)
    }
    const heartbeat = setInterval(() => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'pose', activity: 'walk', pose })) }, 250)
    const monitor = setInterval(async () => {
      let bytes = 0, relay = 0
      for (const pc of pcs[slot]) if (pc.connectionState === 'connected') { const stats = await pc.getStats(); stats.forEach(report => { if (report.type === 'inbound-rtp' && report.kind === 'audio') bytes += report.bytesReceived ?? 0; if (report.type === 'transport' && report.selectedCandidatePairId) { const pair = stats.get(report.selectedCandidatePairId), local = pair && stats.get(pair.localCandidateId), remote = pair && stats.get(pair.remoteCandidateId); if (local?.candidateType === 'relay' && remote?.candidateType === 'relay') relay++ } }) }
      const levels = clients[slot]?.view().members.filter(m => m.id !== self(slot)).map(m => graphs[slot]?.level(m.id) ?? 0)
      setMetrics(`${seated[slot] ? 'Seated' : 'Standing'} · ${bytes} audio bytes · ${relay} relay links · levels ${levels.map(n => n.toFixed(3)).join(', ')} · peers ${pcs[slot].map(pc => `${pc.connectionState}/${pc.iceConnectionState}/${pc.signalingState} ${pc.localDescription?.type ?? '-'}>${pc.remoteDescription?.type ?? '-'} localICE:${pc.localDescription?.sdp.match(/a=candidate:/g)?.length ?? 0} remoteICE:${pc.remoteDescription?.sdp.match(/a=candidate:/g)?.length ?? 0}`).join('; ')} · ${traffic[slot].slice(-24).join(',')}`)
    }, 500)
    return () => { clearInterval(heartbeat); clearInterval(monitor); voice.close(); ws.close() }
  }, [slot])
  const voice = { view, volume, muted, leaveNotice: '', dismissLeaveNotice: () => {}, listen: () => clients[slot].listen(), startMic: () => void clients[slot].startMic(), muteMic: () => clients[slot].muteMic(), leave: () => clients[slot].leave(), setVolume: (v: number) => { setVolume(v); clients[slot].volume(v) }, toggleMute: (id: string) => setMuted(previous => { const next = new Set(previous); if (next.has(id)) next.delete(id); else next.add(id); clients[slot].mute(id, next.has(id)); return next }) }
  return <article className="social-action-panel" style={{ position: 'relative', inset: 'auto', width: '100%', maxHeight: 'none' }}>
    <h2>Tablemate {slot + 1}</h2><output style={{ display: 'block', fontSize: 11 }}>{metrics}</output>
    <div className="cafe-drink-actions"><button onClick={() => sockets[slot].send(JSON.stringify({ type: 'cafe-drink', action: 'get', kind: 'coffee' }))}>Coffee</button><button onClick={() => sockets[slot].send(JSON.stringify({ type: 'cafe-drink', action: 'sip' }))}>Sip</button><button onClick={() => { clients[slot].leave(); sockets[slot].send(JSON.stringify({ type: 'social-action', action: 'stop' })) }}>Stand up</button></div><p>{drink}</p>
    <CafeTableVoice voice={voice} enabled={seated[slot]} ownId={self(slot)} />
  </article>
}
function Preview() {
  useEffect(() => { const hidden = () => { if (document.hidden) clients.forEach(c => c.leave()) }; document.addEventListener('visibilitychange', hidden); return () => document.removeEventListener('visibilitychange', hidden) }, [])
  const [result, setResult] = useState('Synthetic audio only · no microphone permission needed')
  const run = async () => {
    try {
      setResult('Joining four real callers…'); await until(() => seated.every(Boolean))
      // Unlock all receiver graphs in the click gesture before permission/network awaits.
      clients.forEach(c => c.listen()); await until(() => clients.every(c => c.view().joined && !c.view().pending))
      await Promise.all(clients.map(c => c.startMic()))
      await until(() => clients.every(c => c.view().connected === 3))
      await until(() => clients.every((c, i) => c.view().members.filter(m => m.id !== self(i)).every(m => graphs[i].level(m.id) > .025)))
      sockets[0].send(JSON.stringify({ type: 'cafe-drink', action: 'get', kind: 'coffee' })); await new Promise(r => setTimeout(r, 3200)); sockets[0].send(JSON.stringify({ type: 'cafe-drink', action: 'sip' }))
      if (!clients[0].view().mic || !seated[0]) throw new Error('Drinking interrupted voice or seating')
      setResult('PASS: four seated callers hear three decoded audio streams each; coffee and sipping keep the mic live.')
    } catch (e) { setResult(`FAIL: ${e instanceof Error ? e.message : String(e)}`) }
  }
  return <main style={{ padding: 24, minHeight: '100dvh', background: '#e7ece2' }}><h1>Nescafé table voice rehearsal</h1><button onClick={() => void run()}>Run four-caller audio test</button><p role="status">{result}</p><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))', gap: 12 }}>{[0, 1, 2, 3].map(slot => <Person slot={slot} key={slot} />)}</div></main>
}
if (import.meta.env.DEV) createRoot(document.getElementById('root')!).render(<Preview />)
