import { atmosphereMix, DEFAULT_ATMOSPHERE } from './campusAtmosphere.ts'
import type { AtmosphereMovement, AtmosphereSettings } from './campusAtmosphere.ts'

/** A small, independent sound graph. It never connects to concert/mic audio. */
export class CampusAudio {
  readonly context: AudioContext
  private master: GainNode
  private wind: GainNode
  private bicycle: GainNode
  private bicycleFilter: BiquadFilterNode
  private loops: AudioBufferSourceNode[] = []
  private oneShots = new Set<AudioScheduledSourceNode>()
  private noise: AudioBuffer
  private settings: AtmosphereSettings = { ...DEFAULT_ATMOSPHERE }
  private nextBird = 0
  private closed = false
  private paused = true
  private lifecycle = 0

  constructor(context: AudioContext = new AudioContext()) {
    this.context = context
    this.master = context.createGain(); this.master.gain.value = 0; this.master.connect(context.destination)
    // A reused four-second filtered noise buffer keeps ambience inexpensive.
    this.noise = context.createBuffer(1, context.sampleRate * 4, context.sampleRate)
    const noise = this.noise.getChannelData(0)
    let smooth = 0
    for (let i = 0; i < noise.length; i++) { smooth = (smooth + (Math.random() * 2 - 1) * .12) / 1.12; noise[i] = smooth * 3 }
    const windFilter = context.createBiquadFilter(); windFilter.type = 'lowpass'; windFilter.frequency.value = 520; windFilter.Q.value = .5
    this.wind = context.createGain(); this.wind.gain.value = 0
    windFilter.connect(this.wind); this.wind.connect(this.master)
    this.bicycleFilter = context.createBiquadFilter(); this.bicycleFilter.type = 'bandpass'; this.bicycleFilter.frequency.value = 480; this.bicycleFilter.Q.value = .6
    this.bicycle = context.createGain(); this.bicycle.gain.value = 0
    this.bicycleFilter.connect(this.bicycle); this.bicycle.connect(this.master)
    for (const filter of [windFilter, this.bicycleFilter]) {
      const source = context.createBufferSource(); source.buffer = this.noise; source.loop = true; source.connect(filter); source.start()
      this.loops.push(source)
    }
  }

  setSettings(settings: AtmosphereSettings) {
    this.settings = settings
    if (settings.muted || settings.volume === 0) this.silence()
    else if (!this.paused) this.master.gain.setTargetAtTime(settings.volume, this.context.currentTime, .025)
    if (!settings.movement) this.bicycle.gain.setValueAtTime(0, this.context.currentTime)
  }

  async resume() {
    if (this.closed || this.settings.muted || this.settings.volume === 0) return false
    const lifecycle = ++this.lifecycle
    await this.context.resume()
    if (this.closed || lifecycle !== this.lifecycle || this.settings.muted || this.settings.volume === 0) return false
    this.paused = false
    this.master.gain.setTargetAtTime(this.settings.volume, this.context.currentTime, .04)
    this.nextBird = this.context.currentTime + 3 + Math.random() * 3
    return this.context.state === 'running'
  }

  private silence() {
    const now = this.context.currentTime
    this.master.gain.cancelScheduledValues(now); this.master.gain.setValueAtTime(0, now)
    this.bicycle.gain.cancelScheduledValues(now); this.bicycle.gain.setValueAtTime(0, now)
    for (const source of this.oneShots) { try { source.stop() } catch { /* Already ended. */ } }
    this.oneShots.clear()
  }

  pause() {
    if (this.closed) return
    this.lifecycle++
    this.paused = true; this.silence()
    void this.context.suspend().catch(() => {})
  }

