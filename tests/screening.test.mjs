import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { WebSocket } from 'ws'
import { screeningMedia, parseScreeningState, screeningPosition, screeningConnectionStatus, SCREENING_PROGRAM } from '../src/lib/screening.ts'
import { syncScreeningVideo, syncScreeningYoutube } from '../src/lib/screeningPlayback.ts'
import { createScreeningRoom, publishedScreeningLayout } from '../server/screening.ts'
import { attachCampusServer } from '../server/campusServer.ts'
import { parseCampusSnapshot } from '../src/lib/campusProtocol.ts'
import { campusSnapshotForViewer } from '../server/campusLocator.ts'

const identity = (id, role = 'member') => ({ id, role, name: id, expiresAt: Date.now() + 60000 })
const admin = identity('owner', 'admin'), alice = identity('alice'), bob = identity('bob'), videoURL = 'https://media.example.com/campus.mp4'
const setup = () => {
  let at = 100000
  const layout = publishedScreeningLayout(), room = createScreeningRoom(layout, () => at)
  room.connected(admin)
  const cmd = (who, action, extra = {}) => { at += 400; return room.handle(who, { action, session: room.snapshot().session, ...extra }) }
  return { room, layout, cmd, advance: ms => { at += ms } }
}
test('offline, duplicate tabs, queues and missing screening support never masquerade as a connected empty room', () => {
  assert.match(screeningConnectionStatus('offline', false, false), /offline/i)
  assert.equal(screeningConnectionStatus('offline', false, false, 'You already joined this room in another tab.'), 'You already joined this room in another tab.')
  assert.match(screeningConnectionStatus('reconnecting', false, false), /Reconnecting/)
  assert.match(screeningConnectionStatus('waiting', false, false, '', 3), /3/)
  assert.match(screeningConnectionStatus('live', false, false), /Checking/)
  assert.match(screeningConnectionStatus('live', false, true), /unavailable/)
  assert.equal(screeningConnectionStatus('live', true, false), null)
})
test('screening sources canonicalise supported links and reject scripts, private hosts, credentials and fake YouTube domains', () => {
  for (const url of ['https://youtu.be/M7lc1UVf-VE?t=12','https://www.youtube.com/watch?v=M7lc1UVf-VE','https://www.youtube.com/shorts/M7lc1UVf-VE']) assert.deepEqual(screeningMedia(url), { kind: 'youtube', url: 'https://www.youtube.com/watch?v=M7lc1UVf-VE', videoId: 'M7lc1UVf-VE' })
  assert.equal(screeningMedia(videoURL + '?signature=abc#part').url, videoURL + '?signature=abc')
  for (const url of ['javascript:alert(1)','file:///tmp/test.mp4','http://media.example.com/test.mp4','https://localhost/test.mp4','https://192.168.1.2/test.mp4','https://[::1]/test.mp4','https://media.local/test.mp4','https://u:p@media.example.com/test.mp4','https://youtube.com.evil.test/watch?v=M7lc1UVf-VE','https://youtube.com/watch?v=bad','https://example.com/embed.html','https://example.com:444/movie.mp4','https://example.com/a.m3u8']) assert.equal(screeningMedia(url), null, url)
})
test('the pinned welcome film is ready without a host and no account can replace it', () => {
  const room = createScreeningRoom(publishedScreeningLayout())
  const initial = room.snapshot()
  assert.equal(initial.hostOnline, false); assert.equal(initial.playing, true)
  assert.equal(initial.media.url, SCREENING_PROGRAM.url); assert.equal(initial.loop, true)
  assert.ok(parseScreeningState(initial))
  assert.ok(room.handle(alice, { action: 'join', session: initial.session }).ok)
  const { room: controlled, cmd } = setup()
  for (const who of [admin, alice, identity('mod', 'moderator')]) {
    assert.ok(cmd(who, 'load', { title: 'Replacement', url: videoURL }).error)
    assert.ok(cmd(who, 'load', { title: 'Changed title', url: SCREENING_PROGRAM.url }).error)
    assert.ok(cmd(who, 'end').error)
  }
  for (const action of ['play','pause','seek','restart']) assert.match(cmd(alice, action, { position: 10 }).error, /administrator/)
  assert.equal(controlled.snapshot().media.url, SCREENING_PROGRAM.url)
  assert.ok(cmd(admin, 'pause').ok)
  assert.ok(cmd(admin, 'seek', { position: 80 }).ok); assert.equal(controlled.snapshot().position, 80)
  for (const position of [NaN, Infinity, -1, SCREENING_PROGRAM.duration + 1, '20']) assert.ok(cmd(admin, 'seek', { position }).error)
  assert.ok(cmd(admin, 'restart').ok); assert.equal(controlled.snapshot().position, 0); assert.equal(controlled.snapshot().playing, true)
  assert.ok(cmd(admin, 'play', { session: 0 }).error)
})
test('shared time wraps exactly, late arrivals catch up and paused loops stay fixed', () => {
  const { room, cmd, advance } = setup()
  cmd(admin, 'restart'); const start = room.snapshot()
  assert.equal(screeningPosition(start, start.changedAt + SCREENING_PROGRAM.duration * 1000), 0)
  assert.ok(Math.abs(screeningPosition(start, start.changedAt + 3 * SCREENING_PROGRAM.duration * 1000 + 2500) - 2.5) < .00001)
  advance(2 * SCREENING_PROGRAM.duration * 1000 + 1200); room.reconcile()
  assert.ok(Math.abs(room.snapshot().position - 1.2) < .00001)
  cmd(alice, 'join'); assert.ok(parseScreeningState(room.snapshot()))
  cmd(admin, 'pause'); const paused = screeningPosition(room.snapshot(), room.snapshot().serverTime)
  advance(1000000); room.reconcile(); assert.equal(screeningPosition(room.snapshot(), room.snapshot().serverTime), paused)
  for (const update of [{duration:0},{duration:Infinity},{duration:200},{loop:'yes'},{media:screeningMedia(videoURL)}]) assert.equal(parseScreeningState({...room.snapshot(),...update}), null)
})
test('seats are exclusive, safely reused and authoritative in the seminar multiplayer space', () => {
  const { room, layout, cmd } = setup(); assert.equal(layout.seats.length, 32)
  for (let i = 0; i < 32; i++) assert.ok(cmd(identity('p' + i), 'join', { seat: 0, x: 1000 }).ok)
  assert.ok(cmd(alice, 'join').error)
  assert.equal(new Set(room.snapshot().participants.map(p => p.seat)).size, 32)
  const before = room.snapshot().participants.find(p => p.id === 'p2').seat
  room.remove('p2'); assert.ok(cmd(alice, 'join').ok)
  assert.equal(room.snapshot().participants.find(p => p.id === 'alice').seat, before)
  const base = { type: 'campus-state', sequence: 1, serverTime: Date.now(), people: [{ id: 'alice', name: 'Alice', color: 'teal', handle: null, locatorVisible: false, activity: 'walk', pose: null }] }
  const seated = room.seatVisitors(base); assert.ok(parseCampusSnapshot(seated)); assert.equal(seated.people[0].pose.space, 'seminar:0')
  assert.deepEqual({ x: seated.people[0].pose.x, y: seated.people[0].pose.y, z: seated.people[0].pose.z, yaw: seated.people[0].pose.yaw }, layout.seats[before])
  const hidden = campusSnapshotForViewer({ ...seated, people: [...seated.people, { id: 'bob', name: 'Bob', color: 'ocean', handle: null, activity: 'overview', pose: null }] }, 'bob')
  assert.equal(hidden.people[0].pose, null); assert.equal(hidden.people[0].screening, undefined); assert.ok(parseCampusSnapshot(hidden))
  const malformed = structuredClone(seated); malformed.people[0].screening.seat = 32; assert.equal(parseCampusSnapshot(malformed), null)
  cmd(alice, 'leave'); assert.equal(room.has('alice'), false); assert.equal(room.snapshot().media.url, SCREENING_PROGRAM.url)
})
test('the welcome loop survives host departures, role changes and more than four hours', () => {
  const { room, cmd, advance } = setup(); advance(3000)
  room.remove(admin.id); assert.equal(room.snapshot().playing, true); assert.equal(room.snapshot().hostOnline, false)
  advance(10000); room.connected(admin); assert.equal(room.snapshot().playing, true)
  room.connected(identity(admin.id)); assert.equal(room.snapshot().playing, true)
  advance(5 * 3600000); room.reconcile()
  assert.equal(room.snapshot().playing, true); assert.ok(room.snapshot().position < SCREENING_PROGRAM.duration)
  assert.ok(parseScreeningState(room.snapshot()))
  cmd(admin, 'pause'); room.remove(admin.id); advance(100000); room.connected(admin)
  assert.equal(room.snapshot().playing, false, 'an intentional owner pause remains paused')
})
test('screening chat requires membership, bounds history and rate, and strips name/text controls', () => {
  const { room, cmd, advance } = setup()
  assert.ok(cmd(alice, 'chat', { text: 'Not seated' }).error); cmd(alice, 'join')
  assert.ok(cmd({ ...alice, name: 'Alice\u202e' }, 'chat', { text: 'hi\u0000' }).ok)
  assert.equal(room.snapshot().messages[0].text, 'hi'); assert.equal(room.snapshot().messages[0].name, 'Alice')
  assert.ok(cmd(alice, 'chat', { text: 'burst' }).error); assert.ok(cmd(alice, 'react', { text: '<script>' }).error)
  advance(2000); assert.ok(cmd(alice, 'react', { text: '👏' }).ok)
  for (let i = 0; i < 45; i++) { advance(2000); cmd(alice, 'chat', { text: 'hello ' + i }) }
  assert.equal(room.snapshot().messages.length, 40); assert.ok(parseScreeningState(room.snapshot()))
  assert.equal(room.removeMessages('alice'), true); assert.equal(room.snapshot().messages.length, 0)
  const duplicate = structuredClone(room.snapshot()); duplicate.participants.push(duplicate.participants[0]); assert.equal(parseScreeningState(duplicate), null)
})
test('video drift is nudged, large seeks catch up, hidden tabs stop, and blocked playback is surfaced', async () => {
  const { room, cmd } = setup(); cmd(admin, 'pause'); cmd(admin, 'seek', { position: 20 }); cmd(admin, 'play')
  let plays = 0, pauses = 0, blocked = 0
  const v = { currentTime: 19.5, duration: 120, playbackRate: 1, readyState: 4, paused: false, ended: false, play: async () => { plays++ }, pause: () => { pauses++ } }
  const s = { ...room.snapshot(), loop: false }; syncScreeningVideo(v, s, s.changedAt, true, () => blocked++)
  assert.equal(v.playbackRate, 1.03); assert.equal(v.currentTime, 19.5)
  v.currentTime = 5; syncScreeningVideo(v, s, s.changedAt, true, () => blocked++); assert.equal(v.currentTime, 20); assert.equal(v.playbackRate, 1)
  syncScreeningVideo(v, s, s.changedAt, false, () => blocked++); assert.equal(pauses, 1)
  v.paused = true; v.play = async () => { plays++; throw Error('NotAllowedError') }; syncScreeningVideo(v, s, s.changedAt, true, () => blocked++); await Promise.resolve(); assert.equal(blocked, 1)
  v.currentTime = 3
  syncScreeningVideo(v, s, s.changedAt, true, () => blocked++, false); assert.equal(plays, 1, 'do not retry blocked playback until a user gesture'); assert.equal(v.currentTime, 3, 'blocked playback must not keep seeking')
  v.ended = true; syncScreeningVideo(v, s, s.changedAt + 200000, true, () => blocked++); assert.equal(plays, 1)
  v.readyState = 0; v.currentTime = 2; syncScreeningVideo(v, s, s.changedAt, true, () => blocked++); assert.equal(v.currentTime, 2)
})

