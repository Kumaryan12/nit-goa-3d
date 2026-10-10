import test from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { createServer } from 'node:http'
import { WebSocket } from 'ws'
import { createOatIceProvider } from '../server/oatIce.ts'
import { createMeteredIceProvider } from '../server/oatMeteredIce.ts'
import { attachOatServer } from '../server/oatServer.ts'
import { parseOatIceConfiguration, parseOatIceServers } from '../src/lib/oatIce.ts'

const relay = [{ urls: ['turns:turn.cloudflare.com:443?transport=tcp'], username: 'temporary-user', credential: 'temporary-password' }]
test('no-card Metered relay keeps the scoped API key on the server and coalesces credential retrieval', async () => {
  let time = 1000000, calls = 0
  const provider = createMeteredIceProvider({ OAT_METERED_DOMAIN: 'nitg_example.metered.live', OAT_METERED_API_KEY: 'scoped-key' }, async (url, options) => {
    calls++
    assert.equal(url.origin, 'https://nitg_example.metered.live')
    assert.equal(url.pathname, '/api/v1/turn/credentials')
    assert.equal(url.searchParams.get('apiKey'), 'scoped-key')
    assert.equal(options.redirect, 'error'); assert.ok(options.signal)
    return new Response(JSON.stringify(relay))
  }, () => time)
  const [a, b] = await Promise.all([provider('one'), provider('two')])
  assert.deepEqual(a, b); assert.equal(calls, 1)
  assert.equal(a.expiresAt, time + 1800000); assert.ok(!JSON.stringify(a).includes('scoped-key'))
  time += 300001; await provider('one'); assert.equal(calls, 2)
  assert.equal(createMeteredIceProvider({}), undefined)
  for (const domain of ['https://app.metered.live', '127.0.0.1', 'app.metered.live.attacker.example', 'app.metered.live/path', 'user:pass@app.metered.live']) {
    const invalid = createMeteredIceProvider({ OAT_METERED_DOMAIN: domain, OAT_METERED_API_KEY: 'key' }, async () => { throw new Error('Must not fetch') })
    await assert.rejects(invalid('one'), /incomplete/)
  }
})

test('Metered rejects missing relays and can recover from provider errors without leaking URLs', async () => {
  let count = 0
  const provider = createMeteredIceProvider({ OAT_METERED_DOMAIN: 'test.metered.live', OAT_METERED_API_KEY: 'secret' }, async () => {
    count++
    return count === 1 ? new Response('secret-provider-body', { status: 401 }) : count === 2 ? new Response(JSON.stringify([{ urls: 'stun:stun.example:80' }])) : new Response(JSON.stringify(relay))
  })
  await assert.rejects(provider('one'), /unavailable/)
  await assert.rejects(provider('one'), /relay missing/)
  assert.deepEqual((await provider('one')).iceServers, relay)
})
test('TURN credentials are server-issued, participant-scoped, cached and refreshed before expiration', async () => {
  let time = 1000000, calls = 0
  const provider = createOatIceProvider({ OAT_TURN_KEY_ID: 'test-key', OAT_TURN_API_TOKEN: 'server-only-secret' }, async (url, options) => {
    calls++
    assert.equal(url, 'https://rtc.live.cloudflare.com/v1/turn/keys/test-key/credentials/generate-ice-servers')
    assert.equal(options.headers.Authorization, 'Bearer server-only-secret')
    assert.deepEqual(JSON.parse(options.body), { ttl: 7200 })
    assert.equal(options.redirect, 'error'); assert.ok(options.signal)
    return new Response(JSON.stringify({ iceServers: relay, privateMetadata: 'never-forward' }), { status: 201 })
  }, () => time)
  const [a, b] = await Promise.all([provider('one'), provider('one')])
  assert.deepEqual(a, b); assert.equal(calls, 1)
  assert.deepEqual(Object.keys(a).sort(), ['expiresAt', 'iceServers'])
  await provider('two'); assert.equal(calls, 2)
  time += 6600001; await provider('one'); assert.equal(calls, 3)
  assert.equal(createOatIceProvider({}), undefined)
})

