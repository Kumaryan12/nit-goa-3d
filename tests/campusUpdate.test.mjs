import test from 'node:test'
import assert from 'node:assert/strict'
import { campusUpdates } from '../src/data/campusUpdate.ts'
import { acknowledgeCampusUpdate, unreadCampusUpdates, campusUpdateStorageKey } from '../src/lib/campusUpdate.ts'

test('acknowledging the feed hides existing updates but a new entry stays unread', () => {
  let saved = null
  const storage = { getItem: key => { assert.equal(key, campusUpdateStorageKey); return saved }, setItem: (key, value) => { assert.equal(key, campusUpdateStorageKey); saved = value } }
  assert.ok(unreadCampusUpdates(storage).length > 1)
  acknowledgeCampusUpdate(storage)
  assert.deepEqual(unreadCampusUpdates(storage), [])
  // Represents a visitor who read the earlier feed before its newest entry.
  saved = JSON.stringify(campusUpdates.slice(1).map(update => update.id))
  assert.deepEqual(unreadCampusUpdates(storage).map(update => update.id), [campusUpdates[0].id])
})

test('legacy notices, corrupt preferences and blocked storage cannot break campus updates', () => {
  for (const value of ['2026-10-12-nescafe', '{', '{}', 'null']) {
    assert.equal(unreadCampusUpdates({ getItem: () => value }).length, campusUpdates.length)
  }
  const storage = { getItem: () => { throw Error('Blocked') }, setItem: () => { throw Error('Blocked') } }
  assert.equal(unreadCampusUpdates(storage).length, campusUpdates.length)
  assert.doesNotThrow(() => acknowledgeCampusUpdate(storage))
  assert.equal(unreadCampusUpdates({ getItem: () => JSON.stringify([campusUpdates[0].id, null, 42, { id: campusUpdates[1].id }]) }).length, campusUpdates.length - 1)
})

test('published updates have unique IDs and supported exploration shortcuts', () => {
  const ids = new Set(), destinations = new Set(['nescafe', 'football', 'oat', 'hostel', 'entrance', 'seminar'])
  for (const update of campusUpdates) {
    assert.ok(update.id && update.title && update.detail)
    assert.ok(!ids.has(update.id)); ids.add(update.id)
    assert.ok(['Added', 'Improved', 'Fixed'].includes(update.kind))
    if (update.destination) { assert.ok(destinations.has(update.destination)); assert.ok(update.action) }
  }
})
