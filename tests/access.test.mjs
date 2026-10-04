import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { WebSocket, WebSocketServer } from 'ws'
import { createAccessVerifier } from '../server/access.ts'
import { attachLiveAccess } from '../server/liveAccess.ts'
import { attachFootballServer } from '../server/footballServer.ts'
import { createCrowdAPI } from '../server/crowdApi.ts'
import { fakeFirestore } from './firestoreFake.mjs'
import { profileError, campusDestination } from '../src/lib/community.ts'
const waitFor = async (fn) => {
  const end = Date.now() + 4000
  while (Date.now() < end) {
    const value = fn()
    if (value) return value
    await new Promise((r) => setTimeout(r, 10))
  }
  throw new Error('Timeout')
}
const token = (exp) =>
  `header.${Buffer.from(JSON.stringify({ exp })).toString('base64url')}.signature`
test('Firebase verifies revocation and Google identity; database permissions grant roles', async () => {
  const { db, data } = fakeFirestore({
    'profiles/student': { display_name: 'Admin' },
    'campusMembers/student': { role: 'member', status: 'active' },
  })
  let user = {
      uid: 'student',
      email: 'student@nitgoa.ac.in',
      emailVerified: true,
      disabled: false,
    },
    provider = 'google.com',
    denied = false,
    exp = Math.floor(Date.now() / 1000) + 60
  const calls = []
  const auth = {
    verifyIdToken: async (value, revoked) => {
      calls.push(revoked)
      if (denied) throw new Error('private credential detail')
      return {
        uid: 'student',
        exp,
        auth_time: Math.floor(Date.now() / 1000),
        firebase: { sign_in_provider: provider },
        role: 'admin',
      }
    },
    getUser: async () => user,
  }
  const verify = createAccessVerifier({ auth, db, domains: ['nitgoa.ac.in'] })
  assert.equal((await verify(token(exp))).role, 'member')
  assert.deepEqual(calls, [true])
  denied = true
  await assert.rejects(() => verify(token(exp)), /could not be verified/)
  denied = false
  user.emailVerified = false
  await assert.rejects(() => verify(token(exp)), /verified Google/)
  user.emailVerified = true
  user.disabled = true
  await assert.rejects(() => verify(token(exp)), /verified Google/)
  user.disabled = false
  user.email = 'student@evilnitgoa.ac.in'
  await assert.rejects(() => verify(token(exp)), /not eligible/)
  user.email = 'student@nitgoa.ac.in'
  provider = 'password'
  await assert.rejects(() => verify(token(exp)), /verified Google/)
  provider = 'google.com'
  data.set('campusMembers/student', { role: 'member', status: 'banned' })
  await assert.rejects(() => verify(token(exp)), /unavailable/)
  exp = 1
  await assert.rejects(() => verify(token(exp)), /expired/)
  await assert.rejects(() => verify('token'), /Sign in/)
})
test('first Google visit creates a private profile and ordinary membership', async () => {
  const { db, data } = fakeFirestore(),
    verify = createAccessVerifier({
      auth: {
        verifyIdToken: async () => ({
          uid: 'new',
          exp: Math.floor(Date.now() / 1000) + 60,
          auth_time: 1,
          firebase: { sign_in_provider: 'google.com' },
        }),
        getUser: async () => ({
          uid: 'new',
          email: 'new@example.com',
          emailVerified: true,
          displayName: 'New student',
        }),
      },
      db,
    })
  assert.equal((await verify(token(9999999999))).role, 'member')
  assert.equal(data.get('profiles/new').is_public, false)
  assert.equal(data.get('campusMembers/new').role, 'member')
  assert.equal(data.has('publicProfiles/new'), false)
})
test('profile validation and invitation routing reject reserved handles and retain a concert destination', () => {
  assert.ok(profileError({ display_name: 'Me', handle: 'admin' }))
  assert.ok(profileError({ display_name: 'Me', is_public: true }))
  assert.equal(
    profileError({ display_name: 'Me', handle: 'my_music', is_public: true }),
    null,
  )
  assert.equal(
    campusDestination('?location=open-air-theatre&concert=1&code=secret'),
    '/campus?location=open-air-theatre&concert=1',
  )
})
test('room admission authenticates first, blocks duplicates, queues fairly and promotes after a seat opens', async () => {
  const http = createServer(),
    wss = new WebSocketServer({ noServer: true, maxPayload: 16384 }),
    gate = attachLiveAccess(http, wss, '/test', undefined, 2, async (token) => {
      if (token === 'banned') throw new Error('Account suspended')
      return {
        id: token,
        name: 'Verified ' + token,
        role: 'member',
        expiresAt: Date.now() + 60000,
      }
    }),
    sockets = []
  gate.onAdmit((ws, user) =>
    ws.send(JSON.stringify({ type: 'welcome', id: user.id })),
  )
  http.listen(0, '127.0.0.1')
  await once(http, 'listening')
  const origin = `http://127.0.0.1:${http.address().port}`
  const peer = (id, auto = true) => {
    const ws = new WebSocket(origin.replace('http:', 'ws:') + '/test', {
        origin,
      }),
      messages = []
    sockets.push(ws)
    ws.on('message', (b) => messages.push(JSON.parse(b)))
    if (auto)
      ws.on('open', () =>
        ws.send(JSON.stringify({ type: 'authenticate', token: id })),
      )
    return { ws, messages }
  }
  try {
    const anonymous = peer('anon', false)
    await once(anonymous.ws, 'open')
    anonymous.ws.send(JSON.stringify({ type: 'stage', role: 'admin' }))
    await once(anonymous.ws, 'close')
    assert.equal(gate.snapshot().occupancy, 0)
    assert.ok(!anonymous.messages.some((m) => m.type === 'welcome'))
    const a = peer('a')
    await waitFor(() => a.messages.some((m) => m.type === 'welcome'))
    const b = peer('b')
    await waitFor(() => b.messages.some((m) => m.type === 'welcome'))
    const c = peer('c'),
      d = peer('d')
    await waitFor(
      () =>
        c.messages.some((m) => m.type === 'waiting' && m.position === 1) &&
        d.messages.some((m) => m.type === 'waiting' && m.position === 2),
    )
    assert.equal(gate.snapshot().occupancy, 2)
    assert.equal(gate.snapshot().waiting, 2)
    const duplicate = peer('a')
    await once(duplicate.ws, 'close')
    assert.ok(
      duplicate.messages.some(
        (m) => m.type === 'error' && /another tab/.test(m.message),
      ),
    )
    const banned = peer('banned')
    await once(banned.ws, 'close')
    assert.ok(!banned.messages.some((m) => m.type === 'welcome'))
    a.ws.close()
    await waitFor(() => c.messages.some((m) => m.type === 'welcome'))
    await waitFor(() => d.messages.at(-1)?.position === 1)
    assert.equal(gate.snapshot().occupancy, 2)
    gate.kick('c')
    await once(c.ws, 'close')
    await waitFor(() => d.messages.some((m) => m.type === 'welcome'))
    assert.equal(gate.snapshot().waiting, 0)
    const kicked = peer('c')
    await once(kicked.ws, 'close')
    assert.ok(
      kicked.messages.some(
        (m) => m.type === 'error' && /wait before/.test(m.message),
      ),
    )
  } finally {
    for (const ws of sockets) ws.terminate()
    gate.close()
    await new Promise((r) => http.close(r))
  }
})
test('unauthenticated football sockets receive no game state; members cannot inspect crowd identities', async () => {
  let api
  const http = createServer((req, res) => {
      if (!api(req, res)) res.end('ok')
    }),
    verify = async (token) => {
      if (token !== 'member-token-for-testing') throw new Error('Invalid')
      return {
        id: 'member',
        name: 'Me',
        role: 'member',
        expiresAt: Date.now() + 60000,
      }
    },
    game = attachFootballServer(http, undefined, verify)
  api = createCrowdAPI(game.access, game.access, () => {}, verify)
  http.listen(0, '127.0.0.1')
  await once(http, 'listening')
  const origin = `http://127.0.0.1:${http.address().port}`,
    ws = new WebSocket(origin.replace('http:', 'ws:') + '/football', {
      origin,
    }),
    messages = []
  ws.on('message', (b) => messages.push(JSON.parse(b)))
  try {
    await once(ws, 'open')
    await new Promise((r) => setTimeout(r, 160))
    assert.deepEqual(
      messages.map((m) => m.type),
      ['auth-required'],
    )
    assert.equal((await fetch(origin + '/api/crowd')).status, 401)
    assert.equal(
      (
        await fetch(origin + '/api/crowd', {
          headers: { Authorization: 'Bearer member-token-for-testing' },
        })
      ).status,
      403,
    )
  } finally {
    ws.terminate()
    game.close()
    await new Promise((r) => http.close(r))
  }
})

