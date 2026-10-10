import { test } from 'node:test'
import assert from 'node:assert/strict'
import { locatePeople, personLocation, readFinderPreference } from '../src/lib/peopleFinder.ts'
import { campusSnapshotForViewer } from '../server/campusLocator.ts'
import { parseCampusSnapshot, buggySeatPose } from '../src/lib/campusProtocol.ts'
import { RemoteMotionBuffer } from '../src/lib/remoteMotion.ts'
const pose = (extra = {}) => ({ x: 0, y: 0, z: 0, yaw: 0, moving: false, running: false, active: true, visible: true, space: 'outdoors', epoch: 1, ...extra })
const person = (id, extra = {}) => ({ id, name: id, handle: null, color: 'forest', activity: 'walk', pose: pose(), ...extra })
const state = people => ({ type: 'campus-state', sequence: 1, serverTime: 1000, people })
const landmarks = [{ id: 'oat', name: 'Open Air Theatre', coordinates: { x: 40, z: -30 } }]
const find = (snapshot, own = pose(), muted = new Set(), now = 1000) => locatePeople(snapshot, 'me', own, landmarks, muted, now)

test('finder is on by default and uses current poses, closest first, with landmark and floor labels', () => {
  for (const stored of [null, 'on', '', 'invalid']) assert.equal(readFinderPreference(stored), true)
  assert.equal(readFinderPreference('off'), false)
  const snapshot = state([person('me'), person('far', { pose: pose({ x: 200 }) }), person('near', { pose: pose({ x: 40, z: -30 }) }), person('floor', { pose: pose({ x: 5, space: 'hostel:2', y: 6.4 }) })])
  const people = find(snapshot)
  assert.deepEqual(people.map(p => p.person.id), ['floor', 'near', 'far'])
  assert.equal(people[0].sameSpace, false); assert.equal(people[0].location, 'Boys Hostel · Floor 2')
  assert.equal(people[1].distance, 50); assert.equal(people[1].location, 'Near Open Air Theatre')
  assert.equal(people[2].location, 'Around campus')
  assert.equal(personLocation(pose({ space: 'gyan:0' }), []), 'Gyan Mandir · Ground floor')
  snapshot.people[2].pose.x = 10
  assert.ok(find(snapshot).find(p => p.person.id === 'near').distance < 50, 'motion comes from the latest snapshot')
})
test('direction matches avatar forward and turning, including wrapped yaw', () => {
  const angle = (x, z, yaw = 0) => find(state([person('friend', { pose: pose({ x, z }) })]), pose({ yaw }))[0].bearing
  assert.equal(angle(0, -10), 0)
  assert.equal(angle(10, 0), Math.PI / 2)
  assert.equal(angle(-10, 0), -Math.PI / 2)
  assert.ok(Math.abs(angle(-10, 0, Math.PI / 2)) < 1e-10)
  assert.ok(Math.abs(angle(10, 0, -Math.PI / 2 + Math.PI * 2)) < 1e-10)
})
test('hidden, muted, inactive and departed visitors leave the finder immediately, and stale connections clear it', () => {
  const snapshot = state([person('me'), person('muted'), person('hidden', { locatorVisible: false }), person('inactive', { pose: pose({ active: false }) }), person('map', { pose: pose({ visible: false }) }), person('not-spawned', { pose: null }), person('friend')])
  assert.deepEqual(find(snapshot, pose(), new Set(['muted'])).map(p => p.person.id), ['friend'])
  snapshot.people = snapshot.people.filter(p => p.id !== 'friend')
  assert.deepEqual(find(snapshot, pose(), new Set(['muted'])), [])
  assert.deepEqual(find(state([person('friend')]), pose(), new Set(), 3501), [])
  assert.deepEqual(find(state([person('friend')]), pose({ visible: false })), [])
  assert.deepEqual(find(null), [])
})
test('hidden finder locations are withheld from distant, overview and other-floor viewers but preserve nearby avatars', () => {
  const snapshot = state([person('me'), person('private', { locatorVisible: false, pose: pose({ x: 161 }) }), person('public', { pose: pose({ x: 180 }) })])
  let privateView = campusSnapshotForViewer(snapshot, 'me')
  assert.equal(privateView.people[1].pose, null); assert.equal(privateView.people[2].pose.x, 180)
  assert.ok(parseCampusSnapshot(privateView)); assert.equal(snapshot.people[1].pose.x, 161, 'filter never mutates shared physics state')
  snapshot.people[1].pose.x = 160
  assert.ok(campusSnapshotForViewer(snapshot, 'me').people[1].pose)
  assert.equal(find(campusSnapshotForViewer(snapshot, 'me')).some(p => p.person.id === 'private'), false)
  snapshot.people[1].pose.space = 'hostel:1'
  assert.equal(campusSnapshotForViewer(snapshot, 'me').people[1].pose, null)
  assert.ok(campusSnapshotForViewer(snapshot, 'private').people[1].pose, 'own poses remain authoritative')
  snapshot.people[0].pose.visible = false
  snapshot.people[1].pose.space = 'outdoors'
  assert.equal(campusSnapshotForViewer(snapshot, 'me').people[1].pose, null)
  const publicState = state([person('me'), person('friend')])
  assert.equal(campusSnapshotForViewer(publicState, 'me'), publicState, 'default sharing keeps the common broadcast fast path')
})
test('privacy filtering removes attached state safely and clears previous interpolation samples', () => {
  const driver = pose({ x: 180, vehicle: 'buggy' })
  const snapshot = state([person('me'), person('driver', { locatorVisible: false, pose: driver }), person('passenger', { pose: buggySeatPose(driver, 1, 1), ride: { driverId: 'driver', seat: 1 } })])
  const filtered = campusSnapshotForViewer(snapshot, 'me')
  assert.ok(parseCampusSnapshot(filtered)); assert.equal(filtered.people[2].ride, undefined)
  snapshot.people[2].locatorVisible = false
  const bothHidden = campusSnapshotForViewer(snapshot, 'me')
  assert.equal(bothHidden.people[2].pose, null); assert.ok(parseCampusSnapshot(bothHidden))
  const buffer = new RemoteMotionBuffer()
  buffer.push(snapshot, 1000); assert.ok(buffer.sample('driver', 1000))
  buffer.push({ ...bothHidden, sequence: 2, serverTime: 1100 }, 1100)
  assert.equal(buffer.sample('driver', 1100), null)
  assert.equal(parseCampusSnapshot({ ...snapshot, people: [person('friend', { locatorVisible: 'false' })] }), null)
})
