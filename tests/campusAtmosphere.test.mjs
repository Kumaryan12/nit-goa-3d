import { MOVEMENT_SPEEDS } from '../src/lib/movementLimits.ts'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { advanceAtmosphereMotion, atmosphereMix, atmosphereSettings, DEFAULT_ATMOSPHERE, freshAtmosphereMotion } from '../src/lib/campusAtmosphere.ts'
import { CampusAudio } from '../src/lib/campusAudio.ts'

const pose = (patch = {}) => ({ x: 0, y: 1, z: 0, yaw: 0, moving: true, running: false, active: true, visible: true, space: 'outdoors', epoch: 0, vehicle: 'walk', ...patch })

test('stored sound preferences cannot introduce invalid gains or enable channels through truthy strings', () => {
  assert.deepEqual(atmosphereSettings(null), DEFAULT_ATMOSPHERE)
  assert.deepEqual(atmosphereSettings({ volume: NaN, muted: 'false', birds: 'true', wind: false, movement: 0 }), { ...DEFAULT_ATMOSPHERE, wind: false })
  assert.equal(atmosphereSettings({ volume: -1 }).volume, 0)
  assert.equal(atmosphereSettings({ volume: 900 }).volume, 1)
  assert.equal(atmosphereSettings({ muted: true, volume: .65 }).volume, .65)
})

test('interiors, night and concerts reduce appropriate ambience without overriding user mute/channel controls', () => {
  const day = atmosphereMix(DEFAULT_ATMOSPHERE, false, false, false)
  const night = atmosphereMix(DEFAULT_ATMOSPHERE, true, false, false)
  const indoor = atmosphereMix(DEFAULT_ATMOSPHERE, false, true, false)
  const concert = atmosphereMix(DEFAULT_ATMOSPHERE, false, false, true)
  assert.ok(night.birds < day.birds / 10)
  assert.equal(indoor.birds, 0); assert.ok(indoor.wind < day.wind / 5)
  assert.ok(concert.wind < day.wind / 4 && concert.birds < day.birds / 4 && concert.movement < day.movement / 2)
  assert.deepEqual(atmosphereMix({ ...DEFAULT_ATMOSPHERE, muted: true, wind: false, birds: false, movement: false }, false, false, false), { master: 0, wind: 0, birds: 0, movement: 0 })
})

test('footsteps follow distance travelled independently of audio timer rate, and blocked avatars are silent', () => {
  for (const hz of [10, 12.5, 25]) {
    const state = freshAtmosphereMotion(); let steps = 0
    for (let i = 0; i <= hz * 8; i++) if (advanceAtmosphereMotion(state, pose({ x: i / hz * 2.5, airborne: false }), i / hz, true).step) steps++
    assert.ok(steps >= 24 && steps <= 25, `${hz} Hz: ${steps} steps over 20 metres`)
    for (let i = 1; i <= 20; i++) assert.equal(advanceAtmosphereMotion(state, pose({ x: 20, airborne: false }), 8 + i / hz, true).step, null)
  }
})

test('teleports, stale samples, floor changes and avatar inactivity do not produce movement sound bursts', () => {
  for (const change of [{ x: 100 }, { epoch: 1 }, { space: 'gyan:1' }, { active: false }, { visible: false }, { moving: false }]) {
    const state = freshAtmosphereMotion()
    advanceAtmosphereMotion(state, pose(), 1, true)
    state.distance = .79
    const result = advanceAtmosphereMotion(state, pose({ x: .3, ...change }), 1.1, true)
    assert.equal(result.step, null); assert.equal(result.bicycle, 0); assert.equal(state.distance, 0)
  }
  const state = freshAtmosphereMotion()
  advanceAtmosphereMotion(state, pose(), 1, true)
  assert.equal(advanceAtmosphereMotion(state, pose({ x: 1.5 }), 3, true).step, null)
  assert.equal(advanceAtmosphereMotion(state, pose({ x: 1.8 }), 3.1, false).step, null)
})

test('jumping, including the apex, and buggy passengers do not emit footsteps', () => {
  const state = freshAtmosphereMotion()
  advanceAtmosphereMotion(state, pose(), 0, true)
  for (let i = 1; i <= 10; i++) {
    const result = advanceAtmosphereMotion(state, pose({ x: i * .3, y: 1 + Math.sin(i / 10 * Math.PI), airborne: true }), i * .08, true)
    assert.equal(result.step, null)
  }
  // The older-pose fallback also bridges the almost-horizontal jump apex.
  const older = freshAtmosphereMotion()
  advanceAtmosphereMotion(older, pose(), 0, true)
  for (let i = 1; i <= 9; i++) assert.equal(advanceAtmosphereMotion(older, pose({ x: i * .3, y: 1 + 5 * i * .08 - 7 * (i * .08) ** 2 }), i * .08, true).step, null)
  for (const vehicle of ['walk', 'buggy']) {
    const passenger = freshAtmosphereMotion()
    for (let i = 0; i < 25; i++) assert.equal(advanceAtmosphereMotion(passenger, pose({ x: i * .25, pitch: 0, vehicle }), i * .08, true).step, null)
  }
})