test('YouTube startup is not interrupted by repeated seeks while blocked or buffering', () => {
  const { room, cmd } = setup(); cmd(admin, 'pause'); cmd(admin, 'seek', { position: 20 }); cmd(admin, 'play')
  let state = -1, time = 0, plays = 0, seeks = 0, pauses = 0
  const player = { getPlayerState: () => state, getCurrentTime: () => time, getDuration: () => 120, seekTo: t => { time = t; seeks++ }, playVideo: () => { plays++ }, pauseVideo: () => { pauses++ } }
  const s = { ...room.snapshot(), loop: false }
  syncScreeningYoutube(player, s, s.changedAt, false); assert.equal(seeks, 0); assert.equal(plays, 0)
  state = 3; syncScreeningYoutube(player, s, s.changedAt); assert.equal(seeks, 0); assert.equal(plays, 0)
  state = 2; syncScreeningYoutube(player, s, s.changedAt); assert.equal(seeks, 1); assert.equal(plays, 1)
  state = 1; syncScreeningYoutube(player, s, s.changedAt + 500); assert.equal(seeks, 1)
  syncScreeningYoutube(player, { ...s, playing: false }, s.changedAt); assert.equal(pauses, 1)
})

test('ended YouTube players restart the same film at the shared loop position', () => {
  const { room } = setup(), s = room.snapshot()
  let time = SCREENING_PROGRAM.duration, plays = 0, pauses = 0
  const p = { getPlayerState: () => 0, getCurrentTime: () => time, getDuration: () => SCREENING_PROGRAM.duration, seekTo: t => { time = t }, playVideo: () => { plays++ }, pauseVideo: () => { pauses++ } }
  syncScreeningYoutube(p, s, s.changedAt + SCREENING_PROGRAM.duration * 1000 + 500)
  assert.ok(Math.abs(time - .5) < .00001); assert.equal(plays, 1); assert.equal(pauses, 0)
  syncScreeningYoutube(p, s, s.changedAt + 400000, false); assert.equal(plays, 1)
})

