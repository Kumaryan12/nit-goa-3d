import test from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { createServer } from 'node:http'
import { WebSocket } from 'ws'
import { oatUsageCycle, createCloudflareUsageReader, createOatUsageMonitor, createFirestoreUsageStore, OAT_VOICE_CUTOFF } from '../server/oatUsage.ts'
import { createOatIceProvider } from '../server/oatIce.ts'
import { attachOatServer } from '../server/oatServer.ts'
import { createOatVoiceService } from '../server/oatVoiceService.ts'
import { parseOatSnapshot } from '../src/lib/oatProtocol.ts'

const GB = 1e9, account = 'a'.repeat(32)
const relay = username => [{ urls: ['turns:turn.cloudflare.com:443?transport=tcp'], username, credential: 'private-password' }]
function memoryStore() {
  const records = new Map()
  return async (cycle, bytes) => {
    const previous = records.get(cycle.start), usedBytes = Math.max(bytes, previous?.usedBytes ?? 0)
    const next = { usedBytes, blocked: previous?.blocked === true || usedBytes >= OAT_VOICE_CUTOFF, warningLevel: usedBytes >= 850 * GB ? 2 : usedBytes >= 700 * GB ? 1 : 0 }
    records.set(cycle.start, next); return next
  }
}
test('billing periods use the configured UTC anchor and preserve the original day through short months', () => {
  assert.deepEqual(oatUsageCycle('2026-01-31', Date.parse('2026-02-28T10:00:00Z')), { start: '2026-02-28T00:00:00.000Z', end: '2026-03-31T00:00:00.000Z' })
  assert.equal(oatUsageCycle('2026-01-31', Date.parse('2026-03-30T23:59:59Z')).start, '2026-02-28T00:00:00.000Z')
  assert.equal(oatUsageCycle('2026-10-11', Date.parse('2026-12-10T23:59:59Z')).start, '2026-11-11T00:00:00.000Z')
  for (const anchor of ['', '2026-02-30', '2027-01-01', '2026-10-11T00:00:00Z']) assert.throws(() => oatUsageCycle(anchor, Date.parse('2026-10-11T01:00:00Z')))
})

test('usage polling counts account-wide egress, keeps the analytics token private, and rejects partial or malformed responses', async () => {
  const env = { OAT_CLOUDFLARE_ACCOUNT_ID: account, OAT_CLOUDFLARE_ANALYTICS_TOKEN: 'private-token' }, cycle = oatUsageCycle('2026-10-11', Date.parse('2026-10-11T01:00:00Z'))
  const valid = { data: { viewer: { accounts: [{ callsTurnUsageAdaptiveGroups: [{ sum: { egressBytes: 750 * GB } }] }] } }, errors: null }
  const read = createCloudflareUsageReader(env, async (url, options) => {
    assert.equal(url, 'https://api.cloudflare.com/client/v4/graphql'); assert.equal(options.headers.Authorization, 'Bearer private-token')
    assert.equal(options.redirect, 'error'); assert.ok(options.signal)
    const { query, variables } = JSON.parse(options.body)
    assert.ok(!query.includes('keyId')); assert.ok(!query.includes('ingressBytes')); assert.ok(!query.includes('dimensions'))
    assert.deepEqual(variables, { account, from: '2026-10-11', to: '2026-11-10' })
    return new Response(JSON.stringify(valid))
  })
  assert.equal(await read(cycle), 750 * GB)
  for (const body of [{ ...valid, errors: [{ message: 'private provider error' }] }, {}, { data: { viewer: { accounts: [] } } }, { data: { viewer: { accounts: [{ callsTurnUsageAdaptiveGroups: [{ sum: { egressBytes: -1 } }] }] } } }]) {
    await assert.rejects(createCloudflareUsageReader(env, async () => new Response(JSON.stringify(body)))(cycle), /Invalid usage response/)
  }
  await assert.rejects(createCloudflareUsageReader(env, async () => new Response('secret-body', { status: 401 }))(cycle), /unavailable/)
  await assert.rejects(createCloudflareUsageReader({ ...env, OAT_CLOUDFLARE_ACCOUNT_ID: '../../bad' })(cycle), /not configured/)
})

