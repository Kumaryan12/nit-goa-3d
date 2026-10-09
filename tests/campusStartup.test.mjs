import test from 'node:test'
import assert from 'node:assert/strict'
import { campusStartup } from '../src/lib/campusStartup.ts'
const ready = { buildings: 'ready', roads: 'ready', terrain: true, vegetation: true, frame: true, boundary: true, unavailable: false }
test('campus intro waits for map, scenery and rendered frames instead of elapsed time', () => {
  for (const patch of [{ buildings: 'loading' }, { roads: 'loading' }, { terrain: false }, { vegetation: false }, { frame: false }, { boundary: false }, { unavailable: true }]) assert.equal(campusStartup({ ...ready, ...patch }).complete, false)
  assert.equal(campusStartup(ready).complete, true)
  assert.equal(campusStartup({ ...ready, frame: false }).phase, 'frame')
  assert.deepEqual(campusStartup({ ...ready, vegetation: false, frame: false }).stages, [true, true, false, false])
})
test('failed map requests preserve recovery and allow partial exploration only after a usable render', () => {
  for (const patch of [{ buildings: 'error' }, { roads: 'error' }]) {
    const state = { ...ready, ...patch }
    assert.equal(campusStartup(state).complete, false)
    assert.equal(campusStartup(state).canExplore, true)
    assert.equal(campusStartup(state).phase, 'error')
    for (const blocked of [{ frame: false }, { boundary: false }, { unavailable: true }]) assert.equal(campusStartup({ ...state, ...blocked }).canExplore, false)
  }
  assert.equal(campusStartup({ ...ready, unavailable: true }).phase, 'unavailable')
  assert.equal(campusStartup({ ...ready, boundary: false }).phase, 'error')
})
