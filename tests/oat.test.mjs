import { randomUUID } from 'node:crypto'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { WebSocket } from 'ws'
import { createOatRoom } from '../server/oatRoom.ts'
import { attachOatServer } from '../server/oatServer.ts'
import { attachFootballServer } from '../server/footballServer.ts'
import { OAT_BACKING_TRACK, OAT_CAPACITY, oatAudioURL, oatInviteURL, oatPlaybackURL, oatMusicPosition, parseOatSignal, parseOatSnapshot } from '../src/lib/oatProtocol.ts'

test('concert invitations from the admin studio open the student-accessible campus without editor parameters', () => {
  for (const page of ['https://campus.example/admin/campus?view=walk#place', 'https://campus.example/campus', 'https://campus.example/campus?mode=night'])
    assert.equal(oatInviteURL(page), 'https://campus.example/campus?location=open-air-theatre&concert=1')
})
test('concert playback uses the app origin for backing music and the live server for uploaded audio from either campus track', () => {
  const upload = '/oat/audio/12345678-1234-1234-1234-123456789abc'
  for (const page of ['https://campus.example/admin/campus', 'https://campus.example/campus']) {
    assert.equal(oatPlaybackURL(OAT_BACKING_TRACK, page, 'wss://live.example/oat'), 'https://campus.example/audio/oat-backing.wav')
    assert.equal(oatPlaybackURL(upload, page, 'wss://live.example/oat'), 'https://live.example' + upload)
    assert.equal(oatPlaybackURL('https://music.example/song.mp3', page, 'wss://live.example/oat'), 'https://music.example/song.mp3')
  }
  assert.equal(oatPlaybackURL(upload, 'http://localhost:5173/admin/campus', 'ws://localhost:4185/oat'), 'http://localhost:4185' + upload)
})

test('stage turns are exclusive, queue fairly, and stop microphone/music on departure', () => {
  const room = createOatRoom()
  for (const id of ['a', 'b', 'c']) room.add(id, 1000)
  assert.equal(room.handle('a', { type: 'name', name: '  Singer\n One ' }, 1100), null)
  assert.equal(room.handle('a', { type: 'stage' }, 1200), null)
  room.handle('b', { type: 'stage' }, 1200); room.handle('c', { type: 'stage' }, 1200)
  assert.deepEqual(room.snapshot(1200).queue, ['b', 'c'])
  room.handle('b', { type: 'stage' }, 1300)
  assert.deepEqual(room.snapshot(1300).queue, ['b', 'c'])
  assert.match(room.handle('b', { type: 'mic', enabled: true }, 1400), /Only/)
  assert.match(room.handle('c', { type: 'concert', title: 'Hijacked' }, 1400), /Only/)
  room.handle('a', { type: 'concert', title: 'Campus Evening' }, 1400)
  room.handle('a', { type: 'mic', enabled: true }, 1400)
  room.handle('a', { type: 'track', url: OAT_BACKING_TRACK, title: 'Backing', playing: true }, 1400)
  assert.ok(parseOatSnapshot(room.snapshot(1500)))
  assert.equal(room.snapshot(1500).micOn, true)
  assert.equal(room.handle('a', { type: 'mic', enabled: false }, 1401), null, 'stopping an active microphone is immediate even within the action limit')
  assert.equal(room.snapshot(1401).micOn, false)
  room.handle('a', { type: 'mic', enabled: true }, 1600)
  room.remove('a', 2000)
  const next = room.snapshot(2000)
  assert.equal(next.performerId, 'b'); assert.deepEqual(next.queue, ['c'])
  assert.equal(next.micOn, false); assert.equal(next.music.url, ''); assert.equal(next.concertTitle, 'Campus Evening')
  room.handle('b', { type: 'leave-stage' }, 2100)
  assert.equal(room.snapshot(2100).performerId, 'c')
  room.remove('b', 2200); room.remove('c', 2200)
  assert.equal(room.snapshot(2200).concertTitle, 'OAT Open Mic')
  for (let i = 0; i < OAT_CAPACITY; i++) assert.ok(room.add(`person-${i}`))
  assert.equal(room.add('extra'), null); assert.equal(room.add('person-0'), null)
})

