import assert from 'node:assert/strict'
import { test } from 'node:test'
import { campusLocations } from '../src/data/campus.ts'
import { normalizeSearch, searchCampus } from '../src/lib/search.ts'
const ids = (query, locations = campusLocations) => searchCampus(query, locations).map((result) => result.location.id)

test('campus search matches names, keywords and facilities across all seven landmarks', () => {
  assert.deepEqual(ids('hostel'), ['boys-hostel', 'girls-hostel'])
  assert.deepEqual(ids('MESS'), ['boys-hostel', 'girls-hostel'])
  assert.deepEqual(ids('academic'), ['academic-block'])
  assert.deepEqual(ids('admin'), ['administration-block'])
  assert.deepEqual(ids('canteen'), ['canteen'])
  assert.deepEqual(ids('sports'), ['sports-ground'])
  assert.deepEqual(ids('main entrance'), ['main-entrance'])
  assert.ok(ids('classrooms').includes('academic-block'))
  assert.deepEqual(ids('boys rooms'), ['boys-hostel'], 'all query tokens must match')
})

test('search ranks exact names, prefixes, name matches, then keywords with deterministic ties', () => {
  const seed = campusLocations[0]
  const locations = [
    { ...seed, id: 'keyword', name: 'Library', keywords: ['sports'] },
    { ...seed, id: 'contains', name: 'Indoor Sports Hall', keywords: [] },
    { ...seed, id: 'prefix', name: 'Sports Ground', keywords: [] },
    { ...seed, id: 'exact', name: 'Sports', keywords: [] },
  ]
  assert.deepEqual(ids('sports', locations), ['exact', 'prefix', 'contains', 'keyword'])
  assert.deepEqual(ids('hostel', [...campusLocations].reverse()), ids('hostel'))
  assert.equal(searchCampus('hostel')[0].location, campusLocations.find((item) => item.id === 'boys-hostel'))
})

test('search normalizes accents, case and punctuation, limits results and handles empty/no matches', () => {
  assert.equal(normalizeSearch('  ÁCADEMIC—Block!  '), 'academic block')
  assert.deepEqual(ids('ÁCADEMIC—Block!'), ['academic-block'])
  assert.equal(searchCampus('hostel', campusLocations, 1).length, 1)
  for (const query of ['', '   ', '!!!', 'a location that does not exist']) assert.deepEqual(ids(query), [])
  assert.deepEqual(searchCampus('hostel', campusLocations, 0), [])
})
