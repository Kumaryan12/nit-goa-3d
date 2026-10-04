import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { LAT0, LON0, gpsToLocal } from '../src/lib/geo.ts'
import { clipRoadToCampus, extractCampusRoads, pointInCampus, roadCoordinates, roadKind, roadWidth } from '../src/lib/roads.ts'
import { createRoadGeometry, FOOTPATH_ELEVATION, ROAD_ELEVATION } from '../src/lib/roadGeometry.ts'
import { CAMPUS_BOUNDARY_QUERY, ROADS_QUERY, campusRoadPolygonQuery, fetchCampusRoads } from '../src/lib/osm.ts'
import { terrainHeightAt } from '../src/lib/terrain.ts'

const fixture = JSON.parse(await readFile(new URL('./fixtures/nit-goa-roads.json', import.meta.url), 'utf8'))
const boundary = fixture.elements[0].geometry
const polygon = boundary.map(gpsToLocal)
const roadWay = fixture.elements.find((element) => element.tags?.highway)
const square = [{ x: -10, z: -10 }, { x: 10, z: -10 }, { x: 10, z: 10 }, { x: -10, z: 10 }]

test('road conversion shares the building origin and converts all four cardinal directions in meters', () => {
  const geometry = [
    { lat: LAT0, lon: LON0 },
    { lat: LAT0, lon: LON0 + 0.001 },
    { lat: LAT0 + 0.001, lon: LON0 },
    { lat: LAT0, lon: LON0 - 0.001 },
    { lat: LAT0 - 0.001, lon: LON0 },
  ]
  const points = roadCoordinates(geometry)
  assert.deepEqual(points[0], { x: 0, z: -0 })
  const eastMeters = 111.32 * Math.cos(LAT0 * Math.PI / 180)
  assert.ok(Math.abs(points[1].x - eastMeters) < 1e-6 && points[1].z === 0)
  assert.ok(Math.abs(points[2].z + 110.54) < 1e-6 && points[2].x === 0)
  assert.ok(Math.abs(points[3].x + eastMeters) < 1e-6 && points[3].z === 0)
  assert.ok(Math.abs(points[4].z - 110.54) < 1e-6 && points[4].x === 0)
})

test('real road coordinates retain GPS ordering and never swap X and Z', () => {
  const points = roadCoordinates(roadWay.geometry)
  assert.equal(points.length, roadWay.geometry.length)
  points.forEach((point, i) => assert.deepEqual(point, gpsToLocal(roadWay.geometry[i])))
})

test('duplicate nodes are removed while malformed geometry cannot create invented connecting segments', () => {
  const points = roadCoordinates([roadWay.geometry[0], roadWay.geometry[0], roadWay.geometry[1]])
  assert.equal(points.length, 2)
  assert.equal(roadCoordinates([roadWay.geometry[0], { lat: NaN, lon: LON0 }, roadWay.geometry[1]]), null)
  assert.equal(roadCoordinates([roadWay.geometry[0], roadWay.geometry[0]]), null)
  assert.equal(roadCoordinates(undefined), null)
})

test('road and footpath classifications include the requested OSM tags and skip non-road features', () => {
  for (const highway of ['service', 'residential', 'unclassified']) assert.equal(roadKind({ highway }), 'road')
  for (const highway of ['footway', 'path', 'pedestrian', 'steps']) assert.equal(roadKind({ highway }), 'footpath')
  for (const highway of ['bus_stop', 'proposed', 'construction', 'traffic_signals']) assert.equal(roadKind({ highway }), null)
  assert.equal(roadKind({ highway: 'pedestrian', area: 'yes' }), null)
  assert.equal(roadWidth({ highway: 'service', width: '5 m' }, 'road'), 5)
  assert.equal(roadWidth({ highway: 'service', width: 'bad' }, 'road'), 4.5)
  assert.equal(roadWidth({ highway: 'service', width: '999999' }, 'road'), 4.5)
  assert.equal(roadWidth({ highway: 'footway' }, 'footpath'), 1.8)
})

test('a road crossing campus is clipped at both boundary intersections', () => {
  assert.deepEqual(clipRoadToCampus([{ x: -20, z: 0 }, { x: 20, z: 0 }], square),
    [[{ x: -10, z: 0 }, { x: 10, z: 0 }]])
  assert.deepEqual(clipRoadToCampus([{ x: -20, z: -20 }, { x: -15, z: -15 }], square), [])
  assert.deepEqual(clipRoadToCampus([{ x: -20, z: -10 }, { x: 20, z: -10 }], square),
    [[{ x: -10, z: -10 }, { x: 10, z: -10 }]])
})

