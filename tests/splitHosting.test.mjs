import { test } from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { createServer } from 'node:http'
import { WebSocket, WebSocketServer } from 'ws'
import { campusServerURL, liveServerURL } from '../src/lib/serverURL.ts'
import { configuredOrigins, handleCampusCors } from '../server/siteOrigins.ts'
import { attachLiveAccess } from '../server/liveAccess.ts'
import { createAccessAPI } from '../server/accessApi.ts'
import { attachOatServer } from '../server/oatServer.ts'
const page = 'https://nitg-explored.pages.dev/campus?view=walk', backend = 'https://nitg-explored.onrender.com'
const origins = [new URL(page).origin, backend]
test('split hosting keeps APIs and every live room on the backend; map and backing audio remain frontend assets', () => {
  assert.equal(campusServerURL('/api/people?cursor=next', page, backend).href, backend + '/api/people?cursor=next')
  for (const path of ['/presence', '/football', '/oat']) {
    assert.equal(liveServerURL(path, page, backend).href, backend.replace('https:', 'wss:') + path)
    assert.equal(liveServerURL(path, page).host, new URL(page).host)
  }
  assert.equal(liveServerURL('/oat', 'http://localhost:5173/campus').href, 'ws://localhost:5173/oat')
  assert.equal(liveServerURL('/football', page, backend, 'wss://other.example/football').host, 'other.example')
  for (const value of ['https://user:password@server.example', 'https://server.example/path', 'https://server.example?x=1', 'http://server.example', 'javascript:alert(1)'])
    assert.throws(() => campusServerURL('/api/me', page, value))
  for (const path of ['//evil.example/api/me', 'https://evil.example/api/me', '/\\evil.example/api/me'])
    assert.throws(() => campusServerURL(path, page, backend))
  assert.throws(() => liveServerURL('/football', page, backend, 'ws://insecure.example'))
})
test('production frontend origins reject wildcards, credentials, paths, insecure URLs and preview subdomains', () => {
  assert.deepEqual(configuredOrigins(backend, ` ${origins[0]},${backend} `), [backend, origins[0]])
  for (const value of ['https://*.pages.dev', 'https://site.example/path', 'https://user:pass@site.example', 'http://site.example', 'https://site.example?x=1'])
    assert.throws(() => configuredOrigins(backend, value))
})
test('CORS permits exact frontend origins while Firebase authentication still controls API access', async t => {
  const api = createAccessAPI(async token => {
    if (token !== 'verified-test-token-'.repeat(8)) throw Error('denied')
    return { id: 'test', name: 'Verified', role: 'member', expiresAt: Date.now() + 60000 }
  })
  const server = createServer((req, res) => { if (!handleCampusCors(req, res, origins) && !api(req, res)) { res.writeHead(404); res.end() } })
  server.listen(0, '127.0.0.1'); await once(server, 'listening')
  t.after(() => { server.closeAllConnections(); server.close() })
  const base = `http://127.0.0.1:${server.address().port}`
  for (const origin of origins) {
    const preflight = await fetch(base + '/api/access', { method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'authorization,content-type,x-moderator-token' } })
    assert.equal(preflight.status, 204); assert.equal(preflight.headers.get('Access-Control-Allow-Origin'), origin)
    assert.equal(preflight.headers.get('Access-Control-Allow-Credentials'), null)
    const anonymous = await fetch(base + '/api/access', { headers: { Origin: origin } })
    assert.equal(anonymous.status, 401); assert.equal(anonymous.headers.get('Access-Control-Allow-Origin'), origin)
    const member = await fetch(base + '/api/access', { headers: { Origin: origin, Authorization: 'Bearer ' + 'verified-test-token-'.repeat(8) } })
    assert.equal(member.status, 200); assert.equal((await member.json()).role, 'member')
  }
  for (const origin of ['https://evil.example', 'https://preview.nitg-explored.pages.dev', 'null']) {
    const response = await fetch(base + '/api/access', { method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'GET' } })
    assert.equal(response.status, 403); assert.equal(response.headers.get('Access-Control-Allow-Origin'), null)
  }
  const unknownHeader = await fetch(base + '/api/access', { method: 'OPTIONS', headers: { Origin: origins[0], 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'x-forged-role' } })
  assert.equal(unknownHeader.status, 403)
})
test('both frontend origins must authenticate before entering the shared WebSocket room', async t => {
  const server = createServer(), wss = new WebSocketServer({ noServer: true }), sockets = []
  const gate = attachLiveAccess(server, wss, '/presence', origins, 4, async token => {
    if (token !== 'verified') throw Error('Access denied')
    return { id: 'visitor', name: 'Verified', role: 'member', expiresAt: Date.now() + 60000 }
  })
  gate.onAdmit((ws, identity) => ws.send(JSON.stringify({ type: 'campus-welcome', id: identity.id })))
  server.listen(0, '127.0.0.1'); await once(server, 'listening')
  t.after(() => { for (const ws of sockets) ws.terminate(); gate.close(); server.close() })
  const url = `ws://127.0.0.1:${server.address().port}/presence`
  for (const origin of origins) {
    const ws = new WebSocket(url, { origin }); sockets.push(ws)
    const first = await once(ws, 'message'); assert.equal(JSON.parse(first[0]).type, 'auth-required')
    assert.equal(gate.snapshot().occupancy, 0)
    const welcome = once(ws, 'message'); ws.send(JSON.stringify({ type: 'authenticate', token: 'verified' }))
    assert.equal(JSON.parse((await welcome)[0]).type, 'campus-welcome')
    ws.close(); await once(ws, 'close')
    await new Promise(resolve => setImmediate(resolve))
  }
  const bad = new WebSocket(url, { origin: 'https://unrelated.example' }); sockets.push(bad)
  bad.on('error', () => {})
  const [req, res] = await once(bad, 'unexpected-response'); assert.equal(res.statusCode, 403); res.resume(); req.destroy()
})
test('concert uploads allow the exact new origin but still require a live performer token', async t => {
  let oat
  const server = createServer((req, res) => { if (!oat.handleRequest(req, res)) { res.writeHead(404); res.end() } })
  oat = attachOatServer(server, origins, undefined, () => Promise.resolve([]))
  server.listen(0, '127.0.0.1'); await once(server, 'listening')
  t.after(() => { oat.close(); server.closeAllConnections(); server.close() })
  const url = `http://127.0.0.1:${server.address().port}/oat/audio`
  const preflight = await fetch(url, { method: 'OPTIONS', headers: { Origin: origins[0] } })
  assert.equal(preflight.status, 204); assert.equal(preflight.headers.get('Access-Control-Allow-Origin'), origins[0])
  const anonymous = await fetch(url, { method: 'POST', headers: { Origin: origins[0], 'X-Oat-Token': 'forged' }, body: 'audio' })
  assert.equal(anonymous.status, 403)
  const stranger = await fetch(url, { method: 'OPTIONS', headers: { Origin: 'https://evil.example' } })
  assert.equal(stranger.status, 403)
})