test('shared playback follows server time for late joins, pause, seek, restart and track completion', () => {
  const room = createOatRoom(); room.add('a'); room.handle('a', { type: 'stage' }, 1000)
  room.handle('a', { type: 'track', url: OAT_BACKING_TRACK, title: 'Song', playing: true }, 1200)
  room.handle('a', { type: 'duration', url: OAT_BACKING_TRACK, duration: 24 }, 1250)
  close(oatMusicPosition(room.snapshot(5200).music, 5200), 4)
  room.add('listener', 5200)
  close(oatMusicPosition(room.snapshot(6200).music, 6200), 5)
  assert.match(room.handle('listener', { type: 'transport', playing: false, position: 8 }, 6300), /Only/)
  room.handle('a', { type: 'transport', playing: false, position: 5 }, 6500)
  close(oatMusicPosition(room.snapshot(10000).music, 10000), 5)
  room.handle('a', { type: 'transport', playing: true, position: 12 }, 10100)
  close(oatMusicPosition(room.snapshot(13100).music, 13100), 15)
  room.handle('a', { type: 'transport', playing: true, position: 0 }, 14000)
  close(oatMusicPosition(room.snapshot(15000).music, 15000), 1)
  assert.equal(room.snapshot(40000).music.playing, false)
  close(room.snapshot(40000).music.position, 24)
  assert.match(room.handle('a', { type: 'transport', playing: true, position: Infinity }, 41000), /Invalid/)
  assert.match(room.handle('a', { type: 'duration', url: 'stale-track', duration: 2 }, 41000), /Invalid/)
})
function close(a, b) { assert.ok(Math.abs(a - b) < .000001) }

test('concert protocol rejects invalid media, snapshots and spoofed signaling payloads', () => {
  for (const url of ['javascript:alert(1)', 'http://example.com/song.mp3', 'https://user:pass@example.com/a.mp3', 'https://www.youtube.com/watch?v=x', 'https://open.spotify.com/track/abc', '/other/file.mp3']) assert.equal(oatAudioURL(url), null)
  assert.equal(oatAudioURL('https://example.com/song.mp3'), 'https://example.com/song.mp3')
  const room = createOatRoom(); room.add('a'); const state = room.snapshot()
  assert.ok(parseOatSnapshot(state))
  for (const invalid of [{ ...state, performerId: 'missing' }, { ...state, micOn: true }, { ...state, queue: ['missing'] }, { ...state, participants: [state.participants[0], state.participants[0]] }, { ...state, music: { ...state.music, playing: true } }, { ...state, music: { ...state.music, duration: NaN } }]) assert.equal(parseOatSnapshot(invalid), null)
  assert.equal(parseOatSignal({ kind: 'offer', sdp: 'x'.repeat(24001) }), null)
  assert.equal(parseOatSignal({ kind: 'ice', candidate: { candidate: 'a', sdpMLineIndex: -1 } }), null)
  assert.ok(parseOatSignal({ kind: 'ice', candidate: { candidate: 'a', sdpMLineIndex: 0, sdpMid: '0' } }))
})

