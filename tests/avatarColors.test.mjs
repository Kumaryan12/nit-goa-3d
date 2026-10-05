import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PROFILE_COLORS, PROFILE_COLOR_HEX, defaultAvatarColor, allocateAvatarColor, avatarTextColor, profileColorStyle, profileError } from '../src/lib/profile.ts'
import { CAMPUS_CAPACITY, CAMPUS_COLORS, parseCampusSnapshot } from '../src/lib/campusProtocol.ts'
import { createCampusRoom } from '../server/campusRoom.ts'
import { createAccessVerifier } from '../server/access.ts'
import { createProfileStore } from '../server/profileStore.ts'
import { fakeFirestore } from './firestoreFake.mjs'

const boundary = [{ x: -200, z: -200 }, { x: 200, z: -200 }, { x: 200, z: 200 }, { x: -200, z: 200 }, { x: -200, z: -200 }]
const identity = (id, avatarColor = 'forest') => ({ id, avatarColor, name: id, role: 'member', expiresAt: Date.now() + 60000 })
const person = (room, id) => room.snapshot().people.find(p => p.id === id)
const luminance = hex => {
  const values = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(c => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4)
  return values[0] * .2126 + values[1] * .7152 + values[2] * .0722
}

test('the palette covers a full crowd with distinct, validated colours and readable initials', () => {
  assert.ok(PROFILE_COLORS.length >= CAMPUS_CAPACITY)
  assert.equal(new Set(Object.values(PROFILE_COLOR_HEX)).size, PROFILE_COLORS.length)
  for (const color of PROFILE_COLORS) {
    assert.match(PROFILE_COLOR_HEX[color], /^#[0-9a-f]{6}$/i)
    assert.equal(CAMPUS_COLORS[color], PROFILE_COLOR_HEX[color])
    assert.equal(profileError({ display_name: 'Student', avatar_color: color }), null)
    assert.equal(profileColorStyle(color)['--profile-color'], PROFILE_COLOR_HEX[color])
    const a = luminance(PROFILE_COLOR_HEX[color]), b = luminance(avatarTextColor(color))
    assert.ok((Math.max(a, b) + .05) / (Math.min(a, b) + .05) >= 4.5, `${color} initials remain readable`)
  }
  for (const color of ['', 'invalid', '__proto__', 'constructor', '#ffffff']) assert.match(profileError({ display_name: 'Student', avatar_color: color }), /available profile color/)
})
test('automatic colour defaults are deterministic and vary across accounts', () => {
  const colors = new Set()
  for (let i = 0; i < 128; i++) {
    const id = 'student_' + i, color = defaultAvatarColor(id)
    assert.ok(PROFILE_COLORS.includes(color)); assert.equal(color, defaultAvatarColor(id))
    colors.add(color)
  }
  assert.ok(colors.size > 20)
  assert.notEqual(defaultAvatarColor('alice'), defaultAvatarColor('bob'))
})
test('all 32 live visitors receive unique colours even with identical saved preferences', () => {
  const room = createCampusRoom(boundary)
  for (let i = 0; i < CAMPUS_CAPACITY; i++) assert.ok(room.add(identity('student_' + i)))
  const snapshot = room.snapshot()
  assert.equal(new Set(snapshot.people.map(p => p.color)).size, CAMPUS_CAPACITY)
  assert.ok(parseCampusSnapshot(snapshot))
  assert.equal(room.add(identity('overflow')), null)
  const released = person(room, 'student_7').color
  room.remove('student_7'); assert.equal(room.add(identity('next_student', released)).color, released)
  assert.equal(new Set(room.snapshot().people.map(p => p.color)).size, CAMPUS_CAPACITY)
})
test('auth refreshes keep assigned colours and profile edits use an available preferred colour', () => {
  const room = createCampusRoom(boundary)
  room.add(identity('alice')); room.add(identity('bob'))
  const bob = person(room, 'bob').color
  assert.notEqual(bob, 'forest')
  room.remove('alice')
  for (let i = 0; i < 20; i++) room.updateIdentity({ ...identity('bob'), name: 'New name', publicHandle: 'bob' })
  assert.equal(person(room, 'bob').color, bob)
  assert.equal(person(room, 'bob').name, 'New name')
  room.updateIdentity(identity('bob', 'coral')); assert.equal(person(room, 'bob').color, 'coral')
  room.add(identity('carol', 'ocean'))
  room.updateIdentity(identity('bob', 'ocean')); assert.notEqual(person(room, 'bob').color, 'ocean')
  room.updateIdentity(identity('bob', 'ocean')); const stable = person(room, 'bob').color
  room.remove('carol'); room.updateIdentity(identity('bob', 'ocean')); assert.equal(person(room, 'bob').color, stable)
  room.remove('bob'); assert.equal(room.add(identity('bob', 'ocean')).color, 'ocean')
})
test('invalid preferences and pose-supplied colours cannot bypass server allocation', () => {
  const room = createCampusRoom(boundary)
  room.add(identity('alice', '__proto__')); room.add(identity('bob', 'not-a-color'))
  const before = person(room, 'alice').color
  assert.ok(PROFILE_COLORS.includes(before)); assert.notEqual(before, person(room, 'bob').color)
  assert.ok(room.pose('alice', { x: 0, y: 0, z: 0, yaw: 0, epoch: 1, moving: false, running: false, active: true, visible: true, space: 'outdoors', color: person(room, 'bob').color }, 'walk', 1000))
  assert.equal(person(room, 'alice').color, before)
  assert.throws(() => allocateAvatarColor('alice', 'forest', PROFILE_COLORS), /palette is full/)
})
test('first Google sign-in saves a stable private colour and existing choices survive later sign-ins', async () => {
  const { db, data } = fakeFirestore(); let uid = 'alice'
  const verify = createAccessVerifier({ db, auth: {
    verifyIdToken: async () => ({ uid, exp: Math.floor(Date.now() / 1000) + 60, auth_time: 1, firebase: { sign_in_provider: 'google.com' } }),
    getUser: async () => ({ uid, email: uid + '@example.com', emailVerified: true, displayName: uid }),
  } })
  const token = 'google-token-test-fixture-only'
  const first = await verify(token)
  assert.equal(first.avatarColor, defaultAvatarColor(uid)); assert.equal(data.get('profiles/alice').avatar_color, first.avatarColor)
  assert.equal(data.get('profiles/alice').is_public, false)
  assert.equal((await verify(token)).avatarColor, first.avatarColor)
  uid = 'bob'; const second = await verify(token); assert.notEqual(first.avatarColor, second.avatarColor)
  uid = 'alice'
  const saved = await createProfileStore(db).save(first, { ...data.get('profiles/alice'), avatar_color: 'sunflower' })
  assert.equal(saved.avatar_color, 'sunflower'); assert.equal((await verify(token)).avatarColor, 'sunflower')
  assert.equal(data.get('campusMembers/alice').role, 'member')
  assert.equal(data.has('publicProfiles/alice'), false)
})
