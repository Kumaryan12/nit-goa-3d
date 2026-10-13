/** A small audio-only graph: three remote callers at most, no local mic monitoring. */
export class CafeVoiceAudio {
  readonly context: AudioContext
  private gain: GainNode
  private incoming = new Map<string, { source: MediaStreamAudioSourceNode; gain: GainNode; decoder: HTMLAudioElement; analyser: AnalyserNode; samples: Uint8Array<ArrayBuffer> }>()
  private muted = new Set<string>()
  constructor(context = new AudioContext()) {
    this.context = context; this.gain = context.createGain(); this.gain.gain.value = .8; this.gain.connect(context.destination)
  }
  unlock() { for (const peer of this.incoming.values()) void peer.decoder.play().catch(() => {}); return this.context.resume() }
  volume(value: number) { this.gain.gain.value = Math.max(0, Math.min(1, value)) }
  mute(id: string, muted: boolean) { if (muted) this.muted.add(id); else this.muted.delete(id); const peer = this.incoming.get(id); if (peer) peer.gain.gain.value = muted ? 0 : 1 }
  receive(id: string, stream: MediaStream) {
    this.remove(id)
    const decoder = new Audio(); decoder.muted = true; decoder.autoplay = true; decoder.setAttribute('playsinline', ''); decoder.srcObject = stream
    void decoder.play().catch(() => {})
    const source = this.context.createMediaStreamSource(stream), gain = this.context.createGain(), analyser = this.context.createAnalyser()
    analyser.fftSize = 256; gain.gain.value = this.muted.has(id) ? 0 : 1
    source.connect(analyser); analyser.connect(gain); gain.connect(this.gain)
    this.incoming.set(id, { source, gain, decoder, analyser, samples: new Uint8Array(analyser.fftSize) })
  }
  level(id: string) {
    const peer = this.incoming.get(id)
    if (!peer || this.context.state !== 'running') return 0
    peer.analyser.getByteTimeDomainData(peer.samples)
    return Math.sqrt(peer.samples.reduce((sum, x) => sum + ((x - 128) / 128) ** 2, 0) / peer.samples.length)
  }
  remove(id: string) { const peer = this.incoming.get(id); if (!peer) return; peer.source.disconnect(); peer.analyser.disconnect(); peer.gain.disconnect(); peer.decoder.pause(); peer.decoder.srcObject = null; this.incoming.delete(id) }
  close() { for (const id of this.incoming.keys()) this.remove(id); this.gain.disconnect(); void this.context.close().catch(() => {}) }
}