test('roads that leave and re-enter a concave boundary retain separate mesh fragments', () => {
  const campus = [{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 10 },
    { x: 7, z: 10 }, { x: 7, z: 3 }, { x: 3, z: 3 }, { x: 3, z: 10 }, { x: 0, z: 10 }]
  const paths = clipRoadToCampus([{ x: -2, z: 5 }, { x: 12, z: 5 }], campus)
  assert.equal(paths.length, 2)
  assert.deepEqual(paths, [[{ x: 0, z: 5 }, { x: 3, z: 5 }], [{ x: 7, z: 5 }, { x: 10, z: 5 }]])
})

test('real campus roads create 20 unique ways, with every clipped centerline inside campus', () => {
  const roads = extractCampusRoads(fixture.elements, boundary)
  assert.equal(roads.length, 20)
  assert.equal(new Set(roads.map((road) => road.osmId)).size, 20)
  assert.ok(roads.every((road) => road.kind === 'road'))
  for (const road of roads) {
    for (const path of road.paths) {
      assert.ok(path.every((point) => pointInCampus(point, polygon)))
      for (let i = 1; i < path.length; i++) {
        assert.ok(pointInCampus({ x: (path[i - 1].x + path[i].x) / 2, z: (path[i - 1].z + path[i].z) / 2 }, polygon))
      }
    }
  }
})

test('real road meshes have finite geometry, upward surfaces, and the required ground clearance', () => {
  for (const road of extractCampusRoads(fixture.elements, boundary)) {
    const geometry = createRoadGeometry(road.paths, road.width)
    const positions = geometry.attributes.position.array
    assert.ok(positions.length > 0 && positions.every(Number.isFinite))
    for (let i = 1; i < positions.length; i += 3) assert.ok(Math.abs(positions[i] - ROAD_ELEVATION) < 1e-6)
    const normals = geometry.attributes.normal.array
    assert.ok(normals.every(Number.isFinite))
    for (let i = 1; i < normals.length; i += 3) assert.ok(normals[i] > 0.99)
    geometry.dispose()
  }
  const footpath = createRoadGeometry([[{ x: 0, z: 0 }, { x: 10, z: 0 }]], 2, FOOTPATH_ELEVATION)
  assert.ok(Math.abs(footpath.boundingBox.max.z - footpath.boundingBox.min.z - 2) < 1e-6)
  assert.ok(FOOTPATH_ELEVATION > ROAD_ELEVATION && ROAD_ELEVATION > 0.02)
  footpath.dispose()
})

test('closed road loops join at their seam and sharp bends cannot create infinite geometry', () => {
  for (const path of [[...square, square[0]], [{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 0.001, z: 0.001 }]]) {
    const geometry = createRoadGeometry([path], 4)
    assert.ok(geometry.attributes.position.array.every(Number.isFinite))
    if (path.length === 5) {
      const positions = [...geometry.attributes.position.array]
      assert.deepEqual(positions.slice(0, 6), positions.slice(-6))
    }
    geometry.dispose()
  }
})

