import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createCampusRoom } from '../server/campusRoom.ts'
import { createCafeVoice } from '../server/cafeVoice.ts'
import { publishedCampusPose } from '../src/lib/campusProtocol.ts'

test('permission-prompt blur and microphone roster changes preserve all four table sessions and timers', async t => {
  let now = 1000
  const boundary = [{ x: -100, z: -100 }, { x: 100, z: -100 }, { x: 100, z: 100 }, { x: -100, z: 100 }]
  const chairs = [0, 1, 2, 3].map(i => ({ id: `cafe-0-${i}`, x: 10 + i * 2, y: 0, z: 10, yaw: 0, row: 0, seatHeight: .44 }))
  const room = createCampusRoom(boundary, chairs), ids = ['alice', 'bob', 'cara', 'dan'], packets = []
  const voice = createCafeVoice(id => room.cafeTable(id, now), (id, packet) => packets.push({ id, ...packet }), {}, () => now)
  t.after(() => voice.close())
  for (const [i, id] of ids.entries()) {
    room.add({ id, name: id, role: 'member', expiresAt: Date.now() + 3600000 })
    room.pose(id, { ...chairs[i], epoch: 1, active: true, visible: true, moving: false, running: false, vehicle: 'walk', space: 'outdoors' }, 'walk', now)
    assert.deepEqual(room.social(id, 'sit', chairs[i].id, now), { ok: true })
    voice.handle(id, { type: 'cafe-voice-join', mic: false })
  }
  await new Promise(resolve => setImmediate(resolve))
  const latest = id => packets.findLast(p => p.id === id && p.type === 'cafe-voice-state')
  const original = new Map(ids.map(id => [id, latest(id)]))
  for (const speaker of ids) {
    now += 100
    for (const id of ids) room.pose(id, publishedCampusPose(room.poseFor(id), true, 'walk', id !== speaker,
      { seated: true, pageVisible: true }), 'walk', now)
    voice.reconcile()
    voice.handle(speaker, { type: 'cafe-voice-mic', sessionId: original.get(speaker).sessionId, mic: true })
    for (const id of ids) {
      assert.equal(latest(id).sessionId, original.get(id).sessionId)
      assert.equal(latest(id).members.length, 4)
      assert.equal(latest(id).timing.expiresAt, original.get(id).timing.expiresAt)
      assert.equal(latest(id).timing.cooldownUntil, original.get(id).timing.cooldownUntil)
      assert.equal(room.snapshot(now).people.find(p => p.id === id).social.action, 'sit')
    }
  }
  now += 100
  room.pose('alice', publishedCampusPose(room.poseFor('alice'), true, 'walk', false,
    { seated: true, pageVisible: false }), 'walk', now)
  voice.reconcile()
  assert.equal(latest('alice').sessionId, null)
  for (const id of ids.slice(1)) {
    assert.equal(latest(id).sessionId, original.get(id).sessionId)
    assert.equal(latest(id).members.length, 3)
    assert.equal(latest(id).timing.expiresAt, original.get(id).timing.expiresAt)
  }
})

test('seated blur exemption never activates hidden, paused, overview or non-walking poses', () => {
  const pose = { x: 10, y: 0, z: 10, yaw: 0, epoch: 1, active: true, visible: true, moving: true, running: true, space: 'outdoors' }
  const seated = publishedCampusPose(pose, true, 'walk', false, { seated: true, pageVisible: true })
  assert.equal(seated.active, true); assert.equal(seated.moving, false); assert.equal(seated.running, false)
  for (const [current, walking, activity, options] of [
    [pose, true, 'walk', { seated: true, pageVisible: false }],
    [{ ...pose, active: false }, true, 'walk', { seated: true, pageVisible: true }],
    [pose, false, 'overview', { seated: true, pageVisible: true }],
    [pose, true, 'football', { seated: true, pageVisible: true }],
    [pose, true, 'walk', { seated: false, pageVisible: true }],
  ]) assert.equal(publishedCampusPose(current, walking, activity, false, options).active, false)
})