const waitFor = async (condition, timeout = 6000) => {
  const end = Date.now() + timeout
  while (Date.now() < end) { const result = condition(); if (result) return result; await new Promise(resolve => setTimeout(resolve, 15)) }
  throw new Error('Timed out waiting for concert state')
}
test('real concert visitors share music, voice signaling and files while football remains available', async () => {
  let oat
  const http = createServer((req, res) => { if (!oat.handleRequest(req, res)) { res.writeHead(404); res.end() } })
  oat = attachOatServer(http, undefined, async token=>({id:token,name:'Test member',role:'member',expiresAt:Date.now()+3600000})); const football = attachFootballServer(http, undefined, async token=>({id:token,name:'Test member',role:'member',expiresAt:Date.now()+3600000}))
  http.listen(0, '127.0.0.1'); await once(http, 'listening')
  const origin = `http://127.0.0.1:${http.address().port}`, sockets = []
  const visitor = (path = '/oat') => {
    const ws = new WebSocket(origin.replace('http:', 'ws:') + path, { origin }), messages = []
    ws.on('open',()=>ws.send(JSON.stringify({type:'authenticate',token:randomUUID()})))
    ws.on('message', data => messages.push(JSON.parse(data.toString()))); ws.on('error', () => undefined); sockets.push(ws)
    return { ws, messages, send: message => ws.send(JSON.stringify(message)) }
  }
  const a = visitor(), b = visitor(), footballVisitor = visitor('/football')
  const latest = peer => peer.messages.filter(m => m.type === 'state').at(-1)
  try {
    const aWelcome = await waitFor(() => a.messages.find(m => m.type === 'welcome'))
    const bWelcome = await waitFor(() => b.messages.find(m => m.type === 'welcome'))
    assert.ok(await waitFor(() => footballVisitor.messages.find(m => m.type === 'welcome')))
    await waitFor(() => latest(a)?.participants.length === 2)
    a.send({ type: 'stage' }); await waitFor(() => latest(b)?.performerId === aWelcome.id)
    b.send({ type: 'stage' }); await waitFor(() => latest(a)?.queue.includes(bWelcome.id))
    a.send({ type: 'track', url: OAT_BACKING_TRACK, title: 'Shared backing', playing: true })
    await waitFor(() => latest(b)?.music.url === OAT_BACKING_TRACK && latest(b)?.music.playing)
    const late = visitor(); await waitFor(() => latest(late)?.music.playing)
    assert.ok(oatMusicPosition(latest(late).music, Date.now()) >= 0)
    a.send({ type: 'mic', enabled: true }); await waitFor(() => latest(b)?.micOn)
    a.send({ type: 'signal', to: bWelcome.id, signal: { kind: 'offer', sdp: 'v=0\r\no=concert\r\n' } })
    assert.equal((await waitFor(() => b.messages.find(m => m.type === 'signal'))).from, aWelcome.id)
    b.send({ type: 'signal', to: aWelcome.id, signal: { kind: 'answer', sdp: 'v=0\r\no=listener\r\n' } })
    assert.equal((await waitFor(() => a.messages.find(m => m.type === 'signal'))).from, bWelcome.id)
    b.send({ type: 'signal', to: aWelcome.id, signal: { kind: 'offer', sdp: 'spoofed' } })
    a.send({ type: 'clock', clientTime: 123 }); assert.equal((await waitFor(() => a.messages.find(m => m.type === 'clock'))).clientTime, 123)
    assert.ok(!a.messages.some(m => m.type === 'signal' && m.signal.sdp === 'spoofed'))
    const backing = readFileSync(new URL('../public/audio/oat-backing.wav', import.meta.url))
    const headers = { Origin: origin, 'X-Oat-Token': aWelcome.uploadToken, 'Content-Type': 'audio/wav' }
    const preflight = await fetch(origin + '/oat/audio', { method: 'OPTIONS', headers: { Origin: origin } })
    assert.equal(preflight.status, 204)
    const forbidden = await fetch(origin + '/oat/audio', { method: 'POST', headers: { ...headers, 'X-Oat-Token': bWelcome.uploadToken }, body: backing })
    assert.equal(forbidden.status, 403)
    const bad = await fetch(origin + '/oat/audio', { method: 'POST', headers, body: Buffer.from('not an audio file') }); assert.equal(bad.status, 415)
    const result = await fetch(origin + '/oat/audio', { method: 'POST', headers, body: backing }); assert.equal(result.status, 201)
    const { url } = await result.json(); assert.ok(oatAudioURL(url))
    const partial = await fetch(origin + url, { headers: { Range: 'bytes=0-43' } }); assert.equal(partial.status, 206)
    assert.deepEqual(Buffer.from(await partial.arrayBuffer()), backing.subarray(0, 44))
    const invalidRange = await fetch(origin + url, { headers: { Range: 'bytes=999999999-' } }); assert.equal(invalidRange.status, 416)
    a.send({ type: 'track', url, title: 'Uploaded backing' }); await waitFor(() => latest(b)?.music.url === url)
    a.ws.close(); await waitFor(() => latest(b)?.performerId === bWelcome.id)
    assert.equal(latest(b).micOn, false); assert.equal(latest(b).music.url, '')
    const rejected = new WebSocket(origin.replace('http:', 'ws:') + '/oat', { origin: 'https://unrelated.example' }); rejected.on('error', () => undefined); sockets.push(rejected)
    const [request, response] = await once(rejected, 'unexpected-response'); assert.equal(response.statusCode, 403); response.resume(); request.destroy()
    b.ws.close(); late.ws.close(); await waitFor(() => oat.room.snapshot().participants.length === 0)
    assert.equal((await fetch(origin + url)).status, 404)
  } finally { for (const ws of sockets) ws.terminate(); oat.close(); football.close(); await new Promise(resolve => http.close(resolve)) }
})

test('the included backing track is a finite, audible PCM WAV with a matching duration', () => {
  const bytes = readFileSync(new URL('../public/audio/oat-backing.wav', import.meta.url))
  assert.equal(bytes.toString('ascii', 0, 4), 'RIFF'); assert.equal(bytes.toString('ascii', 8, 12), 'WAVE')
  assert.equal(bytes.readUInt16LE(20), 1); assert.equal(bytes.readUInt16LE(22), 1)
  assert.equal(bytes.readUInt16LE(34), 16)
  close((bytes.length - 44) / bytes.readUInt32LE(28), 24)
  assert.ok(bytes.subarray(44).some(value => value !== 0))
})
