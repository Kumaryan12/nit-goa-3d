import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Secret, TOTP } from 'otpauth'
import { fakeFirestore } from './firestoreFake.mjs'
import { createProfileStore } from '../server/profileStore.ts'
import {
  createModeratorService,
  createModerationStore,
  moderatorKey,
} from '../server/moderation.ts'
import { firebaseProject, firebaseAdmin } from '../server/firebaseAdmin.ts'
const now = Date.now(),
  identity = {
    id: 'studentUID',
    name: 'Me',
    role: 'member',
    expiresAt: now + 3600000,
    authTime: now,
  }
const profile = {
  id: identity.id,
  display_name: 'Student',
  handle: null,
  bio: '',
  course: '',
  interests: [],
  avatar_color: 'forest',
  is_public: false,
  created_at: new Date(now).toISOString(),
}
const make = () =>
  fakeFirestore({
    'profiles/studentUID': profile,
    'campusMembers/studentUID': { role: 'member', status: 'active' },
  })
test('moderator keys load from runtime files and inaccessible files fail without exposing their path', () => {
  const dir = mkdtempSync(join(tmpdir(), 'campus-key-'))
  try {
    const path = join(dir, 'moderator-secret.key'), key = randomBytes(32).toString('base64')
    writeFileSync(path, key + '\n', { mode: 0o600 })
    assert.equal(moderatorKey({ MODERATOR_SECRET_KEY_FILE: path }), key)
    assert.equal(moderatorKey({ MODERATOR_SECRET_KEY: key, MODERATOR_SECRET_KEY_FILE: 'missing' }), key)
    assert.throws(() => moderatorKey({ MODERATOR_SECRET_KEY_FILE: join(dir, 'missing') }), /^Error: Moderator verification is not configured\.$/)
    const { db } = make()
    assert.throws(() => createModeratorService(db, 'invalid'), /not configured/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
test('profiles are private by default; publish, change handle and unpublish remove old public records', async () => {
  const { db, data } = make(),
    store = createProfileStore(db)
  assert.equal(await store.publicProfile('student'), null)
  const input = {
    ...profile,
    handle: 'student',
    is_public: true,
    email: 'private@example.com',
    role: 'admin',
    id: 'someoneElse',
  }
  const result = await store.save(identity, input)
  assert.equal(result.id, identity.id)
  assert.equal(result.role, undefined)
  assert.equal(result.email, undefined)
  assert.equal(data.get('campusMembers/studentUID').role, 'member')
  assert.equal((await store.publicProfile('student')).display_name, 'Student')
  await store.save(identity, {
    ...profile,
    handle: 'new_handle',
    is_public: true,
  })
  assert.equal(data.has('profileHandles/student'), false)
  assert.equal(await store.publicProfile('student'), null)
  assert.equal((await store.publicProfile('new_handle')).id, identity.id)
  await store.save(identity, {
    ...profile,
    handle: 'new_handle',
    is_public: false,
  })
  assert.equal(await store.publicProfile('new_handle'), null)
  assert.equal(data.get('profileHandles/new_handle').userId, identity.id)
})
test('handles cannot be claimed by another account and banned accounts cannot change profiles', async () => {
  const { db, data } = make(),
    store = createProfileStore(db)
  data.set('profileHandles/taken', { userId: 'other' })
  await assert.rejects(
    () => store.save(identity, { ...profile, handle: 'taken' }),
    /taken/,
  )
  assert.equal(data.get('profiles/studentUID').handle, null)
  await assert.rejects(
    () => store.save(identity, { ...profile, handle: 'admin' }),
    /personal handle/,
  )
  await assert.rejects(
    () => store.save(identity, { ...profile, bio: 'x'.repeat(281) }),
    /too long/,
  )
  data.set('campusMembers/studentUID', { role: 'member', status: 'banned' })
  await assert.rejects(() => store.save(identity, profile), /unavailable/)
})
test('moderation rechecks the exclusive owner policy and records bans atomically', async () => {
  const { db, data } = make(),
    moderate = createModerationStore(db),
    host = { ...identity, id: 'host', role: 'admin' }
  data.set('campusMembers/host', { role: 'admin', status: 'active' })
  data.set('campusSettings/access', { ownerUid: 'host', ownerEmail: 'host@example.com' })
  data.set('profiles/studentUID', {
    ...profile,
    handle: 'student',
    is_public: true,
  })
  data.set('publicProfiles/student', {
    ...profile,
    handle: 'student',
    is_public: true,
  })
  const body = { target: 'studentUID', action: 'ban', reason: 'Review spam' }
  await moderate(host, body)
  assert.equal(data.get('campusMembers/studentUID').status, 'banned')
  assert.equal(data.has('publicProfiles/student'), false)
  assert.equal(
    [...data.keys()].filter((k) => k.startsWith('moderationLog/')).length,
    1,
  )
  await moderate(host, { ...body, action: 'unban' })
  assert.equal(data.get('campusMembers/studentUID').status, 'active')
  assert.equal(data.get('publicProfiles/student').id, identity.id)
  await assert.rejects(
    () => moderate(host, { ...body, target: 'host' }),
    /own account/,
  )
  data.set('campusSettings/access', { ownerUid: 'anotherOwner', ownerEmail: 'other@example.com' })
  await assert.rejects(() => moderate(host, body), /permissions/)
  data.set('campusSettings/access', { ownerUid: 'host', ownerEmail: 'host@example.com' })
  data.set('campusMembers/otherAdmin', { role: 'admin', status: 'active' })
  await assert.rejects(() => moderate({ ...host, id: 'otherAdmin' }, body), /permissions/)
  data.set('campusMembers/host', { role: 'member', status: 'active' })
  await assert.rejects(() => moderate(host, body), /permissions/)
  assert.equal(
    [...data.keys()].filter((k) => k.startsWith('moderationLog/')).length,
    2,
  )
  await assert.rejects(
    () => moderate(host, { ...body, target: '../host' }),
    /valid account/,
  )
})
test('moderator verification encrypts secrets, rejects code reuse and binds tickets to identity and Google session', async () => {
  let clock = now
  const { db, data } = make(),
    host = { ...identity, id: 'host', role: 'admin' },
    service = createModeratorService(
      db,
      randomBytes(32).toString('base64'),
      () => clock,
    )
  await assert.rejects(() => service.enroll(identity), /Moderator access/)
  await assert.rejects(() => service.enroll({ ...host, role: 'moderator' }), /Moderator access/)
  await assert.rejects(
    () => service.enroll({ ...host, authTime: clock - 300001 }),
    /Confirm your Google/,
  )
  const setup = await service.enroll(host)
  assert.match(setup.qr, /^data:image\/png;base64,/)
  assert.notEqual(data.get('moderatorFactors/host').secret, setup.secret)
  const otp = new TOTP({
      secret: Secret.fromBase32(setup.secret),
      digits: 6,
      period: 30,
    }),
    code = otp.generate({ timestamp: clock }),
    result = await service.verify(host, code)
  assert.equal(await service.enrolled(host), true)
  service.authorize(host, result.token)
  assert.throws(
    () => service.authorize({ ...host, id: 'other' }, result.token),
    /expired/,
  )
  assert.throws(
    () => service.authorize({ ...host, authTime: clock + 1 }, result.token),
    /expired/,
  )
  assert.throws(
    () => service.authorize(host, result.token + 'tampered'),
    /authenticator/,
  )
  await assert.rejects(() => service.verify(host, code), /already used/)
  await assert.rejects(() => service.enroll(host), /already enrolled/)
  clock += 600001
  assert.throws(() => service.authorize(host, result.token), /expired/)
})
test('invalid authenticator attempts persist a lockout and pending enrollment expires', async () => {
  let clock = now
  const { db, data } = make(),
    host = { ...identity, id: 'host', role: 'admin' },
    service = createModeratorService(
      db,
      randomBytes(32).toString('base64'),
      () => clock,
    )
  const setup = await service.enroll(host),
    otp = new TOTP({ secret: Secret.fromBase32(setup.secret) }),
    code = otp.generate({ timestamp: clock }),
    wrong = code === '000000' ? '111111' : '000000'
  for (let i = 0; i < 5; i++)
    await assert.rejects(() => service.verify(host, wrong), /invalid/)
  assert.ok(data.get('moderatorFactors/host').lockedUntil > clock)
  await assert.rejects(() => service.verify(host, code), /Too many/)
  clock += 900001
  await assert.rejects(
    () => service.verify({ ...host, authTime: clock }, code),
    /Start authenticator/,
  )
})
test('production refuses emulators and malformed or mismatched project credentials', () => {
  assert.equal(firebaseProject({ FIREBASE_PROJECT_ID: 'https://other' }), null)
  assert.throws(
    () =>
      firebaseAdmin({
        NODE_ENV: 'production',
        FIREBASE_PROJECT_ID: 'nitg-explored-2026',
        FIRESTORE_EMULATOR_HOST: 'localhost:8080',
      }),
    /emulators/,
  )
  assert.throws(
    () =>
      firebaseAdmin({
        FIREBASE_PROJECT_ID: 'nitg-explored-2026',
        FIREBASE_SERVICE_ACCOUNT: JSON.stringify({
          project_id: 'wrong-project',
        }),
      }),
    /not valid/,
  )
})