test('warnings, cutoff latch, restarts, outages and cycle resets require a fresh persisted usage reading', async () => {
  let now = Date.parse('2026-10-11T01:00:00Z'), bytes = 0, fail = false
  const store = memoryStore(), read = async () => { if (fail) throw new Error('private service error'); return bytes }
  const monitor = createOatUsageMonitor('2026-10-11', read, store, () => now)
  assert.equal(monitor.allowed(), false); assert.equal(monitor.snapshot().availability, 'checking')
  await monitor.refresh(); assert.equal(monitor.allowed(), true)
  bytes = 700 * GB; await monitor.refresh(true); assert.equal(monitor.snapshot().warningLevel, 1)
  bytes = 850 * GB; await monitor.refresh(true); assert.equal(monitor.snapshot().warningLevel, 2)
  bytes = 900 * GB; await monitor.refresh(true); assert.equal(monitor.allowed(), false); assert.equal(monitor.snapshot().availability, 'quota')
  bytes = 1; await monitor.refresh(true); assert.equal(monitor.snapshot().usedBytes, 900 * GB)
  const restart = createOatUsageMonitor('2026-10-11', read, store, () => now)
  await restart.refresh(); assert.equal(restart.snapshot().availability, 'quota')
  now = Date.parse('2026-11-11T00:00:00Z'); assert.equal(restart.allowed(), false)
  fail = true; await restart.refresh(true); assert.equal(restart.allowed(), false)
  fail = false; await restart.refresh(true); assert.equal(restart.allowed(), true); assert.equal(restart.snapshot().warningLevel, 0)
  now += 90001; assert.equal(restart.allowed(), false)
  fail = true; await restart.refresh(true); assert.equal(restart.snapshot().availability, 'unavailable')
  monitor.close(); restart.close()
})

test('polling coalesces requests and cannot admit voice from a request crossing the billing boundary or a failed checkpoint', async () => {
  let now = Date.parse('2026-11-10T23:59:59Z'), release, calls = 0
  const waiting = new Promise(resolve => { release = resolve })
  const monitor = createOatUsageMonitor('2026-10-11', async () => { calls++; await waiting; return 0 }, memoryStore(), () => now)
  const a = monitor.refresh(), b = monitor.refresh(); assert.equal(calls, 1)
  now += 2000; release(); await Promise.all([a, b]); assert.equal(monitor.allowed(), false)
  const failed = createOatUsageMonitor('2026-10-11', async () => 0, async () => { throw new Error('Firestore unavailable') }, () => now)
  await failed.refresh(); assert.equal(failed.allowed(), false)
  const invalid = createOatUsageMonitor('', async () => { throw new Error('Do not fetch') }, memoryStore(), () => now)
  await invalid.refresh(); assert.equal(invalid.snapshot().availability, 'unavailable')
})

test('Firestore stores account/cycle checkpoints transactionally and never lowers usage or unlatches a cutoff', async () => {
  let record, writes = 0
  const db = { doc(path) { assert.match(path, /^oatUsage\/a{32}-2026-10-11$/); return path }, async runTransaction(callback) { return callback({ get: async () => ({ data: () => record }), set: (ref, data) => { writes++; record = data } }) } }
  const store = createFirestoreUsageStore(() => db, account), cycle = { start: '2026-10-11T00:00:00.000Z', end: '2026-11-11T00:00:00.000Z' }
  assert.equal((await store(cycle, 901 * GB)).blocked, true)
  assert.equal((await store(cycle, 0)).usedBytes, 901 * GB); assert.equal(record.blocked, true); assert.equal(writes, 2)
})

test('Cloudflare uses ten-minute credentials, revokes all live generations and rejects an issuance completing after the budget closes', async () => {
  let allowed = true, count = 0, now = 1000000, pendingRelease
  const revoked = []
  const provider = createOatIceProvider({ OAT_TURN_KEY_ID: 'key', OAT_TURN_API_TOKEN: 'private-token' }, async (url, options) => {
    assert.equal(options.headers.Authorization, 'Bearer private-token')
    if (url.endsWith('/revoke')) { revoked.push(url.split('/').at(-2)); return new Response(null, { status: 204 }) }
    assert.equal(JSON.parse(options.body).ttl, 600)
    count++
    if (count === 3) await new Promise(resolve => { pendingRelease = resolve })
    return new Response(JSON.stringify({ iceServers: relay(`generation-${count}`) }))
  }, () => now, { ttl: 600, allowed: () => allowed })
  assert.equal((await provider('one')).expiresAt, now + 600000)
  now += 300001; await provider('one')
  const pending = provider('two'); allowed = false; pendingRelease()
  await assert.rejects(pending, /paused/)
  await provider.revokeAll(); assert.deepEqual(revoked.sort(), ['generation-1', 'generation-2', 'generation-3'])
  await assert.rejects(provider('three'), /paused/); assert.equal(count, 3)
  assert.ok(!JSON.stringify(revoked).includes('private-token'))
})

