import test from 'node:test'
import assert from 'node:assert/strict'
import { CAMPUS_REOPENS_AT, campusUnderConstruction, reopeningCountdown } from '../src/lib/maintenance.ts'

test('maintenance ends at midnight on 1 November in India across visitor timezones', () => {
  assert.equal(new Date(CAMPUS_REOPENS_AT).toISOString(), '2026-10-31T18:30:00.000Z')
  assert.equal(campusUnderConstruction(CAMPUS_REOPENS_AT - 1), true)
  assert.equal(campusUnderConstruction(CAMPUS_REOPENS_AT), false)
  assert.equal(campusUnderConstruction(Date.parse('2026-11-02T00:00:00Z')), false)
  assert.deepEqual(reopeningCountdown(CAMPUS_REOPENS_AT - (2 * 86400 + 3 * 3600 + 4 * 60) * 1000), [2, 3, 4])
  assert.deepEqual(reopeningCountdown(CAMPUS_REOPENS_AT + 1000), [0, 0, 0])
})