test('sloped road interiors follow terrain triangles without ground poking through or changing the road footprint', () => {
  const segments = 12, size = 24
  const heights = Float32Array.from({ length: (segments + 1) ** 2 }, (_, i) => {
    const x = i % (segments + 1) * 2 - size / 2, z = Math.floor(i / (segments + 1)) * 2 - size / 2
    return Math.max(0, 3 - Math.abs(z)) + Math.sin(x * .7) * .5
  })
  const terrain = { size, segments, heights, colors: new Float32Array(heights.length * 3) }
  const area = geometry => {
    const p = geometry.getAttribute('position'), indices = geometry.getIndex()
    let total = 0
    for (let i = 0; i < indices.count; i += 3) {
      const [a, b, c] = [0, 1, 2].map(j => indices.getX(i + j))
      total += Math.abs((p.getX(b) - p.getX(a)) * (p.getZ(c) - p.getZ(a)) - (p.getZ(b) - p.getZ(a)) * (p.getX(c) - p.getX(a))) / 2
    }
    return total
  }
  for (const path of [[{ x: -8, z: 0 }, { x: 8, z: 0 }], [{ x: -8, z: -3 }, { x: 0, z: 0 }, { x: 8, z: 4 }]]) {
    const flat = createRoadGeometry([path], 6), draped = createRoadGeometry([path], 6, ROAD_ELEVATION, terrain)
    try {
      assert.ok(Math.abs(area(draped) - area(flat)) < 1e-4, 'draping preserves road width, bends and coverage')
      const p = draped.getAttribute('position'), indices = draped.getIndex()
      assert.ok(p.array.every(Number.isFinite))
      for (let i = 0; i < indices.count; i += 3) {
        const points = [0, 1, 2].map(j => indices.getX(i + j))
        for (const weights of [[1/3, 1/3, 1/3], [.6, .2, .2], [.1, .7, .2]]) {
          const sample = getter => points.reduce((sum, index, j) => sum + getter.call(p, index) * weights[j], 0)
          const x = sample(p.getX), y = sample(p.getY), z = sample(p.getZ)
          assert.ok(Math.abs(y - terrainHeightAt(terrain, x, z) - ROAD_ELEVATION) < 1e-5, 'road interior has continuous clearance above the actual terrain')
        }
      }
      const normals = draped.getAttribute('normal')
      assert.ok(normals.array.every(Number.isFinite))
      for (let i = 0; i < normals.count; i++) assert.ok(normals.getY(i) > 0, 'surface faces upward')
    } finally { flat.dispose(); draped.dispose() }
  }
})

test('road area query fetches all highway ways and returns the real campus roads', async (t) => {
  const calls = []
  t.mock.method(globalThis, 'fetch', async (_endpoint, options) => {
    calls.push(options.body.get('data'))
    return Response.json(fixture)
  })
  const data = await fetchCampusRoads()
  assert.deepEqual(calls, [ROADS_QUERY])
  assert.ok(ROADS_QUERY.includes('way["highway"](area.campusArea)'))
  assert.equal(data.source, 'campus-area')
  assert.equal(data.returnedRoadCount, 20)
  assert.equal(data.roads.length, 20)
})

test('empty campus-area results use the actual campus polygon, never a nearby radius', async (t) => {
  t.mock.method(console, 'warn', () => {})
  const calls = []
  t.mock.method(globalThis, 'fetch', async (_endpoint, options) => {
    calls.push(options.body.get('data'))
    return Response.json(calls.length === 1 ? { elements: [fixture.elements[0]] } : fixture)
  })
  const data = await fetchCampusRoads()
  assert.deepEqual(calls, [ROADS_QUERY, campusRoadPolygonQuery(boundary)])
  assert.ok(calls[1].includes('(poly:') && !calls[1].includes('around:'))
  assert.equal(data.source, 'campus-polygon')
  assert.equal(data.roads.length, 20)
})

test('a failed road area query retrieves the boundary before making the polygon request', async (t) => {
  t.mock.method(console, 'warn', () => {})
  const calls = []
  t.mock.method(globalThis, 'fetch', async (_endpoint, options) => {
    calls.push(options.body.get('data'))
    if (calls.length === 1) return new Response('busy', { status: 503 })
    return Response.json(calls.length === 2 ? { elements: [fixture.elements[0]] } : fixture)
  })
  const data = await fetchCampusRoads()
  assert.deepEqual(calls, [ROADS_QUERY, CAMPUS_BOUNDARY_QUERY, campusRoadPolygonQuery(boundary)])
  assert.equal(data.roads.length, 20)
})

test('missing campus boundaries fail safely without rendering unbounded nearby roads', async (t) => {
  t.mock.method(console, 'warn', () => {})
  t.mock.method(globalThis, 'fetch', async () => Response.json({ elements: [roadWay] }))
  await assert.rejects(fetchCampusRoads(), (error) => error instanceof AggregateError && error.errors.length === 2)
})

test('successful empty polygon responses remain empty instead of using fictional roads', async (t) => {
  t.mock.method(console, 'warn', () => {})
  t.mock.method(globalThis, 'fetch', async () => Response.json({ elements: [fixture.elements[0]] }))
  const data = await fetchCampusRoads()
  assert.equal(data.roads.length, 0)
})

test('cancelled road loads do not start a fallback request', async (t) => {
  let calls = 0
  t.mock.method(globalThis, 'fetch', async (_endpoint, options) => { calls++; options.signal.throwIfAborted() })
  const controller = new AbortController()
  controller.abort()
  await assert.rejects(fetchCampusRoads(controller.signal), { name: 'AbortError' })
  assert.equal(calls, 1)
})
