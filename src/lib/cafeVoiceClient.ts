import { parseCafeVoiceEvent } from './cafeVoiceProtocol.ts'
import type { CafeVoiceEvent, CafeVoiceState, CafeVoiceMember } from './cafeVoiceProtocol.ts'
import type { OatSignal } from './oatProtocol.ts'
import type { OatIceConfiguration } from './oatIce.ts'
import { CafeVoiceAudio } from './cafeVoiceAudio.ts'

export interface TableVoiceView { joined: boolean; pending: boolean; mic: boolean; table: number | null; members: CafeVoiceMember[]; connected: number; error: string; usage?: CafeVoiceState['usage'] }
export interface TableAudio { unlock(): Promise<void>; receive(id: string, stream: MediaStream): void; remove(id: string): void; volume(value: number): void; mute(id: string, value: boolean): void; close(): void }
export interface TableVoiceRuntime { capture(): Promise<MediaStream>; peer(configuration: RTCConfiguration): RTCPeerConnection; audio(): TableAudio }
export const browserTableVoiceRuntime: TableVoiceRuntime = {
  capture: () => navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false }),
  peer: configuration => new RTCPeerConnection(configuration), audio: () => new CafeVoiceAudio(),
}
type Peer = { pc: RTCPeerConnection; sender: RTCRtpSender | null; connectionId: string; remote: CafeVoiceMember; retry?: ReturnType<typeof setTimeout> }
/** Independent of rendering and avatar motion. All asynchronous work is seat/session guarded. */
export class CafeVoiceClient {
  private state: CafeVoiceState | null = null
  private ice: OatIceConfiguration | null = null
  private audio: TableAudio | null = null
  private stream: MediaStream | null = null
  private peers = new Map<string, Peer>()
  private candidates = new Map<string, RTCIceCandidateInit[]>()
  private waitingSignals: Extract<CafeVoiceEvent, { type: 'cafe-voice-signal' }>[] = []
  private chain = Promise.resolve()
  private revision = 0
  private pending = false
  private error = ''
  private gain = .8
  private muted = new Set<string>()
  private timeout?: ReturnType<typeof setTimeout>
  private refresh?: ReturnType<typeof setTimeout>
  private retries = new Map<string, number>()
  private disposed = false
  private send: (value: unknown) => boolean
  private changed: (view: TableVoiceView) => void
  private runtime: TableVoiceRuntime
  constructor(send: (value: unknown) => boolean, changed: (view: TableVoiceView) => void, runtime: TableVoiceRuntime = browserTableVoiceRuntime) { this.send = send; this.changed = changed; this.runtime = runtime }
  view(): TableVoiceView { return { joined: !!this.state?.sessionId, pending: this.pending, mic: !!this.stream, table: this.state?.table ?? null, members: this.state?.members ?? [], connected: [...this.peers.values()].filter(p => p.pc.connectionState === 'connected').length, error: this.error, usage: this.state?.usage } }
  private emit() { if (!this.disposed) this.changed(this.view()) }
  private unlock() {
    this.audio ??= this.runtime.audio(); this.audio.volume(this.gain)
    for (const id of this.muted) this.audio.mute(id, true)
    return this.audio.unlock()
  }
  listen() {
    if (this.disposed || this.pending) return
    this.error = ''; this.pending = true; const revision = this.revision; this.emit()
    void this.unlock().then(() => { if (!this.disposed && this.revision === revision) this.join() }).catch(() => { if (this.revision === revision && !this.disposed) this.fail('Tap Listen again to enable table audio.') })
  }
  async startMic() {
    if (this.disposed || this.pending || this.stream) return
    const revision = this.revision
    this.pending = true; this.error = ''; this.emit()
    try {
      await this.unlock()
      const stream = await this.runtime.capture()
      if (this.disposed || revision !== this.revision) { stream.getTracks().forEach(t => t.stop()); return }
      if (!stream.getAudioTracks().some(t => t.readyState === 'live')) { stream.getTracks().forEach(t => t.stop()); throw new Error('empty mic') }
      this.stream = stream
      for (const track of stream.getAudioTracks()) track.onended = () => { if (this.stream === stream) this.muteMic() }
      await Promise.all([...this.peers.values()].map(async p => { await p.sender?.replaceTrack(stream.getAudioTracks()[0]); this.limitBitrate(p) }))
      if (revision !== this.revision) return
      this.pending = false
      if (this.state?.sessionId) {
        if (!this.send({ type: 'cafe-voice-mic', sessionId: this.state.sessionId, mic: true })) throw new Error('offline')
      } else this.join()
      this.emit()
    } catch { if (revision === this.revision && !this.disposed) { this.muteMic(); this.fail('Microphone unavailable. Allow microphone access in your browser, or join with Listen.'); } }
  }
  muteMic() {
    this.revision++; const stream = this.stream; this.stream = null
    stream?.getTracks().forEach(t => { t.onended = null; t.stop() })
    for (const p of this.peers.values()) void p.sender?.replaceTrack(null).catch(() => {})
    if (this.state?.sessionId) this.send({ type: 'cafe-voice-mic', sessionId: this.state.sessionId, mic: false })
    this.pending = false; this.emit()
  }
  volume(value: number) { this.gain = Math.max(0, Math.min(1, value)); this.audio?.volume(this.gain) }
  mute(id: string, value: boolean) { if (value) this.muted.add(id); else this.muted.delete(id); this.audio?.mute(id, value) }
  private join() {
    if (this.state?.sessionId) { this.emit(); return }
    if (!this.send({ type: 'cafe-voice-join', mic: !!this.stream })) { this.fail('Connect to the live campus before joining table voice.'); return }
    this.pending = true; clearTimeout(this.timeout)
    this.timeout = setTimeout(() => this.fail('Table voice did not connect. Please try again.'), 12000); this.emit()
  }
  leave() {
    if (this.pending || this.state?.sessionId) this.send({ type: 'cafe-voice-leave', sessionId: this.state?.sessionId })
    this.reset(); this.error = ''; this.emit()
  }
  private reset() {
    this.revision++; clearTimeout(this.timeout); clearTimeout(this.refresh)
    this.state = null; this.ice = null; this.pending = false
    const stream = this.stream; this.stream = null; stream?.getTracks().forEach(t => { t.onended = null; t.stop() })
    for (const id of this.peers.keys()) this.closePeer(id)
    this.candidates.clear(); this.waitingSignals = []; this.retries.clear(); this.muted.clear(); this.audio?.close(); this.audio = null
  }
  private fail(message: string) { this.leave(); this.error = message; this.emit() }
  receive(value: unknown) {
    if (this.disposed) return
    const event = parseCafeVoiceEvent(value)
    if (!event) return
    if (event.type === 'cafe-voice-reset') { this.reset(); this.error = 'Campus connection interrupted. Rejoin table voice when connected.'; this.emit(); return }
    if (event.type === 'cafe-voice-error') { this.fail(event.message); return }
    if (event.type === 'cafe-voice-state') {
      if (!event.sessionId) { const usage = event.usage; this.reset(); this.state = event; if (usage && usage.availability !== 'available') this.error = 'Table voice is paused by the campus relay limit or availability check.'; this.emit(); return }
      if (!this.audio || !this.pending && !this.state?.sessionId) { this.send({ type: 'cafe-voice-leave' }); return }
      if (this.state?.sessionId && this.state.sessionId !== event.sessionId) { this.fail('Your table changed. Join its conversation again.'); return }
      this.state = event
      this.waitingSignals = this.waitingSignals.filter(s => event.members.some(m => m.id === s.from && m.sessionId === s.fromSessionId))
      for (const key of this.candidates.keys()) if (!event.members.some(m => key.startsWith(m.id + ':'))) this.candidates.delete(key)
      for (const [id, peer] of this.peers) if (!event.members.some(m => m.id === id && m.sessionId === peer.remote.sessionId)) { this.closePeer(id); this.retries.delete(id) }
      this.syncPeers(); this.emit(); return
    }
    if (event.sessionId !== this.state?.sessionId) return
    if (event.type === 'cafe-voice-ice') {
      this.ice = event.configuration; this.pending = false; clearTimeout(this.timeout); clearTimeout(this.refresh)
      for (const p of this.peers.values()) p.pc.setConfiguration({ iceServers: this.ice.iceServers })
      const sessionId = this.state.sessionId
      this.refresh = setTimeout(() => { if (this.state?.sessionId === sessionId) { this.send({ type: 'cafe-voice-ice-request', sessionId }); this.timeout = setTimeout(() => this.fail('The table relay expired. Please reconnect.'), Math.max(1000, event.configuration.expiresAt - Date.now())) } }, Math.max(60000, event.configuration.expiresAt - Date.now() - 120000))
      this.syncPeers(); const waiting = this.waitingSignals.splice(0); for (const signal of waiting) this.receive(signal); this.emit(); return
    }
    if (!this.state.members.some(m => m.id === event.from && m.sessionId === event.fromSessionId)) return
    if (!this.ice) { if (this.waitingSignals.length < 96) this.waitingSignals.push(event); return }
    this.chain = this.chain.then(() => this.signal(event)).catch(() => { if (this.state?.sessionId === event.sessionId) { this.error = 'A table connection needs a retry. Check your network.'; this.emit() } })
  }
  private own() { return this.state?.members.find(m => m.sessionId === this.state?.sessionId) }
  private current(id: string, peer: Peer) { return this.peers.get(id) === peer && !!this.state?.members.some(m => m.id === id && m.sessionId === peer.remote.sessionId) }
  private sendSignal(peer: Peer, signal: OatSignal) { if (this.current(peer.remote.id, peer)) this.send({ type: 'cafe-voice-signal', sessionId: this.state?.sessionId, to: peer.remote.id, toSessionId: peer.remote.sessionId, signal: { ...signal, connectionId: peer.connectionId } }) }
  private closePeer(id: string) {
    const peer = this.peers.get(id); if (!peer) return
    this.peers.delete(id); clearTimeout(peer.retry); peer.pc.onicecandidate = null; peer.pc.ontrack = null; peer.pc.onconnectionstatechange = null; peer.pc.close(); this.audio?.remove(id)
    for (const key of this.candidates.keys()) if (key.startsWith(id + ':')) this.candidates.delete(key)
  }
  private makePeer(remote: CafeVoiceMember, connectionId: string, answering = false): Peer {
    this.closePeer(remote.id)
    const pc = this.runtime.peer({ iceServers: this.ice!.iceServers }), transceiver = answering ? null : pc.addTransceiver('audio', { direction: 'sendrecv' })
    const peer: Peer = { pc, sender: transceiver?.sender ?? null, remote, connectionId }; this.peers.set(remote.id, peer)
    if (this.stream && peer.sender) void peer.sender.replaceTrack(this.stream.getAudioTracks()[0]).catch(() => {})
    pc.onicecandidate = event => { if (event.candidate) this.sendSignal(peer, { kind: 'ice', candidate: { candidate: event.candidate.candidate, sdpMid: event.candidate.sdpMid, sdpMLineIndex: event.candidate.sdpMLineIndex } }) }
    pc.ontrack = event => { if (this.current(remote.id, peer)) this.audio?.receive(remote.id, event.streams[0] ?? new MediaStream([event.track])) }
    pc.onconnectionstatechange = () => {
      if (!this.current(remote.id, peer)) return
      clearTimeout(peer.retry)
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        // Only the ordered initiator restarts: no offer glare or retry storms.
        if (this.own()!.id < remote.id && (this.retries.get(remote.id) ?? 0) < 2) peer.retry = setTimeout(() => {
          if (!this.current(remote.id, peer)) return
          this.retries.set(remote.id, (this.retries.get(remote.id) ?? 0) + 1); this.closePeer(remote.id); this.syncPeers()
        }, pc.connectionState === 'failed' ? 1500 : 6000)
        else if (pc.connectionState === 'failed') this.error = 'A caller could not connect. Leave and rejoin to retry.'
      }
      if (pc.connectionState === 'connected') {
        this.error = ''
        this.limitBitrate(peer)
      }
      this.emit()
    }
    return peer
  }
  private limitBitrate(peer: Peer) {
    const parameters = peer.sender?.getParameters()
    if (peer.sender && parameters?.encodings?.length) { parameters.encodings.forEach(encoding => { encoding.maxBitrate = 32000 }); void peer.sender.setParameters(parameters).catch(() => {}) }
  }
  private syncPeers() {
    const own = this.own(); if (!own || !this.ice) return
    for (const remote of this.state!.members) if (own.id < remote.id && !this.peers.has(remote.id)) {
      const peer = this.makePeer(remote, crypto.randomUUID())
      this.chain = this.chain.then(async () => {
        if (!this.current(remote.id, peer)) return
        await peer.pc.setLocalDescription(await peer.pc.createOffer())
        if (peer.pc.localDescription) this.sendSignal(peer, { kind: 'offer', sdp: peer.pc.localDescription.sdp })
      }).catch(() => { if (this.current(remote.id, peer)) { this.error = 'Table audio could not connect. Leave and rejoin to retry.'; this.emit() } })
    }
  }
  private async signal(event: Extract<CafeVoiceEvent, { type: 'cafe-voice-signal' }>) {
    if (event.sessionId !== this.state?.sessionId) return
    const remote = this.state.members.find(m => m.id === event.from && m.sessionId === event.fromSessionId), own = this.own()
    if (!remote || !own) return
    const signal = event.signal, connectionId = signal.connectionId!, key = `${remote.id}:${connectionId}`
    let peer = this.peers.get(remote.id)
    if (signal.kind === 'offer') {
      if (own.id < remote.id) return
      peer = this.makePeer(remote, connectionId, true)
      await peer.pc.setRemoteDescription({ type: 'offer', sdp: signal.sdp })
      if (!this.current(remote.id, peer)) return
      // Answer on the transceiver associated with the remote audio m-line.
      // Pre-adding an answerer transceiver can create an unnegotiated second
      // sender in Chromium, producing connected but one-way silent calls.
      const transceiver = peer.pc.getTransceivers().find(t => t.receiver.track.kind === 'audio')
      if (!transceiver) throw new Error('Missing table audio transceiver')
      transceiver.direction = 'sendrecv'; peer.sender = transceiver.sender
      await peer.sender.replaceTrack(this.stream?.getAudioTracks()[0] ?? null)
      if (!this.current(remote.id, peer)) return
      await this.flushCandidates(key, peer)
      await peer.pc.setLocalDescription(await peer.pc.createAnswer())
      if (peer.pc.localDescription) this.sendSignal(peer, { kind: 'answer', sdp: peer.pc.localDescription.sdp })
    } else if (signal.kind === 'answer') {
      if (!peer || peer.connectionId !== connectionId || own.id > remote.id || peer.pc.signalingState !== 'have-local-offer') return
      await peer.pc.setRemoteDescription({ type: 'answer', sdp: signal.sdp })
      if (this.current(remote.id, peer)) await this.flushCandidates(key, peer)
    } else if (signal.kind === 'ice') {
      if (peer && peer.connectionId !== connectionId) return
      if (peer?.pc.remoteDescription) await peer.pc.addIceCandidate(signal.candidate)
      else {
        if (!this.candidates.has(key) && this.candidates.size >= 6) return
        const queue = this.candidates.get(key) ?? []; if (queue.length < 48) queue.push(signal.candidate); this.candidates.set(key, queue)
      }
    }
  }
  private async flushCandidates(key: string, peer: Peer) { const queue = this.candidates.get(key) ?? []; this.candidates.delete(key); for (const candidate of queue) if (this.current(peer.remote.id, peer)) await peer.pc.addIceCandidate(candidate) }
  close() { this.leave(); this.disposed = true }
}
