import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { cpSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { WebSocket } from 'ws'
import { CAMPUS_CAPACITY, canHearNearby, chatText, parseCampusChat, parseCampusPose, parseCampusSnapshot } from '../src/lib/campusProtocol.ts'
import { createCampusRoom, publishedCampusBoundary } from '../server/campusRoom.ts'
import { attachCampusServer } from '../server/campusServer.ts'
import { createCrowdAPI } from '../server/crowdApi.ts'
import { createAccessVerifier } from '../server/access.ts'
import { advanceJump, freshJump } from '../src/lib/avatarJump.ts'
import { fakeFirestore } from './firestoreFake.mjs'

const boundary = [{ x: -200, z: -200 }, { x: 200, z: -200 }, { x: 200, z: 200 }, { x: -200, z: 200 }, { x: -200, z: -200 }]
const identity = (id, extra = {}) => ({ id, name: id === 'alice' ? 'Alice' : 'Campus friend', role: 'member', expiresAt: Date.now() + 3600000, ...extra })
const pose = (extra = {}) => ({ x: 0, y: 0, z: 0, yaw: 0, epoch: 1, moving: false, running: false, active: true, visible: true, space: 'outdoors', ...extra })

test('presence identity and profile links come only from verified public profile metadata', async () => {
  const { db, data } = fakeFirestore({ 'profiles/alice': { display_name: 'Alice', handle: 'alice', avatar_color: 'plum', is_public: false }, 'campusMembers/alice': { status: 'active', role: 'admin' } })
  const verify = createAccessVerifier({ db, auth: {
    verifyIdToken: async () => ({ uid: 'alice', exp: Math.floor(Date.now() / 1000) + 60, auth_time: 1, firebase: { sign_in_provider: 'google.com' } }),
    getUser: async () => ({ uid: 'alice', email: 'private@example.com', emailVerified: true }),
  } })
  const privateIdentity = await verify('valid-google-token-for-testing')
  assert.equal(privateIdentity.publicHandle, null)
  assert.equal(privateIdentity.avatarColor, 'plum')
  const room = createCampusRoom(boundary); room.add(privateIdentity)
  assert.equal(room.snapshot().people[0].handle, null)
  assert.equal(JSON.stringify(room.snapshot()).includes('private@example.com'), false)
  data.get('profiles/alice').is_public = true
  room.updateIdentity(await verify('valid-google-token-for-testing'))
  assert.equal(room.snapshot().people[0].handle, 'alice')
  data.get('profiles/alice').is_public = false
  room.updateIdentity(await verify('valid-google-token-for-testing'))
  assert.equal(room.snapshot().people[0].handle, null)
})

test('poses reject nonfinite coordinates, excessive speed, off-campus movement and rapid relocations', () => {
  const room = createCampusRoom(boundary); room.add(identity('alice'))
  assert.equal(room.pose('alice', pose(), 'walk', 1000), true)
  for (const value of [pose({ x: NaN }), pose({ y: 100 }), pose({ x: 250 }), pose({ yaw: 5 }), pose({ space: 'hostel:5' }), pose({ epoch: -1 })]) assert.equal(room.pose('alice', value, 'walk', 1100), false)
  assert.equal(room.pose('alice', pose({ x: 20 }), 'walk', 1100), false)
  assert.equal(room.pose('alice', pose({ x: .5, moving: false }), 'walk', 1100), true)
  assert.equal(room.snapshot(1100).people[0].pose.moving, true, 'server derives movement rather than trusting a flag')
  assert.equal(room.pose('alice', pose({ x: 100, epoch: 2 }), 'walk', 1200), false)
  assert.equal(room.pose('alice', pose({ x: 100, epoch: 2 }), 'walk', 2100), true)
  assert.equal(room.pose('alice', pose({ x: 100, epoch: 2, visible: false }), 'overview', 2200), true)
  assert.equal(room.snapshot(2300).people[0].pose.visible, false)
  assert.equal(room.pose('unknown', pose(), 'walk', 2400), false)
})

test('stale walkers stop animating and disappear; departure frees the campus place', () => {
  const room = createCampusRoom(boundary); room.add(identity('alice')); room.pose('alice', pose(), 'walk', 1000)
  room.pose('alice', pose({ x: .5 }), 'walk', 1100)
  assert.equal(room.snapshot(1500).people[0].pose.moving, true)
  assert.equal(room.snapshot(1800).people[0].pose.moving, false)
  assert.equal(room.snapshot(3200).people[0].pose.active, false)
  assert.equal(room.snapshot(17000).people[0].pose.visible, false)
  room.remove('alice'); assert.equal(room.snapshot().people.length, 0)
})

test('nearby chat is delivered only within 35 metres on the same floor and recent presence', () => {
  const room = createCampusRoom(boundary)
  for (const [id, p] of [['alice', pose()], ['near', pose({ x: 30 })], ['far', pose({ x: 40 })], ['floor', pose({ x: 3, y: 4, space: 'hostel:1' })], ['map', pose({ visible: false })]]) { room.add(identity(id)); room.pose(id, p, 'walk', 1000) }
  const nearby = room.chat('alice', 'Hello near me', 'nearby', 1100)
  assert.deepEqual(nearby.recipients.sort(), ['alice', 'near'])
  assert.equal(room.history(1100).length, 0, 'nearby messages cannot leak through global history')
  assert.equal(canHearNearby(pose(), pose({ x: 35 })), true)
  assert.equal(canHearNearby(pose(), pose({ x: 33, y: 8 })), true, 'nearby people on outdoor slopes can still chat')
  assert.equal(canHearNearby(pose(), pose({ x: 34, y: 10 })), false, 'range measures the full 3D distance')
  assert.equal(canHearNearby(pose({ space: 'hostel:0' }), pose({ space: 'hostel:1' })), false)
  assert.ok(room.chat('alice', 'Stale nearby', 'nearby', 4000).error)
  const global = room.chat('alice', 'Campus football anyone?', 'campus', 4200)
  assert.equal(global.recipients.length, 5)
  assert.equal(room.history(4200)[0].text, 'Campus football anyone?')
})

test('chat bounds text, prevents bursts, strips controls and keeps only recent global history', () => {
  const room = createCampusRoom(boundary); room.add(identity('alice'))
  assert.equal(chatText('  Hi\u0000\u202e there  '), 'Hi there')
  assert.equal(chatText('x'.repeat(281)), null)
  assert.equal(chatText(' \n '), null)
  assert.ok(room.chat('unknown', 'Hi', 'campus', 1000).error)
  const first = room.chat('alice', '<img src=x onerror=alert(1)>', 'campus', 1000)
  assert.equal(first.message.sender, 'alice'); assert.equal(first.message.name, 'Alice')
  assert.ok(parseCampusChat(first.message))
  assert.ok(room.chat('alice', 'Burst', 'campus', 1100).error)
  for (const now of [2000, 3000, 4000, 5000]) assert.ok(room.chat('alice', 'Hello', 'campus', now).message)
  assert.ok(room.chat('alice', 'Too many', 'campus', 6000).error)
  room.remove('alice'); room.add(identity('alice'))
  assert.ok(room.chat('alice', 'Reconnect bypass', 'campus', 6500).error)
  for (let i = 0; i < 55; i++) assert.ok(room.chat('alice', `Message ${i}`, 'campus', 20000 + i * 11000).message)
  assert.equal(room.history(620000).length, 50)
  assert.equal(room.history(2000000).length, 0)
})

test('protocol parsers reject duplicate identities, malformed poses and forged data fields', () => {
  const room = createCampusRoom(boundary); room.add(identity('alice')); room.pose('alice', pose(), 'walk', 1000)
  const snapshot = room.snapshot(1100)
  assert.ok(parseCampusSnapshot(snapshot))
  assert.equal(parseCampusSnapshot({ ...snapshot, people: [...snapshot.people, snapshot.people[0]] }), null)
  assert.equal(parseCampusSnapshot({ ...snapshot, people: [{ ...snapshot.people[0], handle: '../../admin' }] }), null)
  assert.equal(parseCampusSnapshot({ ...snapshot, people: [{ ...snapshot.people[0], color: 'invalid' }] }), null)
  assert.equal(parseCampusPose({ ...pose(), x: Infinity }), null)
  assert.equal(parseCampusPose({ ...pose(), space: ['outdoors'] }), null)
  assert.equal(parseCampusChat({ type: 'chat', id: 'm', sender: 'alice', name: 'Alice', scope: 'campus', text: null, time: 1 }), null)
  const parsed = parseCampusSnapshot({ ...snapshot, token: 'secret', people: snapshot.people.map(p => ({ ...p, email: 'secret@example.com' })) })
  assert.equal(JSON.stringify(parsed).includes('secret'), false)
})

test('published campus boundary is usable and rejects points outside the actual site', () => {
  const actual = publishedCampusBoundary(), room = createCampusRoom(actual); room.add(identity('alice'))
  assert.ok(actual.length >= 4)
  assert.equal(room.pose('alice', pose({ x: 1100, z: 1100 }), 'walk', 1000), false)
})

test('presence starts using the Docker runtime files without browser-only data modules', () => {
  const runtime = mkdtempSync(join(tmpdir(), 'nitg-presence-runtime-'))
  try {
    writeFileSync(join(runtime, 'package.json'), '{"type":"module"}')
    cpSync('server', join(runtime, 'server'), { recursive: true })
    mkdirSync(join(runtime, 'src'), { recursive: true }); cpSync('src/lib', join(runtime, 'src/lib'), { recursive: true })
    mkdirSync(join(runtime, 'dist/map'), { recursive: true }); cpSync('public/map/nit-goa-campus.json', join(runtime, 'dist/map/nit-goa-campus.json'))
    symlinkSync(resolve('node_modules'), join(runtime, 'node_modules'), 'dir')
    const result = spawnSync(process.execPath, ['--experimental-strip-types', '--input-type=module', '-e', "import { EventEmitter } from 'node:events'; import { attachCampusServer } from './server/campusServer.ts'; const campus = attachCampusServer(new EventEmitter(), undefined, async () => ({ id: 'test', name: 'Test', role: 'member', expiresAt: Date.now() + 60000 })); campus.close();"], { cwd: runtime, encoding: 'utf8', timeout: 10000 })
    assert.equal(result.status, 0, result.stderr)
  } finally { rmSync(runtime, { recursive: true, force: true }) }
})

const waitFor = async (condition, timeout = 6000) => { const end = Date.now() + timeout; while (Date.now() < end) { const value = condition(); if (value) return value; await new Promise(resolve => setTimeout(resolve, 15)) } throw new Error('Timed out waiting for shared campus') }
async function campusFixture(t) {
  const http = createServer((_req, res) => res.end('campus'))
  const campus = attachCampusServer(http, undefined, async token => {
    if (token === 'invalid') throw new Error('Sign-in verification failed.')
    return identity(token, token === 'alice' ? { publicHandle: 'alice', avatarColor: 'plum' } : {})
  }, boundary)
  http.listen(0, '127.0.0.1'); await once(http, 'listening')
  const origin = `http://127.0.0.1:${http.address().port}`, peers = []
  const peer = (id, authenticate = true, otherOrigin = origin) => {
    const ws = new WebSocket(origin.replace('http:', 'ws:') + '/presence', { origin: otherOrigin }), messages = []
    ws.on('error', () => {}); ws.on('message', data => messages.push(JSON.parse(data.toString())))
    if (authenticate) ws.on('open', () => ws.send(JSON.stringify({ type: 'authenticate', token: id })))
    const p = { ws, messages }; peers.push(p); return p
  }
  t.after(async () => { for (const p of peers) p.ws.terminate(); campus.close(); await new Promise(resolve => http.close(resolve)) })
  return { http, campus, peer, origin }
}

test('two signed-in visitors receive walking positions, chat, public profiles and departure over WebSockets', async t => {
  const { campus, peer } = await campusFixture(t), a = peer('alice'), b = peer('bob')
  await waitFor(() => a.messages.some(m => m.type === 'campus-welcome') && b.messages.some(m => m.type === 'campus-welcome'))
  a.ws.send(JSON.stringify({ type: 'pose', activity: 'walk', pose: pose() }))
  b.ws.send(JSON.stringify({ type: 'pose', activity: 'walk', pose: pose({ x: 3 }) }))
  const shared = await waitFor(() => b.messages.find(m => m.type === 'campus-state' && m.people.some(p => p.id === 'alice' && p.pose?.visible)))
  assert.equal(shared.people.find(p => p.id === 'alice').handle, 'alice')
  assert.equal(shared.people.find(p => p.id === 'bob').handle, null)
  assert.equal(JSON.stringify(shared).includes('expiresAt'), false)
  await new Promise(resolve => setTimeout(resolve, 120))
  a.ws.send(JSON.stringify({ type: 'pose', activity: 'walk', pose: pose({ x: .8 }) }))
  const moved = await waitFor(() => b.messages.find(m => m.type === 'campus-state' && m.people.some(p => p.id === 'alice' && p.pose?.x === .8)))
  assert.equal(moved.people.find(p => p.id === 'alice').pose.moving, true)
  a.ws.send(JSON.stringify({ type: 'chat', text: 'Meet me at the OAT', scope: 'campus', sender: 'bob', name: 'Forged Bob' }))
  const received = await waitFor(() => b.messages.find(m => m.type === 'chat'))
  assert.equal(received.sender, 'alice'); assert.equal(received.name, 'Alice')
  const c = peer('carol'); await waitFor(() => c.messages.some(m => m.type === 'campus-welcome'))
  assert.equal(c.messages.find(m => m.type === 'campus-welcome').history[0].text, 'Meet me at the OAT')
  b.ws.close(); await waitFor(() => a.messages.some(m => m.type === 'campus-state' && m.people.length === 2 && !m.people.some(p => p.id === 'bob')))
  campus.removeMessages('alice'); await waitFor(() => a.messages.some(m => m.type === 'chat-remove'))
  assert.equal(campus.room.history().length, 0)
})

test('authenticated peers see bicycle, buggy and dismount updates over the live connection', async t => {
  const { peer } = await campusFixture(t), a = peer('alice'), b = peer('bob')
  await waitFor(() => a.messages.some(m => m.type === 'campus-welcome') && b.messages.some(m => m.type === 'campus-welcome'))
  for (const vehicle of ['bicycle', 'buggy', 'walk']) {
    b.messages.length = 0
    a.ws.send(JSON.stringify({ type: 'pose', activity: 'walk', pose: pose({ vehicle }) }))
    const shared = await waitFor(() => b.messages.find(m => m.type === 'campus-state' && m.people.some(p => p.id === 'alice' && p.pose?.vehicle === vehicle)))
    assert.equal(parseCampusSnapshot(shared).people.find(p => p.id === 'alice').pose.vehicle, vehicle)
    await new Promise(resolve => setTimeout(resolve, 90))
  }
})

test('live buggy boarding follows a driver, rejects position spoofing, and frees seats on departure', async t => {
  const { peer } = await campusFixture(t), driver = peer('alice'), rider = peer('bob')
  await waitFor(() => driver.messages.some(m => m.type === 'campus-welcome') && rider.messages.some(m => m.type === 'campus-welcome'))
  driver.ws.send(JSON.stringify({ type: 'pose', activity: 'walk', pose: pose({ vehicle: 'buggy' }) }))
  rider.ws.send(JSON.stringify({ type: 'pose', activity: 'walk', pose: pose({ x: 1, vehicle: 'walk' }) }))
  await waitFor(() => rider.messages.some(m => m.type === 'campus-state' && m.people.every(p => p.pose)))
  rider.ws.send(JSON.stringify({ type: 'buggy-ride', driverId: 'alice', seat: 0, sender: 'alice' }))
  const boarded = await waitFor(() => driver.messages.find(m => m.type === 'campus-state' && m.people.some(p => p.id === 'bob' && p.ride)))
  const seated = boarded.people.find(p => p.id === 'bob'); assert.equal(seated.ride.driverId, 'alice'); assert.equal(seated.ride.seat, 1)
  await new Promise(resolve => setTimeout(resolve, 120))
  driver.ws.send(JSON.stringify({ type: 'pose', activity: 'walk', pose: pose({ vehicle: 'buggy', z: -.5 }) }))
  const moved = await waitFor(() => rider.messages.find(m => m.type === 'campus-state' && m.people.some(p => p.id === 'bob' && p.pose?.z < -.8)))
  assert.ok(parseCampusSnapshot(moved))
  rider.ws.send(JSON.stringify({ type: 'pose', activity: 'walk', pose: pose({ vehicle: 'walk', epoch: seated.pose.epoch, x: 100 }) }))
  await new Promise(resolve => setTimeout(resolve, 150))
  assert.ok(rider.messages.filter(m => m.type === 'campus-state').at(-1).people.find(p => p.id === 'bob').pose.x < 2)
  driver.ws.close()
  const released = await waitFor(() => rider.messages.find(m => m.type === 'campus-state' && m.people.length === 1 && !m.people[0].ride))
  assert.equal(released.people[0].pose.vehicle, 'walk'); assert.equal(released.people[0].pose.y, 0)
})

test('anonymous, wrong-origin, invalid-account and duplicate-account campus joins cannot receive shared state', async t => {
  const { peer } = await campusFixture(t), a = peer('alice')
  await waitFor(() => a.messages.some(m => m.type === 'campus-welcome'))
  const anonymous = peer('', false); await once(anonymous.ws, 'open')
  await new Promise(resolve => setTimeout(resolve, 150))
  assert.deepEqual(anonymous.messages.map(m => m.type), ['auth-required'])
  anonymous.ws.send(JSON.stringify({ type: 'chat', text: 'Forged', scope: 'campus' }))
  await waitFor(() => anonymous.messages.some(m => m.type === 'error'))
  assert.equal(a.messages.some(m => m.type === 'chat'), false)
  for (const id of ['alice', 'invalid']) { const denied = peer(id); await waitFor(() => denied.messages.some(m => m.type === 'error')); assert.equal(denied.messages.some(m => m.type === 'campus-welcome'), false) }
  const wrongOrigin = peer('visitor', true, 'https://unrelated.example')
  const [request, response] = await once(wrongOrigin.ws, 'unexpected-response'); assert.equal(response.statusCode, 403); response.resume(); request.destroy()
})

test('nearby WebSocket messages reach neighbours and never reach distant visitors, another floor or join history', async t => {
  const { peer } = await campusFixture(t), positions = [['alice', pose()], ['near', pose({ x: 3 })], ['far', pose({ x: 100 })], ['floor', pose({ space: 'hostel:1', y: 4 })]]
  const peers = positions.map(([id]) => peer(id))
  await waitFor(() => peers.every(p => p.messages.some(m => m.type === 'campus-welcome')))
  for (let i = 0; i < peers.length; i++) peers[i].ws.send(JSON.stringify({ type: 'pose', activity: 'walk', pose: positions[i][1] }))
  await waitFor(() => peers[0].messages.some(m => m.type === 'campus-state' && m.people.every(p => p.pose)))
  peers[0].ws.send(JSON.stringify({ type: 'chat', scope: 'nearby', text: 'Hello neighbours' }))
  await waitFor(() => peers[1].messages.some(m => m.type === 'chat'))
  await new Promise(resolve => setTimeout(resolve, 150))
  assert.equal(peers[0].messages.some(m => m.type === 'chat'), true)
  assert.equal(peers[2].messages.some(m => m.type === 'chat'), false)
  assert.equal(peers[3].messages.some(m => m.type === 'chat'), false)
  const late = peer('late'); await waitFor(() => late.messages.some(m => m.type === 'campus-welcome'))
  assert.deepEqual(late.messages.find(m => m.type === 'campus-welcome').history, [])
})

test('full shared campus queues authenticated visitors and admits the next visitor after departure', async t => {
  const { peer } = await campusFixture(t), visitors = []
  // Admission is sequential to stay below the independent pending-auth limit.
  for (let i = 0; i < CAMPUS_CAPACITY; i++) { const p = peer(`visitor_${i}`); visitors.push(p); await waitFor(() => p.messages.some(m => m.type === 'campus-welcome')) }
  const waiting = peer('waiting'); await waitFor(() => waiting.messages.some(m => m.type === 'waiting'))
  assert.equal(waiting.messages.find(m => m.type === 'waiting').position, 1)
  assert.equal(waiting.messages.some(m => m.type === 'campus-state'), false)
  visitors[0].ws.close(); await waitFor(() => waiting.messages.some(m => m.type === 'campus-welcome'))
})

test('owner moderation includes campus occupancy and evicts/removes chat only after verified audit', async t => {
  const calls = [], kicked = [], room = { snapshot: () => ({ capacity: 32, occupancy: 2, waiting: 0, people: [] }), kick: id => kicked.push(id) }
  const campus = { access: room, removeMessages: id => calls.push(`remove:${id}`) }
  const api = createCrowdAPI(room, room, () => {}, async token => identity('owner', { role: token.includes('owner') ? 'admin' : 'member' }), () => {}, () => ({ factors: { authorize: (_id, ticket) => { if (ticket !== 'verified') throw new Error('Verify your authenticator') } }, moderate: async (_id, body) => calls.push(`audit:${body.target}`) }), campus)
  const http = createServer((req, res) => { if (!api(req, res)) res.end() }); http.listen(0, '127.0.0.1'); await once(http, 'listening')
  t.after(() => new Promise(resolve => http.close(resolve)))
  const origin = `http://127.0.0.1:${http.address().port}`, headers = { Authorization: 'Bearer owner-token-for-testing', 'Content-Type': 'application/json' }
  const get = await fetch(origin + '/api/crowd', { headers }); assert.equal((await get.json()).campus.occupancy, 2)
  const options = { method: 'POST', headers, body: JSON.stringify({ target: 'alice', action: 'kick', reason: 'Chat spam' }) }
  assert.equal((await fetch(origin + '/api/crowd', options)).status, 403); assert.equal(kicked.length, 0)
  assert.equal((await fetch(origin + '/api/crowd', { ...options, headers: { ...headers, 'X-Moderator-Token': 'verified' } })).status, 200)
  assert.deepEqual(calls, ['audit:alice', 'remove:alice']); assert.deepEqual(kicked, ['alice', 'alice', 'alice'])
})

test('jump height is accepted and shared by presence without relaxing movement limits',()=> {
  const room=createCampusRoom(boundary);room.add(identity('alice'));room.add(identity('bob'))
  assert.equal(room.pose('alice',pose(),'walk',1000),true)
  const jump=freshJump();let apex=0
  for(let i=0;i<10;i++) {
    advanceJump(jump,0,.1,i===0);apex=Math.max(apex,jump.y)
    assert.equal(room.pose('alice',pose({y:jump.y}),'walk',1100+i*100),true)
    assert.equal(room.snapshot(1100+i*100).people.find(p=>p.id==='alice').pose.y,jump.y)
  }
  assert.ok(apex>.68);assert.equal(jump.y,0)
  assert.equal(room.pose('alice',pose({y:10}),'walk',2100),false)
})