test('bicycle rolling and chain clicks track speed and stop immediately when the bike stops', () => {
  const state = freshAtmosphereMotion(); let clicks = 0
  for (let i = 0; i <= 40; i++) {
    const result = advanceAtmosphereMotion(state, pose({ vehicle: 'bicycle', x: i * .5 }), i * .1, true)
    assert.equal(result.step, null)
    if (i) assert.ok(Math.abs(result.bicycle - 5 / MOVEMENT_SPEEDS.bicycle) < 1e-10)
    if (result.chain) clicks++
  }
  assert.ok(clicks >= 11 && clicks <= 12)
  const stopped = advanceAtmosphereMotion(state, pose({ vehicle: 'bicycle', x: 20, moving: false }), 4.1, true)
  assert.equal(stopped.bicycle, 0); assert.equal(stopped.chain, false)
})

function fakeContext() {
  const nodes = [], params = () => ({ value: 0, events: [], setValueAtTime(value) { this.events.push(['value', value]) }, setTargetAtTime(value) { this.events.push(['target', value]) }, exponentialRampToValueAtTime(value) { this.events.push(['ramp', value]) }, cancelScheduledValues() { this.events.push(['cancel']) } })
  const node = () => { const result = { connected: [], disconnects: 0, starts: [], stops: [], connect(to) { this.connected.push(to); return to }, disconnect() { this.disconnects++ }, start(...args) { this.starts.push(args) }, stop(...args) { this.stops.push(args) } }; nodes.push(result); return result }
  return {
    nodes, currentTime: 0, sampleRate: 100, state: 'suspended', destination: {}, resumeGate: null,
    createGain() { return { ...node(), gain: params() } },
    createBiquadFilter() { return { ...node(), frequency: params(), Q: params() } },
    createBuffer(_channels, length) { return { getChannelData() { return new Float32Array(length) } } },
    createBufferSource: node,
    createOscillator() { return { ...node(), frequency: params() } },
    createStereoPanner() { return { ...node(), pan: params() } },
    async resume() { if (this.resumeGate) await this.resumeGate; this.state = 'running' },
    async suspend() { this.state = 'suspended' },
    async close() { this.state = 'closed' },
  }
}

test('audio engine uses two reusable ambience loops, cancels one-shots on pause, and closes all sound on disposal', async () => {
  const context = fakeContext(), audio = new CampusAudio(context)
  const loops = context.nodes.filter(node => node.starts.length)
  assert.equal(loops.length, 2)
  assert.equal(await audio.resume(), true)
  audio.update({ step: 'walk', bicycle: .5, chain: true, indoors: false }, false, false)
  context.currentTime = 30
  audio.update({ step: null, bicycle: 0, chain: false, indoors: false }, false, false)
  const oneShots = context.nodes.filter(node => node.starts.length && !loops.includes(node))
  assert.equal(oneShots.length, 4, 'footstep noise + thump + bicycle chain + bird')
  audio.setSettings({ ...DEFAULT_ATMOSPHERE, muted: true }); audio.pause()
  assert.equal(context.state, 'suspended')
  assert.ok(oneShots.every(node => node.stops.some(args => !args.length)), 'all pending one-shots stop when muted')
  const count = context.nodes.length
  audio.update({ step: 'run', bicycle: 1, chain: true, indoors: false }, false, false)
  assert.equal(context.nodes.length, count, 'paused engines schedule no new audio')
  audio.close(); audio.close()
  assert.equal(context.state, 'closed'); assert.ok(loops.every(node => node.stops.length === 1 && node.disconnects === 1))
})

test('a pending resume cannot undo a newer pause or disposal', async () => {
  for (const action of ['pause', 'close']) {
    const context = fakeContext(), audio = new CampusAudio(context)
    let resolve
    context.resumeGate = new Promise(done => { resolve = done })
    const resume = audio.resume()
    audio[action](); resolve()
    assert.equal(await resume, false)
    const count = context.nodes.length
    audio.update({ step: 'run', bicycle: 1, chain: true, indoors: false }, false, false)
    assert.equal(context.nodes.length, count)
    audio.close()
  }
})