const wait = async predicate => {
  const end = Date.now() + 3000
  while (Date.now() < end) { const value = predicate(); if (value) return value; await new Promise(resolve => setTimeout(resolve, 10)) }
  throw new Error('Timed out')
}
test('real OAT sockets stop an active microphone and reject further voice while keeping the stage and music usable', async () => {
  let bytes = 0, fail = false, revoked = 0
  const budget = createOatUsageMonitor('2026-10-11', async () => { if (fail) throw new Error('provider failure'); return bytes }, memoryStore(), () => Date.parse('2026-10-11T01:00:00Z'))
  const iceProvider = Object.assign(async () => ({ iceServers: relay('test'), expiresAt: Date.now() + 600000 }), { revokeAll: async () => { revoked++ } })
  const http = createServer(), oat = attachOatServer(http, undefined, async token => ({ id: token, name: 'Test visitor', role: 'member', expiresAt: Date.now() + 3600000 }), { iceProvider, budget })
  http.listen(0, '127.0.0.1'); await once(http, 'listening')
  const origin = `http://127.0.0.1:${http.address().port}`, messages = []
  const ws = new WebSocket(origin.replace('http:', 'ws:') + '/oat', { origin })
  ws.on('message', bytes => messages.push(JSON.parse(bytes.toString())))
  const send = value => ws.send(JSON.stringify(value))
  try {
    await once(ws, 'open'); send({ type: 'authenticate', token: 'performer' })
    await wait(() => messages.find(m => m.type === 'state' && m.voiceAvailability === 'available'))
    send({ type: 'stage' }); await wait(() => messages.find(m => m.performerId === 'performer'))
    send({ type: 'mic', enabled: true, requestId: 1 }); await wait(() => messages.find(m => m.type === 'state' && m.micOn))
    fail = true; await budget.refresh(true)
    const unavailable = await wait(() => messages.find(m => m.type === 'state' && m.voiceAvailability === 'unavailable'))
    assert.equal(unavailable.micOn, false); assert.equal(unavailable.performerId, 'performer'); assert.ok(revoked > 0)
    fail = false; bytes = 901 * GB; await budget.refresh(true)
    const paused = await wait(() => messages.find(m => m.type === 'state' && m.voiceAvailability === 'quota'))
    assert.ok(parseOatSnapshot(paused)); assert.equal(paused.micOn, false)
    send({ type: 'mic', enabled: true, requestId: 2 }); const result = await wait(() => messages.find(m => m.type === 'mic-result' && m.requestId === 2))
    assert.equal(result.enabled, false); assert.match(result.error, /allowance/)
    send({ type: 'track', url: '/audio/oat-backing.wav', title: 'Still available', playing: true })
    const music = await wait(() => messages.find(m => m.type === 'state' && m.music?.title === 'Still available'))
    assert.equal(music.music.playing, true); assert.equal(music.micOn, false)
    assert.equal(parseOatSnapshot({ ...paused, voiceAvailability: 'fake' }), null)
  } finally { ws.terminate(); oat.close(); await new Promise(resolve => http.close(resolve)) }
})

test('selecting Cloudflare without monitoring configuration is closed and never silently falls back to Metered', async () => {
  const service = createOatVoiceService({ OAT_RELAY_PROVIDER: 'cloudflare', OAT_METERED_DOMAIN: 'test.metered.live', OAT_METERED_API_KEY: 'existing' })
  await service.budget.refresh(); assert.equal(service.budget.allowed(), false); assert.equal(service.iceProvider, undefined)
  service.budget.close()
})
