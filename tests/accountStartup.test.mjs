import { test } from 'node:test'
import assert from 'node:assert/strict'
import { withRequestDeadline, requestCampusJSON, loadCampusAccess, CampusRequestError } from '../src/lib/accountRequest.ts'
import { observeAuthStartup } from '../src/lib/authStartup.ts'

const account = { id: 'student', name: 'Student', status: 'active', role: 'member', avatarStyle: 'boy' }
const timing = { total: 1000, attempt: 100, delays: [1, 1, 1] }
const url = new URL('https://campus.example/api/access')

test('a cold host can time out or return HTML and then restore the same verified account', async () => {
  let requests = 0, retries = 0
  const result = await loadCampusAccess('student', async () => {
    requests++
    if (requests === 1) throw new DOMException('Cold start', 'TimeoutError')
    return requestCampusJSON(url, {}, async () => 'test-token', async () => requests === 2
      ? new Response('<html>Waking service</html>', { status: 503 })
      : Response.json(account))
  }, new AbortController().signal, () => retries++, timing)
  assert.deepEqual(result, account)
  assert.equal(requests, 3)
  assert.equal(retries, 2)
})

test('denied accounts are not retried or admitted using cached/browser identity', async () => {
  for (const status of [401, 403]) {
    let calls = 0
    await assert.rejects(loadCampusAccess('student', async () => {
      calls++
      throw new CampusRequestError('Access denied', status, false)
    }, new AbortController().signal, () => assert.fail('Denial must not retry'), timing), /Access denied/)
    assert.equal(calls, 1)
  }
  for (const invalid of [{ ...account, id: 'other' }, { ...account, status: 'banned' }, { ...account, role: 'owner' }, { ...account, avatarStyle: 'invalid' }, null]) {
    await assert.rejects(loadCampusAccess('student', async () => invalid, new AbortController().signal,
      () => assert.fail('Invalid identity must not retry'), timing), /could not be verified/)
  }
})

test('failed admission has a finite retry count instead of an endless loading spinner', async () => {
  let calls = 0
  await assert.rejects(loadCampusAccess('student', async () => {
    calls++
    throw new TypeError('Network unavailable')
  }, new AbortController().signal, () => {}, timing), /Network unavailable/)
  assert.equal(calls, 4)
})

test('cancelling on account change/unmount stops the pending check and prevents retries', async () => {
  const controller = new AbortController()
  let calls = 0, attemptSignal
  const result = loadCampusAccess('student', async signal => {
    calls++; attemptSignal = signal
    return new Promise(() => {})
  }, controller.signal, () => assert.fail('Cancelled request must not retry'), timing)
  controller.abort(new DOMException('Account changed', 'AbortError'))
  await assert.rejects(result, { name: 'AbortError' })
  assert.equal(calls, 1)
  assert.equal(attemptSignal.aborted, true)
})

test('request deadline covers stalled Firebase token acquisition and sends no late bearer token', async () => {
  let resolveToken, fetches = 0
  const token = new Promise(resolve => { resolveToken = resolve })
  const controller = new AbortController()
  const request = requestCampusJSON(url, { signal: controller.signal }, () => token, async () => {
    fetches++; return Response.json(account)
  })
  controller.abort(new DOMException('Cancelled', 'AbortError'))
  await assert.rejects(request, { name: 'AbortError' })
  resolveToken('late-test-token')
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(fetches, 0)
})

test('request cancellation also bounds a stalled response body and retains bearer headers', async () => {
  const controller = new AbortController()
  let observed
  const result = requestCampusJSON(url, { signal: controller.signal }, async () => 'test-token', async (_url, options) => {
    observed = options
    return { ok: true, status: 200, json: () => new Promise(() => {}) }
  })
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(observed.headers.get('Authorization'), 'Bearer test-token')
  controller.abort(new DOMException('Cancelled', 'AbortError'))
  await assert.rejects(result, { name: 'AbortError' })
  assert.equal(observed.signal.aborted, true)
})

test('a provider that ignores cancellation still hits the overall deadline', async () => {
  await assert.rejects(withRequestDeadline(() => new Promise(() => {}), 10), { name: 'TimeoutError' })
  await assert.rejects(loadCampusAccess('student', () => new Promise(() => {}), new AbortController().signal,
    () => {}, { total: 10, attempt: 1000, delays: [1] }), { name: 'TimeoutError' })
})

test('auth restoration timeout settles the UI but permits a late verified session to recover', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  let accept, errors = 0, cleaned = false
  const users = []
  const stop = observeAuthStartup(next => { accept = next; return () => { cleaned = true } }, user => users.push(user), () => errors++)
  t.mock.timers.tick(12000)
  assert.equal(errors, 1)
  accept({ uid: 'restored' })
  assert.deepEqual(users, [{ uid: 'restored' }])
  stop()
  accept({ uid: 'obsolete' })
  assert.equal(users.length, 1)
  assert.equal(cleaned, true)
})

test('a successful or disposed auth subscription clears its startup watchdog', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  let accept, errors = 0
  const stop = observeAuthStartup(next => { accept = next; return () => {} }, () => {}, () => errors++)
  accept(null)
  t.mock.timers.tick(20000)
  assert.equal(errors, 0)
  stop()
  const dispose = observeAuthStartup(() => () => {}, () => assert.fail(), () => errors++)
  dispose()
  t.mock.timers.tick(20000)
  assert.equal(errors, 0)
})
