import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { Box3, ExtrudeGeometry, ShapeUtils, Vector3 } from 'three'
import { LAT0, LON0, gpsToLocal, groundSizeForCoordinates, sameCoordinate, validClosedRing } from '../src/lib/geo.ts'
import { buildingHeight, extractBuildingFootprints, joinMemberRings, parseHeight } from '../src/lib/buildings.ts'
import { buildingShape } from '../src/lib/buildingGeometry.ts'
import { CAMPUS_QUERY, FALLBACK_QUERY, fetchCampusData, requestOverpass, fetchPublishedCampusData, fetchPublishedCampusRoads } from '../src/lib/osm.ts'

const fixture = JSON.parse(await readFile(new URL('./fixtures/nit-goa-campus.json', import.meta.url), 'utf8'))
const realWay = fixture.elements.find((element) => element.type === 'way' && element.tags?.building)
const realRelation = fixture.elements.find((element) => element.type === 'relation')

test('published visitors load complete verified buildings and roads from the app origin', async (t) => {
  const roads = JSON.parse(await readFile(new URL('../public/map/nit-goa-roads.json', import.meta.url), 'utf8'))
  const campus = JSON.parse(await readFile(new URL('../public/map/nit-goa-campus.json', import.meta.url), 'utf8'))
  assert.deepEqual(campus, fixture)
  const calls = []
  t.mock.method(globalThis, 'fetch', async (url) => {
    calls.push(url)
    return Response.json(url.endsWith('roads.json') ? roads : campus)
  })
  const buildings = await fetchPublishedCampusData(), roadData = await fetchPublishedCampusRoads()
  assert.deepEqual(calls, ['/map/nit-goa-campus.json', '/map/nit-goa-roads.json'])
  assert.equal(buildings.buildings.length, 22)
  assert.equal(buildings.buildings.reduce((n, b) => n + b.holes.length, 0), 11)
  assert.equal(roadData.roads.length, 20)
  assert.deepEqual(buildings.boundary, roadData.boundary)
})

test('published maps reject unavailable or incomplete geometry and respect cancellation', async (t) => {
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => new Response('', { status: 404 }))
  await assert.rejects(fetchPublishedCampusData(), /unavailable/)
  fetchMock.mock.mockImplementation(async () => Response.json({ elements: [] }))
  await assert.rejects(fetchPublishedCampusData(), /Invalid published/)
  await assert.rejects(fetchPublishedCampusRoads(), /Invalid published/)
  const controller = new AbortController()
  controller.abort()
  const before = fetchMock.mock.callCount()
  await assert.rejects(fetchPublishedCampusRoads(controller.signal), { name: 'AbortError' })
  assert.equal(fetchMock.mock.callCount(), before)
})

test('published campus loading recovers a temporary server outage before falling back to cached data', async t => {
  let calls = 0
  t.mock.method(globalThis, 'fetch', async () => ++calls === 1 ? new Response('', {status:503}) : Response.json(fixture))
  const data = await fetchPublishedCampusData()
  assert.equal(calls, 2); assert.equal(data.buildings.length, 22)
})

test('GPS origin is zero; east and north retain meter scale and correct axes', () => {
  assert.deepEqual(gpsToLocal({ lat: LAT0, lon: LON0 }), { x: 0, z: -0 })
  const point = gpsToLocal({ lat: LAT0 + 0.001, lon: LON0 + 0.001 })
  assert.ok(Math.abs(point.x - 111.32 * Math.cos(LAT0 * Math.PI / 180)) < 1e-6)
  assert.ok(Math.abs(point.z + 110.54) < 1e-6)
})

test('height parsing requires complete positive meter values and respects priority', () => {
  for (const [input, value] of [['12', 12], ['12 m', 12], ['12.5', 12.5], [' 12.5 M ', 12.5]]) {
    assert.equal(parseHeight(input), value)
  }
  for (const invalid of [undefined, '', '0', '-2', '12ft', '12 meters', '12 m junk', 'NaN', 'Infinity', '3;4']) {
    assert.equal(parseHeight(invalid), null)
  }
  assert.equal(buildingHeight({ height: '12 m', 'building:levels': '8' }), 12)
  assert.ok(Math.abs(buildingHeight({ height: 'invalid', 'building:levels': '3' }) - 9.6) < 1e-9)
  assert.equal(buildingHeight({ 'building:levels': 'invalid' }), 10)
  assert.equal(buildingHeight({}), 10)
})

test('only complete nondegenerate coordinate rings are accepted', () => {
  assert.ok(validClosedRing(realWay.geometry))
  assert.equal(validClosedRing(realWay.geometry.slice(0, -1)), null)
  const invalid = structuredClone(realWay.geometry)
  invalid[1].lat = NaN
  assert.equal(validClosedRing(invalid), null)
  assert.equal(validClosedRing(Array(5).fill(realWay.geometry[0])), null)
  assert.equal(validClosedRing(undefined), null)
})

test('relation fragments join in arbitrary order and direction without fabricating closure', () => {
  const ring = realRelation.members.find((member) => member.role === 'outer').geometry
  const cut1 = 10
  const cut2 = 20
  const parts = [ring.slice(cut1, cut2 + 1).reverse(), ring.slice(cut2), ring.slice(0, cut1 + 1).reverse()]
  const joined = joinMemberRings(parts)
  assert.equal(joined.length, 1)
  assert.equal(joined[0].length, ring.length)
  assert.ok(sameCoordinate(joined[0][0], joined[0].at(-1)))
  assert.equal(joinMemberRings([ring.slice(0, 10)]).length, 0)
})