test('malformed credentials and credential-service failures never expose private responses', async () => {
  assert.equal(parseOatIceServers([{ urls: 'https://attacker.example/' }]), null)
  assert.equal(parseOatIceServers([{ urls: 'turn:relay.example:443' }]), null)
  assert.equal(parseOatIceServers([{ urls: 'turn:relay.example:443', username: 'a', credential: 'x'.repeat(513) }]), null)
  assert.equal(parseOatIceConfiguration({ iceServers: relay, expiresAt: 99 }, 100), null)
  assert.equal(parseOatIceConfiguration({ iceServers: relay, expiresAt: Infinity }, 100), null)
  assert.deepEqual(parseOatIceServers(relay), relay)
  let calls = 0
  const provider = createOatIceProvider({ OAT_TURN_KEY_ID: 'key', OAT_TURN_API_TOKEN: 'secret' }, async () => {
    calls++; return new Response('private-error-detail', { status: 401 })
  })
  await assert.rejects(provider('one'), /unavailable/)
  await assert.rejects(provider('one'), /unavailable/); assert.equal(calls, 2)
  const invalid = createOatIceProvider({ OAT_TURN_KEY_ID: '../../escape', OAT_TURN_API_TOKEN: 'secret' }, async () => { throw new Error('Must not fetch') })
  await assert.rejects(invalid('one'), /incomplete/)
})

const wait = async predicate => {
  const end = Date.now() + 3000
  while (Date.now() < end) { const result = predicate(); if (result) return result; await new Promise(resolve => setTimeout(resolve, 10)) }
  throw new Error('Timed out')
}
test('only admitted OAT visitors receive temporary relay credentials and refresh requests are throttled', async () => {
  let calls = 0, release
  const http = createServer(), pending = new Promise(resolve => { release = resolve })
  const oat = attachOatServer(http, undefined, async token => ({ id: token, name: 'Test visitor', role: 'member', expiresAt: Date.now() + 3600000 }), async id => {
    calls++; assert.equal(id, 'admitted'); await pending
    return { iceServers: relay, expiresAt: Date.now() + 7200000 }
  })
  http.listen(0, '127.0.0.1'); await once(http, 'listening')
  const origin = `http://127.0.0.1:${http.address().port}`, messages = []
  const unauthenticated = new WebSocket(origin.replace('http:', 'ws:') + '/oat', { origin })
  await once(unauthenticated, 'open')
  unauthenticated.send(JSON.stringify({ type: 'ice-refresh' }))
  const [code] = await once(unauthenticated, 'close')
  assert.equal(code, 4403); assert.equal(calls, 0)
  const ws = new WebSocket(origin.replace('http:', 'ws:') + '/oat', { origin })
  ws.on('message', bytes => messages.push(JSON.parse(bytes.toString())))
  try {
    await once(ws, 'open'); assert.equal(calls, 0)
    ws.send(JSON.stringify({ type: 'authenticate', token: 'admitted' }))
    const welcome = await wait(() => messages.find(message => message.type === 'welcome'))
    assert.equal(welcome.icePending, true); assert.equal(calls, 1)
    await wait(() => messages.find(message => message.type === 'state'))
    assert.ok(!messages.some(message => message.type === 'ice-config')) // Provider cannot block joining.
    release()
    const config = await wait(() => messages.find(message => message.type === 'ice-config'))
    assert.deepEqual(config.iceServers, relay)
    for (let i = 0; i < 10; i++) ws.send(JSON.stringify({ type: 'ice-refresh' }))
    await new Promise(resolve => setTimeout(resolve, 30)); assert.equal(calls, 1)
  } finally { release(); ws.terminate(); oat.close(); await new Promise(resolve => http.close(resolve)) }
})

test('relay failure leaves the room usable and sends a generic fallback without provider secrets', async () => {
  const http = createServer()
  const oat = attachOatServer(http, undefined, async token => ({ id: token, name: 'Test visitor', role: 'member', expiresAt: Date.now() + 3600000 }), async () => { throw new Error('secret-account-token') })
  http.listen(0, '127.0.0.1'); await once(http, 'listening')
  const origin = `http://127.0.0.1:${http.address().port}`, messages = []
  const ws = new WebSocket(origin.replace('http:', 'ws:') + '/oat', { origin })
  ws.on('message', bytes => messages.push(JSON.parse(bytes.toString())))
  try {
    await once(ws, 'open'); ws.send(JSON.stringify({ type: 'authenticate', token: 'admitted' }))
    assert.deepEqual(await wait(() => messages.find(message => message.type === 'ice-config')), { type: 'ice-config', unavailable: true })
    assert.ok(!JSON.stringify(messages).includes('secret-account-token'))
    ws.send(JSON.stringify({ type: 'stage' }))
    assert.ok(await wait(() => messages.find(message => message.type === 'state' && message.performerId === 'admitted')))
  } finally { ws.terminate(); oat.close(); await new Promise(resolve => http.close(resolve)) }
})