const wait = async fn => { const end = Date.now() + 6000; while (Date.now() < end) { const v = fn(); if (v) return v; await new Promise(r => setTimeout(r, 15)) } throw Error('Timed out waiting for screening state') }
test('authenticated peers join the fixed loop; chat stays with the audience and host departure keeps it running', async t => {
  const server = createServer(), boundary = [{x:-1000,z:-1000},{x:1000,z:-1000},{x:1000,z:1000},{x:-1000,z:1000},{x:-1000,z:-1000}]
  const campus = attachCampusServer(server, 'https://campus.test', async token => { if (!['owner','alice','bob','outsider'].includes(token)) throw Error('Bad identity'); return identity(token, token === 'owner' ? 'admin' : 'member') }, boundary, [], undefined, [])
  await new Promise(r => server.listen(0,'127.0.0.1',r)); const peers = []
  const peer = id => { const messages = [], ws = new WebSocket(`ws://127.0.0.1:${server.address().port}/presence`, { origin:'https://campus.test' }); peers.push(ws); ws.on('message', b => { const m=JSON.parse(b); messages.push(m); if(m.type==='auth-required') ws.send(JSON.stringify({type:'authenticate',token:id})) }); return { ws,messages, send:(action,extra={})=>ws.send(JSON.stringify({type:'screening',action,session:campus.screening.snapshot().session,...extra})) } }
  t.after(async()=>{for(const ws of peers)ws.terminate();campus.close();await new Promise(r=>server.close(r))})
  const owner=peer('owner'), a=peer('alice'), outside=peer('outsider')
  await wait(()=>[owner,a,outside].every(p=>p.messages.some(m=>m.type==='campus-welcome')))
  await wait(()=>a.messages.some(m=>m.type==='screening-state'&&m.media?.url===SCREENING_PROGRAM.url&&m.loop&&m.playing))
  a.send('play'); await wait(()=>a.messages.some(m=>m.type==='screening-result'&&m.error?.includes('administrator'))); assert.equal(campus.screening.snapshot().playing,true)
  await new Promise(r=>setTimeout(r,350)); a.send('join'); await wait(()=>campus.screening.has('alice'))
  await new Promise(r=>setTimeout(r,350)); owner.send('play'); await wait(()=>a.messages.some(m=>m.type==='screening-state'&&m.playing))
  const b=peer('bob'); await wait(()=>b.messages.some(m=>m.type==='campus-welcome')); b.send('join'); await wait(()=>campus.screening.has('bob'))
  const state=await wait(()=>a.messages.find(m=>m.type==='campus-state'&&m.people.filter(p=>p.screening).length===2)); assert.ok(parseCampusSnapshot(state)); assert.notEqual(state.people.find(p=>p.id==='alice').screening.seat,state.people.find(p=>p.id==='bob').screening.seat)
  await new Promise(r=>setTimeout(r,1600)); a.send('chat',{text:'Audience only'}); await wait(()=>b.messages.some(m=>m.type==='screening-state'&&m.messages.some(v=>v.text==='Audience only')))
  assert.equal(outside.messages.some(m=>m.type==='screening-state'&&m.messages.some(v=>v.text==='Audience only')),false)
  owner.ws.close(); await wait(()=>a.messages.some(m=>m.type==='screening-state'&&!m.hostOnline&&m.playing&&m.media?.url===SCREENING_PROGRAM.url))
  a.send('leave'); await wait(()=>!campus.screening.has('alice')); assert.equal(campus.screening.has('bob'),true)
})