  update(movement: AtmosphereMovement, night: boolean, concert: boolean) {
    if (this.closed || this.paused || this.context.state !== 'running') return
    const mix = atmosphereMix(this.settings, night, movement.indoors, concert), now = this.context.currentTime
    this.wind.gain.setTargetAtTime(mix.wind * (1 + .16 * Math.sin(now * .35)), now, .5)
    this.bicycle.gain.setTargetAtTime(movement.bicycle * .095 * mix.movement, now, movement.bicycle ? .12 : .018)
    this.bicycleFilter.frequency.setTargetAtTime(350 + movement.bicycle * 900, now, .15)
    if (movement.step && mix.movement) this.step(movement.step === 'run', movement.indoors, mix.movement)
    if (movement.chain && mix.movement) this.chain(movement.bicycle * mix.movement)
    if (now >= this.nextBird) {
      this.nextBird = now + (night ? 45 + Math.random() * 45 : 8 + Math.random() * 10)
      if (mix.birds) this.bird(mix.birds)
    }
  }

  private finish(source: AudioScheduledSourceNode, nodes: AudioNode[]) {
    this.oneShots.add(source)
    source.onended = () => { this.oneShots.delete(source); source.disconnect(); for (const node of nodes) node.disconnect() }
  }

  private step(running: boolean, indoors: boolean, level: number) {
    const now = this.context.currentTime, source = this.context.createBufferSource(), filter = this.context.createBiquadFilter(), gain = this.context.createGain()
    source.buffer = this.noise; filter.type = 'lowpass'; filter.frequency.value = indoors ? 720 : 1250
    gain.gain.setValueAtTime(.0001, now); gain.gain.exponentialRampToValueAtTime((running ? .32 : .22) * level, now + .008); gain.gain.exponentialRampToValueAtTime(.0001, now + .11)
    source.connect(filter); filter.connect(gain); gain.connect(this.master)
    this.finish(source, [filter, gain]); source.start(now, Math.random() * 3); source.stop(now + .12)
    const thump = this.context.createOscillator(), envelope = this.context.createGain()
    thump.type = 'sine'; thump.frequency.setValueAtTime(indoors ? 110 : 88, now); thump.frequency.exponentialRampToValueAtTime(45, now + .085)
    envelope.gain.setValueAtTime(.08 * level, now); envelope.gain.exponentialRampToValueAtTime(.0001, now + .09)
    thump.connect(envelope); envelope.connect(this.master); this.finish(thump, [envelope]); thump.start(now); thump.stop(now + .1)
  }

  private chain(level: number) {
    if (level < .02) return
    const now = this.context.currentTime, source = this.context.createBufferSource(), filter = this.context.createBiquadFilter(), gain = this.context.createGain()
    source.buffer = this.noise; filter.type = 'highpass'; filter.frequency.value = 2900
    gain.gain.setValueAtTime(.09 * level, now); gain.gain.exponentialRampToValueAtTime(.0001, now + .035)
    source.connect(filter); filter.connect(gain); gain.connect(this.master)
    this.finish(source, [filter, gain]); source.start(now, Math.random() * 3); source.stop(now + .04)
  }

  private bird(level: number) {
    const now = this.context.currentTime, pan = this.context.createStereoPanner()
    pan.pan.value = Math.random() * 1.5 - .75; pan.connect(this.master)
    const oscillator = this.context.createOscillator(), gain = this.context.createGain(), base = 1950 + Math.random() * 1100
    oscillator.type = 'sine'
    for (const offset of [0, .19]) {
      oscillator.frequency.setValueAtTime(base, now + offset); oscillator.frequency.exponentialRampToValueAtTime(base * 1.48, now + offset + .045); oscillator.frequency.exponentialRampToValueAtTime(base * .87, now + offset + .14)
      gain.gain.setValueAtTime(.0001, now + offset); gain.gain.exponentialRampToValueAtTime(level, now + offset + .025); gain.gain.exponentialRampToValueAtTime(.0001, now + offset + .15)
    }
    oscillator.connect(gain); gain.connect(pan); this.finish(oscillator, [gain, pan]); oscillator.start(now); oscillator.stop(now + .36)
  }

  close() {
    if (this.closed) return
    this.silence(); this.closed = true
    for (const source of this.loops) { source.stop(); source.disconnect() }
    this.loops = []; this.master.disconnect(); this.wind.disconnect(); this.bicycle.disconnect(); this.bicycleFilter.disconnect()
    void this.context.close().catch(() => {})
  }
}
