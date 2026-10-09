import test from 'node:test'
import assert from 'node:assert/strict'
import { analyticsAllowed, analyticsPage, analyticsParams, createAnalyticsTracker } from '../src/lib/analyticsPolicy.ts'

test('Analytics excludes personal profile paths, OAuth parameters, hashes and unknown paths', () => {
  assert.equal(analyticsPage('/people/real-person?email=private@example.com#token'), '/people/profile')
  assert.equal(analyticsPage('/campus?code=private&location=hostel#private'), '/campus')
  assert.equal(analyticsPage('/unknown/private@example.com'), '/other')
  assert.equal(analyticsPage('/admin/crowd'), '/admin/crowd')
})
test('Analytics only forwards allowed categorical event parameters', () => {
  assert.deepEqual(analyticsParams('select_building', { category: 'academic', name: 'Private', email: 'private@example.com', x: 10, uid: 'secret' }), { category: 'academic' })
  assert.deepEqual(analyticsParams('select_building', { category: 'private@example.com' }), {})
  assert.deepEqual(analyticsParams('join_activity', { activity: 'concert', chat: 'private' }), { activity: 'concert' })
  assert.deepEqual(analyticsParams('exploration_mode', { mode: 'bad' }), {})
  assert.deepEqual(analyticsParams('login', { uid: 'private' }), { method: 'google' })
  assert.deepEqual(analyticsParams('campus_enter', { uid: 'private' }), {})
})
test('Analytics skips local development and respects browser privacy preferences', () => {
  assert.equal(analyticsAllowed(false, {}), false)
  assert.equal(analyticsAllowed(true, {}), true)
  for (const privacy of [{ doNotTrack: '1' }, { doNotTrack: 'yes' }, { globalPrivacyControl: true }]) assert.equal(analyticsAllowed(true, privacy), false)
})
test('Lazy Analytics initializes once, preserves event order and deduplicates route renders', async () => {
  let loads = 0, resolve
  const collected = [], tracker = createAnalyticsTracker(() => {
    loads++
    return new Promise(r => { resolve = r })
  })
  tracker.page('/?code=secret')
  tracker.page('/')
  tracker.event('login', { method: 'google' })
  tracker.page('/campus?location=hostel')
  await Promise.resolve()
  assert.equal(loads, 1)
  resolve({ page: path => collected.push(path), event: (name, params) => collected.push({ name, params }) })
  await new Promise(r => setImmediate(r))
  assert.deepEqual(collected, ['/', { name: 'login', params: { method: 'google' } }, '/campus'])
  tracker.page('/')
  await new Promise(r => setImmediate(r))
  assert.equal(collected.at(-1), '/')
})
test('Unsupported and blocked Analytics never reject into gameplay', async () => {
  for (const load of [() => Promise.reject(new Error('blocked')), () => { throw new Error('storage denied') }, async () => null, async () => ({ page() { throw new Error('blocked') }, event() { throw new Error('blocked') } })]) {
    const tracker = createAnalyticsTracker(load)
    assert.doesNotThrow(() => { tracker.page('/campus'); tracker.event('campus_enter') })
    await new Promise(r => setImmediate(r))
  }
})
