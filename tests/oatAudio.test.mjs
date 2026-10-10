import assert from 'node:assert/strict'
import { test } from 'node:test'
import { OatAudio } from '../src/lib/oatAudio.ts'
import { OatVoiceRecovery } from '../src/lib/oatVoiceRecovery.ts'

class Node {
  connections = []; gain = { value: 1 }; fftSize = 256
  connect(node) { this.connections.push(node) }
  disconnect() { this.connections = [] }
  getByteTimeDomainData(samples) { samples.fill(150) }
}
function media() {
  const track = { readyState: 'live', muted: false, enabled: true, stop() { this.readyState = 'ended' } }
  return { track, getTracks: () => [track], getAudioTracks: () => [track] }
}
function context() {
  const nodes = [], inputs = [], destination = new Node()
  return {
    nodes, inputs, destination, state: 'suspended', onstatechange: null,
    createGain: () => { const node = new Node(); nodes.push(node); return node },
    createAnalyser: () => new Node(),
    createMediaElementSource: () => new Node(),
    createMediaStreamSource: input => { const node = new Node(); inputs.push({ input, node }); return node },
    createMediaStreamDestination: () => Object.assign(new Node(), { stream: media() }),
    resume() { this.state = 'running'; return Promise.resolve() },
    close() { this.state = 'closed'; return Promise.resolve() },
  }
}

test('concert click unlocks the audio graph before a delayed incoming stream; mute and volume cover live voice', async () => {
  const ctx = context(), audio = new OatAudio(ctx)
  audio.setListening(true, .7); await audio.unlock()
  const incoming = media(); audio.receive(incoming)
  assert.equal(audio.voicePlaying, true)
  assert.equal(ctx.nodes[1].gain.value, .7)
  assert.ok(ctx.inputs[0].node.connections[0].connections.includes(ctx.nodes[1]))
  assert.ok(audio.voiceLevel() > .1)
  assert.ok(ctx.nodes[1].connections.includes(ctx.destination))
  audio.setListening(false, .7); assert.equal(audio.voicePlaying, false); assert.equal(ctx.nodes[1].gain.value, 0)
  audio.setListening(true, .2); assert.equal(ctx.nodes[1].gain.value, .2)
  incoming.track.muted = true; assert.equal(audio.voicePlaying, false)
  incoming.track.muted = false; ctx.state = 'suspended'; assert.equal(audio.voicePlaying, false)
  await audio.unlock(); assert.equal(audio.voicePlaying, true)
  audio.disconnectVoice(); assert.equal(audio.voicePlaying, false); assert.equal(ctx.inputs[0].node.connections.length, 0)
  audio.close(); assert.equal(ctx.state, 'closed')
})
test('microphone mixing requires a running context and active input, meters capture, avoids local feedback and stops cleanly', async () => {
  const ctx = context(), audio = new OatAudio(ctx), input = media()
  assert.throws(() => audio.startMicrophone(input), /paused/)
  await audio.unlock(); input.track.enabled = false
  assert.throws(() => audio.startMicrophone(input), /active audio/)
  input.track.enabled = true
  const outgoing = audio.startMicrophone(input), microphone = ctx.inputs[0].node
  assert.equal(outgoing.track.readyState, 'live')
  assert.ok(audio.microphoneLevel() > .1)
  assert.equal(microphone.connections.includes(ctx.destination), false)
  assert.equal(microphone.connections.includes(ctx.nodes[0]), false)
  audio.stopMicrophone()
  assert.equal(outgoing.track.readyState, 'ended')
  assert.equal(microphone.connections.length, 0)
  assert.equal(audio.microphoneLevel(), 0)
  audio.close()
})
test('replacing the performer disconnects the old voice stream', async () => {
  const ctx = context(), audio = new OatAudio(ctx)
  await audio.unlock(); audio.setListening(true, 1)
  audio.receive(media()); const previous = ctx.inputs[0].node
  audio.receive(media()); assert.equal(previous.connections.length, 0)
  assert.equal(audio.voicePlaying, true); audio.close()
})
test('voice retries are bounded and coalesced; a recovered connection cancels mobile-network grace retries', async () => {
  let exhausted = 0; const attempts = []
  const retry = new OatVoiceRecovery(id => attempts.push(id), () => exhausted++, [5, 5], 10)
  const wait = () => new Promise(resolve => setTimeout(resolve, 25))
  retry.schedule('a'); retry.schedule('a'); await wait(); assert.deepEqual(attempts, ['a'])
  retry.schedule('a'); await wait(); assert.deepEqual(attempts, ['a', 'a'])
  retry.schedule('a'); assert.equal(exhausted, 1)
  retry.connected('a'); retry.schedule('a', true); retry.connected('a'); await wait()
  assert.deepEqual(attempts, ['a', 'a'])
  retry.schedule('b'); retry.reset(); await wait(); assert.deepEqual(attempts, ['a', 'a'])
})

// A connected WebRTC transport can remain silent if Chromium has no playout sink.
test('remote decoder gets a muted playout sink while Web Audio owns the audible output; teardown releases it', async () => {
  const sinks = []
  class AudioSink {
    paused = true; muted = false; srcObject = null
    constructor() { sinks.push(this) }
    setAttribute() {}
    play() { this.paused = false; return Promise.resolve() }
    pause() { this.paused = true }
  }
  const original = globalThis.Audio; globalThis.Audio = AudioSink
  try {
    const audio = new OatAudio(context()), incoming = media()
    await audio.unlock(); audio.setListening(true, .7); audio.receive(incoming)
    assert.equal(sinks.length, 1); assert.equal(sinks[0].srcObject, incoming)
    assert.equal(sinks[0].muted, true); assert.equal(sinks[0].paused, false)
    audio.disconnectVoice(); assert.equal(sinks[0].paused, true); assert.equal(sinks[0].srcObject, null)
    audio.close()
  } finally { if (original === undefined) delete globalThis.Audio; else globalThis.Audio = original }
})
