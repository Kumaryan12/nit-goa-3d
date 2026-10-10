/** One gesture-unlocked audio graph for both concert playback and microphone mixing. */
export class OatAudio {
  readonly context: AudioContext
  private monitor: GainNode
  private voiceGain: GainNode
  private backing: GainNode
  private music: MediaElementAudioSourceNode | null = null
  private microphone: MediaStreamAudioSourceNode | null = null
  private analyser: AnalyserNode | null = null
  private samples: Uint8Array<ArrayBuffer> | null = null
  private output: MediaStreamAudioDestinationNode | null = null
  private receiver: HTMLAudioElement | null = null
  private voice: MediaStreamAudioSourceNode | null = null
  private voiceAnalyser: AnalyserNode | null = null
  private voiceSamples: Uint8Array<ArrayBuffer> | null = null
  private incoming: MediaStream | null = null
  private enabled = false
  private volume = .7

  constructor(context = new AudioContext()) {
    this.context = context
    this.monitor = context.createGain(); this.monitor.gain.value = 0; this.monitor.connect(context.destination)
    this.voiceGain = context.createGain(); this.voiceGain.gain.value = 0; this.voiceGain.connect(context.destination)
    this.backing = context.createGain(); this.backing.gain.value = .55
  }
  // Call directly in the click/touch handler, before permission or network awaits.
  unlock() {
    // Retry decoder playout too if a browser deferred the initial muted play.
    if (this.receiver) void this.receiver.play().catch(() => {})
    return this.context.resume()
  }
  attachMusic(audio: HTMLAudioElement) {
    if (this.music) return
    this.music = this.context.createMediaElementSource(audio)
    this.music.connect(this.monitor); this.music.connect(this.backing)
  }
  setListening(enabled: boolean, volume: number) {
    this.enabled = enabled; this.volume = Math.max(0, Math.min(1, volume))
    const gain = enabled ? this.volume : 0
    this.monitor.gain.value = gain; this.voiceGain.gain.value = gain
  }
  startMicrophone(media: MediaStream) {
    if (this.context.state !== 'running') throw new Error('Concert audio is paused. Tap Start live microphone again to enable it.')
    if (!media.getAudioTracks().some(track => track.readyState === 'live' && track.enabled)) throw new Error('Your microphone has no active audio input.')
    this.stopMicrophone()
    this.microphone = this.context.createMediaStreamSource(media)
    this.analyser = this.context.createAnalyser(); this.analyser.fftSize = 256
    this.samples = new Uint8Array(this.analyser.fftSize)
    this.output = this.context.createMediaStreamDestination()
    this.microphone.connect(this.analyser); this.microphone.connect(this.output); this.backing.connect(this.output)
    // The microphone never connects to the local speakers (avoids feedback).
    return this.output.stream
  }
  microphoneLevel() {
    if (!this.analyser || !this.samples || this.context.state !== 'running') return 0
    this.analyser.getByteTimeDomainData(this.samples)
    let sum = 0
    for (const sample of this.samples) sum += ((sample - 128) / 128) ** 2
    return Math.min(1, Math.sqrt(sum / this.samples.length) * 4)
  }
  stopMicrophone() {
    this.microphone?.disconnect(); this.analyser?.disconnect(); this.backing.disconnect()
    this.output?.stream.getTracks().forEach(track => track.stop())
    this.microphone = null; this.analyser = null; this.samples = null; this.output = null
  }
  receive(media: MediaStream) {
    this.disconnectVoice()
    // Chromium's remote WebRTC decoder needs a media-element playout sink.
    // Keep that sink muted: the unlocked Web Audio graph owns audible output.
    if (typeof Audio !== 'undefined') {
      this.receiver = new Audio(); this.receiver.muted = true; this.receiver.autoplay = true
      this.receiver.setAttribute('playsinline', ''); this.receiver.srcObject = media
      void this.receiver.play().catch(() => {})
    }
    this.incoming = media; this.voice = this.context.createMediaStreamSource(media)
    this.voiceAnalyser = this.context.createAnalyser(); this.voiceAnalyser.fftSize = 256
    this.voiceSamples = new Uint8Array(this.voiceAnalyser.fftSize)
    this.voice.connect(this.voiceAnalyser); this.voiceAnalyser.connect(this.voiceGain)
  }
  voiceLevel() {
    if (!this.voiceAnalyser || !this.voiceSamples || this.context.state !== 'running') return 0
    this.voiceAnalyser.getByteTimeDomainData(this.voiceSamples)
    let sum = 0
    for (const sample of this.voiceSamples) sum += ((sample - 128) / 128) ** 2
    return Math.min(1, Math.sqrt(sum / this.voiceSamples.length) * 4)
  }
  disconnectVoice() {
    this.receiver?.pause(); if (this.receiver) this.receiver.srcObject = null; this.receiver = null
    this.voice?.disconnect(); this.voiceAnalyser?.disconnect()
    this.voice = null; this.incoming = null; this.voiceAnalyser = null; this.voiceSamples = null
  }
  get voicePlaying() {
    return this.enabled && this.volume > 0 && (!this.receiver || !this.receiver.paused) && this.context.state === 'running' &&
      !!this.incoming?.getAudioTracks().some(track => track.enabled && !track.muted && track.readyState === 'live')
  }
  close() {
    this.stopMicrophone(); this.disconnectVoice(); this.context.onstatechange = null
    void this.context.close().catch(() => {})
  }
}
