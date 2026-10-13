import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CafeVoiceClient } from '../src/lib/cafeVoiceClient.ts'
const tick = () => new Promise(r => setImmediate(r))
const member = (id, sessionId = id + '-join') => ({ id, sessionId, name: id, mic: false })
const roster = (self, ids) => ({ type: 'cafe-voice-state', table: 0, sessionId: self + '-join', members: ids.map(id => member(id)) })
const ice = self => ({ type: 'cafe-voice-ice', sessionId: self + '-join', configuration: { iceServers: [{ urls: ['stun:stun.test'] }], expiresAt: Date.now() + 600000 } })
function setup(capture) {
  const sent = [], views = [], pcs = [], audios = [], tracks = []
  class FakePeer {
    connectionState = 'new'; signalingState = 'stable'; localDescription = null; remoteDescription = null; candidates = []; replacements = []; closed = false
    transceivers = []; preRemoteTransceivers = null
    addTransceiver() { const transceiver = { sender: { replaceTrack: async t => { this.replacements.push(t) }, getParameters: () => ({}), setParameters: async () => {} }, receiver: { track: { kind: 'audio' } } }; this.transceivers.push(transceiver); return transceiver }
    getTransceivers() { return this.transceivers }
    async createOffer() { return { type: 'offer', sdp: 'offer-audio' } }
    async createAnswer() { return { type: 'answer', sdp: 'answer-audio' } }
    async setLocalDescription(description) { this.localDescription = description; this.signalingState = description.type === 'offer' ? 'have-local-offer' : 'stable' }
    async setRemoteDescription(description) { this.preRemoteTransceivers = this.transceivers.length; if (description.type === 'offer' && !this.transceivers.length) this.addTransceiver(); this.remoteDescription = description; this.signalingState = description.type === 'offer' ? 'have-remote-offer' : 'stable' }
    async addIceCandidate(c) { this.candidates.push(c) }
    setConfiguration(c) { this.configuration = c }
    close() { this.closed = true; this.connectionState = 'closed' }
  }
  const runtime = {
    capture: capture ?? (async () => { const track = { readyState: 'live', enabled: true, stopped: false, stop() { this.stopped = true; this.readyState = 'ended' } }; tracks.push(track); return { getTracks: () => [track], getAudioTracks: () => [track] } }),
    peer: () => { const p = new FakePeer(); pcs.push(p); return p },
    audio: () => { const a = { unlocked: false, closed: false, removed: [], received: [], unlock: async () => { a.unlocked = true }, volume() {}, mute() {}, receive(id, stream) { a.received.push({ id, stream }) }, remove(id) { a.removed.push(id) }, close() { a.closed = true } }; audios.push(a); return a },
  }
  const client = new CafeVoiceClient(value => { sent.push(value); return true }, v => views.push(v), runtime)
  return { client, sent, views, pcs, audios, tracks, runtime }
}
test('listen captures no mic; ordered mesh creates only three links and mic changes replace tracks without renegotiation', async t => {
  const f = setup(); t.after(() => f.client.close())
  f.client.listen(); await tick(); assert.equal(f.tracks.length, 0); assert.deepEqual(f.sent[0], { type: 'cafe-voice-join', mic: false })
  f.client.receive(roster('alice', ['alice', 'bob', 'cara', 'dan'])); f.client.receive(ice('alice')); await tick(); await tick()
  assert.equal(f.pcs.length, 3); assert.equal(f.sent.filter(m => m.signal?.kind === 'offer').length, 3)
  await f.client.startMic(); assert.equal(f.tracks.length, 1); assert.equal(f.client.view().mic, true)
  assert.ok(f.pcs.every(p => p.replacements.at(-1) === f.tracks[0])); assert.equal(f.pcs.length, 3)
  f.client.muteMic(); await tick(); assert.equal(f.tracks[0].stopped, true); assert.ok(f.pcs.every(p => p.replacements.at(-1) === null))
  assert.equal(f.sent.filter(m => m.signal?.kind === 'offer').length, 3, 'muting does not renegotiate or restart avatar state')
  f.client.leave(); assert.ok(f.pcs.every(p => p.closed)); assert.ok(f.audios.every(a => a.closed))
})
test('signals wait for ICE; early candidates flush after the offer; old join signals are ignored', async t => {
  const f = setup(); t.after(() => f.client.close()); f.client.listen(); await tick()
  f.client.receive(roster('bob', ['alice', 'bob']))
  const packet = signal => ({ type: 'cafe-voice-signal', sessionId: 'bob-join', from: 'alice', fromSessionId: 'alice-join', signal: { ...signal, connectionId: 'one' } })
  f.client.receive(packet({ kind: 'ice', candidate: { candidate: 'candidate:early' } }))
  f.client.receive(packet({ kind: 'offer', sdp: 'audio' }))
  assert.equal(f.pcs.length, 0)
  f.client.receive(ice('bob')); await tick(); await tick()
  assert.equal(f.pcs.length, 1); assert.equal(f.pcs[0].preRemoteTransceivers, 0, 'answerer uses the negotiated remote audio transceiver'); assert.equal(f.pcs[0].candidates.length, 1); assert.equal(f.sent.filter(m => m.signal?.kind === 'answer').length, 1)
  f.client.receive({ ...packet({ kind: 'offer', sdp: 'stale' }), fromSessionId: 'old-join' }); await tick()
  assert.equal(f.pcs.length, 1)
  f.client.receive(roster('bob', ['bob'])); assert.equal(f.pcs[0].closed, true)
})
test('permission returning after standing, quota or disconnect stops the track and never reconnects voice', async t => {
  for (const ending of ['stand', 'quota', 'disconnect']) {
    let finish; const track = { readyState: 'live', stopped: false, stop() { this.stopped = true } }
    const f = setup(() => new Promise(r => { finish = r })); t.after(() => f.client.close())
    const request = f.client.startMic(); await tick()
    if (ending === 'disconnect') f.client.receive({ type: 'cafe-voice-reset' })
    else if (ending === 'quota') f.client.receive({ type: 'cafe-voice-state', table: null, sessionId: null, members: [] })
    else f.client.leave()
    finish({ getTracks: () => [track], getAudioTracks: () => [track] }); await request
    assert.equal(track.stopped, true); assert.equal(f.client.view().mic, false); assert.equal(f.sent.some(m => m.type === 'cafe-voice-join'), false)
    assert.ok(f.audios.every(a => a.closed))
  }
})
test('server rejection tears down already captured mic and delayed audio unlock cannot rejoin after leaving', async t => {
  const f = setup(); t.after(() => f.client.close()); await f.client.startMic()
  assert.equal(f.client.view().mic, true)
  f.client.receive({ type: 'cafe-voice-error', message: 'Seat no longer available' })
  assert.equal(f.tracks[0].stopped, true); assert.equal(f.client.view().pending, false); assert.match(f.client.view().error, /Seat/)
  const slow = setup(); t.after(() => slow.client.close()); let unlock
  slow.runtime.audio = () => ({ unlock: () => new Promise(r => { unlock = r }), volume() {}, mute() {}, receive() {}, remove() {}, close() {} })
  slow.client.listen(); slow.client.leave(); unlock(); await tick()
  assert.equal(slow.sent.filter(m => m.type === 'cafe-voice-join').length, 0)
})
