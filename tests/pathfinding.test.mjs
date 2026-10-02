import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { createRoadGraph, createPathfinder, findPath, planWalkingRoute, isWalkableRoad } from '../src/lib/pathfinding.ts'
import { extractCampusRoads } from '../src/lib/roads.ts'
const p = (x, z) => ({ x, z })
const road = (id, points, tags = {}) => ({ id, osmId: Number(id) || 1, tags: { highway: 'service', ...tags }, kind: tags.highway === 'footway' ? 'footpath' : 'road', width: 4.5, paths: [points] })
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-6, `${actual} ≈ ${expected}`)

test('graph creates shared meter-coordinate nodes and weighted two-way road/footpath edges', () => {
  const graph = createRoadGraph([road('1', [p(0, 0), p(10, 0)]), road('2', [p(10, 0), p(10, 10)], { highway: 'footway' })])
  assert.equal(graph.nodes.size, 3)
  assert.equal(graph.edges.length, 2)
  assert.equal(graph.adjacency.get('10000:0:0').length, 2)
  close(graph.edges[0].distance, 10)
  const path = createPathfinder([road('1', [p(0, 0), p(10, 0), p(10, 10)])]).findPath(p(0, 0), p(10, 10))
  assert.deepEqual(path, [p(0, 0), p(10, 0), p(10, 10)])
})

test('graph splits geometric crossings and collinear overlaps so walking can turn at intersections', () => {
  const graph = createRoadGraph([road('1', [p(-10, 0), p(10, 0)]), road('2', [p(0, -10), p(0, 10)])])
  assert.equal(graph.nodes.size, 5)
  assert.equal(graph.edges.length, 4)
  assert.deepEqual(findPath(p(-10, 0), p(0, 10), graph), [p(-10, 0), p(0, 0), p(0, 10)])
  const overlap = createRoadGraph([road('1', [p(0, 0), p(30, 0)]), road('2', [p(10, 0), p(20, 0)])])
  assert.equal(overlap.nodes.size, 4)
  close(planWalkingRoute(p(0, 0), p(30, 0), overlap).distance, 30)
})

test('A* chooses the shortest connected route rather than the first or apparently direct detour', () => {
  const graph = createRoadGraph([
    road('long', [p(0, 0), p(80, 0), p(80, 100), p(0, 100)]),
    road('short', [p(0, 0), p(-10, 0), p(-10, 100), p(0, 100)]),
  ])
  const route = planWalkingRoute(p(0, 0), p(0, 100), graph)
  close(route.distance, 120)
  close(route.walkingMinutes, 1.5)
  assert.deepEqual(route.path, [p(0, 0), p(-10, 0), p(-10, 100), p(0, 100)])
})

test('segment snapping handles mid-edge endpoints and reports short anchor connections without mutating the graph', () => {
  const graph = createRoadGraph([road('1', [p(0, 0), p(100, 0)])])
  const snapshot = structuredClone(graph)
  const route = planWalkingRoute(p(20, 3), p(80, 4), graph)
  assert.deepEqual(route.path, [p(20, 0), p(80, 0)])
  close(route.distance, 67)
  close(route.startConnection, 3)
  close(route.endConnection, 4)
  assert.deepEqual(graph, snapshot)
  close(planWalkingRoute(p(80, 0), p(20, 0), graph).distance, 60)
  assert.deepEqual(findPath(p(20, 0), p(80, 0), graph), route.path)
})

test('no route is fabricated for disconnected networks, distant anchors, invalid input or missing roads', () => {
  const graph = createRoadGraph([road('1', [p(0, 0), p(10, 0)]), road('2', [p(100, 0), p(110, 0)])])
  assert.equal(planWalkingRoute(p(0, 0), p(110, 0), graph), null)
  assert.deepEqual(findPath(p(0, 0), p(110, 0), graph), [])
  assert.equal(planWalkingRoute(p(0, 81), p(10, 0), graph), null)
  assert.equal(planWalkingRoute(p(NaN, 0), p(10, 0), graph), null)
  assert.equal(planWalkingRoute(p(0, 0), p(10, 0), graph, -1), null)
  assert.equal(planWalkingRoute(p(0, 0), p(10, 0), createRoadGraph([])), null)
  assert.equal(createRoadGraph([road('1', [p(0, 0), p(0, 0), p(Infinity, 0)])]).edges.length, 0)
  const same = planWalkingRoute(p(0, 0), p(0, 0), graph)
  assert.equal(same.distance, 0)
  assert.equal(same.walkingMinutes, 0)
})

test('pedestrian permissions and grade separation are preserved while car-only one-way is ignored', () => {
  assert.equal(isWalkableRoad(road('1', [], { foot: 'no' })), false)
  assert.equal(isWalkableRoad(road('1', [], { access: 'private' })), false)
  assert.equal(isWalkableRoad(road('1', [], { access: 'private' }), { allowPrivate: true }), true)
  assert.equal(isWalkableRoad(road('1', [], { foot: 'no', access: 'private' }), { allowPrivate: true }), false)
  assert.equal(isWalkableRoad(road('1', [], { access: 'no' }), { allowPrivate: true }), false)
  assert.equal(isWalkableRoad(road('1', [], { access: 'private', foot: 'designated' })), true)
  assert.equal(isWalkableRoad(road('1', [], { highway: 'motorway' })), false)
  const graph = createRoadGraph([road('1', [p(-10, 0), p(10, 0)]), road('2', [p(0, -10), p(0, 10)], { bridge: 'yes' })])
  assert.equal(graph.nodes.size, 4)
  assert.equal(planWalkingRoute(p(-10, 0), p(0, 10), graph), null)
  const cars = createRoadGraph([road('1', [p(0, 0), p(100, 0)], { oneway: 'yes' })])
  assert.ok(planWalkingRoute(p(80, 0), p(20, 0), cars))
})

test('pedestrian one-way allows only the mapped direction including snapped endpoints', () => {
  for (const [tag, start, end] of [['yes', p(20, 0), p(80, 0)], ['-1', p(80, 0), p(20, 0)]]) {
    const graph = createRoadGraph([road('1', [p(0, 0), p(100, 0)], { 'oneway:foot': tag })])
    close(planWalkingRoute(start, end, graph).distance, 60)
    assert.equal(planWalkingRoute(end, start, graph), null)
  }
})

test('the real campus OSM fixture builds a traversable graph without invented geometry', async () => {
  const response = JSON.parse(await readFile(new URL('./fixtures/nit-goa-roads.json', import.meta.url), 'utf8'))
  const boundary = response.elements.find((element) => element.id === 1259742369).geometry
  const roads = extractCampusRoads(response.elements, boundary)
  const graph = createRoadGraph(roads, { allowPrivate: true })
  assert.ok(graph.nodes.size > 100)
  assert.ok(graph.edges.length >= 193)
  const path = roads[0].paths[0]
  const route = planWalkingRoute(path[0], path.at(-1), graph)
  assert.ok(route && route.path.length > 1)
  assert.ok(route.distance > 0 && Number.isFinite(route.walkingMinutes))
  assert.ok(graph.edges.every((edge) => roads.some((item) => item.id === edge.roadId)))
})