test('moderator HTTP actions require a ticket and authorize the audit before evicting anyone', async () => {
  const calls = [],
    kicked = [],
    ended = [],
    room = { snapshot: () => ({ people: [] }), kick: (id) => kicked.push(id) }
  let deny = false
  const verify = async () => ({
    id: 'host',
    name: 'Host',
    role: 'admin',
    expiresAt: Date.now() + 60000,
  })
  const api = createCrowdAPI(
    room,
    room,
    (id) => ended.push(id),
    verify,
    () => {},
    () => ({
      factors: {
        authorize: (identity, ticket) => {
          if (ticket !== 'verified-ticket')
            throw new Error('Verify your authenticator code before moderating.')
        },
      },
      moderate: async (identity, body) => {
        if (deny)
          throw new Error('This action is outside your moderator permissions.')
        calls.push(body)
      },
    }),
  )
  const http = createServer((req, res) => {
    if (!api(req, res)) res.end()
  })
  http.listen(0, '127.0.0.1')
  await once(http, 'listening')
  const origin = `http://127.0.0.1:${http.address().port}`,
    payload = { target: 'googleUID', action: 'ban', reason: 'Spam review' }
  const post = (ticket, body = payload) =>
    fetch(origin + '/api/crowd', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer valid-firebase-test-token',
        'Content-Type': 'application/json',
        'X-Moderator-Token': ticket,
      },
      body: JSON.stringify(body),
    })
  try {
    assert.equal((await post('')).status, 403)
    assert.equal(calls.length, 0)
    assert.equal((await post('verified-ticket')).status, 200)
    assert.deepEqual(calls, [payload])
    assert.deepEqual(kicked, [payload.target, payload.target])
    deny = true
    assert.equal((await post('verified-ticket')).status, 403)
    assert.equal(kicked.length, 2)
    deny = false
    assert.equal(
      (await post('verified-ticket', { ...payload, action: 'end-stage' }))
        .status,
      200,
    )
    assert.deepEqual(ended, [payload.target])
  } finally {
    await new Promise((resolve) => http.close(resolve))
  }
})