test('real campus fixture creates 22 footprints and preserves all 11 courtyard holes', () => {
  const buildings = extractBuildingFootprints(fixture.elements)
  assert.equal(buildings.length, 22)
  assert.equal(buildings.filter((building) => building.osmType === 'way').length, 14)
  assert.equal(buildings.filter((building) => building.osmType === 'relation').length, 8)
  assert.equal(buildings.reduce((sum, building) => sum + building.holes.length, 0), 11)
  assert.equal(new Set(buildings.map((building) => building.id)).size, 22)
})

test('relation members and repeated objects are not extruded twice', () => {
  const members = realRelation.members.map((member) => ({
    type: 'way', id: member.ref, geometry: member.geometry, tags: { building: 'yes' },
  }))
  assert.equal(extractBuildingFootprints([realRelation, ...members, realRelation]).length, 1)
  assert.equal(extractBuildingFootprints([realWay, realWay]).length, 1)
  assert.equal(extractBuildingFootprints([{ ...realWay, tags: { building: 'no' } }]).length, 0)
})

test('every real extrusion rises from Y = 0 and retains its local X/Z footprint', () => {
  for (const building of extractBuildingFootprints(fixture.elements)) {
    const shape = buildingShape(building)
    assert.ok(ShapeUtils.isClockWise(shape.getPoints()))
    assert.ok(shape.holes.every((hole) => !ShapeUtils.isClockWise(hole.getPoints())))
    const geometry = new ExtrudeGeometry(shape, { depth: building.height, steps: 1, bevelEnabled: false })
    geometry.rotateX(-Math.PI / 2)
    geometry.computeBoundingBox()
    const expected = new Box3().setFromPoints(building.outer.map((point) => {
      const { x, z } = gpsToLocal(point)
      return new Vector3(x, 0, z)
    }))
    const box = geometry.boundingBox
    assert.ok(Math.abs(box.min.y) < 1e-6)
    assert.ok(Math.abs(box.max.y - building.height) < 1e-6)
    for (const axis of ['x', 'z']) {
      assert.ok(Math.abs(box.min[axis] - expected.min[axis]) < 0.001)
      assert.ok(Math.abs(box.max[axis] - expected.max[axis]) < 0.001)
    }
    assert.ok(geometry.attributes.position.array.every(Number.isFinite))
    geometry.dispose()
  }
})

test('ground covers the entire real campus boundary and buildings with a margin', () => {
  const points = [...fixture.elements[0].geometry, ...extractBuildingFootprints(fixture.elements).flatMap((building) => building.outer)]
  const size = groundSizeForCoordinates(points)
  assert.equal(size, 1200)
  for (const point of points) {
    const { x, z } = gpsToLocal(point)
    assert.ok(Math.abs(x) + 49 <= size / 2 && Math.abs(z) + 49 <= size / 2)
  }
})

test('successful campus query uses the area and does not request the radius fallback', async (t) => {
  const calls = []
  t.mock.method(globalThis, 'fetch', async (_endpoint, options) => {
    calls.push(options.body.get('data'))
    return Response.json(fixture)
  })
  const data = await fetchCampusData()
  assert.deepEqual(calls, [CAMPUS_QUERY])
  assert.equal(data.source, 'campus-area')
  assert.equal(data.returnedBuildingCount, 22)
  assert.equal(data.buildings.length, 22)
  assert.equal(data.boundary.length, 40)
})

for (const reason of ['http-error', 'empty-area', 'timeout-remark']) {
  test(`900 m fallback handles ${reason} and reports its actual source`, async (t) => {
    t.mock.method(console, 'warn', () => {})
    const calls = []
    t.mock.method(globalThis, 'fetch', async (_endpoint, options) => {
      calls.push(options.body.get('data'))
      if (calls.length === 1) {
        if (reason === 'http-error') return new Response('busy', { status: 503 })
        if (reason === 'timeout-remark') return Response.json({ elements: [], remark: 'runtime error: Query timed out' })
        return Response.json({ elements: [fixture.elements[0]] })
      }
      return Response.json(fixture)
    })
    const data = await fetchCampusData()
    assert.deepEqual(calls, [CAMPUS_QUERY, FALLBACK_QUERY])
    assert.ok(FALLBACK_QUERY.includes('(around:900,15.16773,74.01548)'))
    assert.equal(data.source, 'nearby-fallback')
    assert.equal(data.buildings.length, 22)
  })
}

test('both failing queries preserve the underlying errors for the error overlay', async (t) => {
  t.mock.method(console, 'warn', () => {})
  t.mock.method(globalThis, 'fetch', async () => new Response('busy', { status: 503 }))
  await assert.rejects(fetchCampusData(), (error) => {
    assert.ok(error instanceof AggregateError)
    assert.equal(error.errors.length, 2)
    assert.ok(error.errors.every((cause) => cause.message.includes('HTTP 503')))
    return true
  })
})

test('cancelled loads never initiate the fallback query', async (t) => {
  let calls = 0
  t.mock.method(globalThis, 'fetch', async (_endpoint, options) => {
    calls++
    options.signal.throwIfAborted()
    return Response.json(fixture)
  })
  const controller = new AbortController()
  controller.abort()
  await assert.rejects(fetchCampusData(controller.signal), { name: 'AbortError' })
  assert.equal(calls, 1)
})

test('malformed JSON responses and Overpass partial-error remarks are rejected', async (t) => {
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => Response.json({ elements: 'invalid' }))
  await assert.rejects(requestOverpass(CAMPUS_QUERY), /invalid response/)
  fetchMock.mock.mockImplementation(async () => Response.json({ elements: fixture.elements, remark: 'Query timed out' }))
  await assert.rejects(requestOverpass(CAMPUS_QUERY), /Query timed out/)
})
