import type { LocalCoordinate } from './geo.ts'
import type { RoadFootprint } from '../types/osm.ts'

export interface GraphNode extends LocalCoordinate { id: string; layer: string }
export interface GraphLink { to: string; distance: number }
export interface GraphEdge { from: string; to: string; distance: number; roadId: string; forward: boolean; backward: boolean }
export interface RoadGraph { nodes: Map<string, GraphNode>; adjacency: Map<string, GraphLink[]>; edges: GraphEdge[] }
interface Segment { a: LocalCoordinate; b: LocalCoordinate; roadId: string; layer: string; forward: boolean; backward: boolean; cuts: number[] }
export const MAX_ROUTE_SNAP_METERS = 80
export const WALKING_METERS_PER_MINUTE = 80
const EPS = 1e-7
const valid = (point: LocalCoordinate) => Number.isFinite(point.x) && Number.isFinite(point.z)
const distance = (a: LocalCoordinate, b: LocalCoordinate) => Math.hypot(b.x - a.x, b.z - a.z)
const cross = (x: number, z: number, bx: number, bz: number) => x * bz - z * bx

export interface WalkingAccessOptions { allowPrivate?: boolean }
export function isWalkableRoad(road: RoadFootprint, { allowPrivate = false }: WalkingAccessOptions = {}): boolean {
  const { tags } = road
  if (tags.foot === 'no' || (tags.foot === 'private' && !allowPrivate)) return false
  const explicitFoot = ['yes', 'designated', 'permissive'].includes(tags.foot)
  if ((tags.access === 'no' || (tags.access === 'private' && !allowPrivate)) && !explicitFoot) return false
  if (['motorway', 'motorway_link', 'trunk', 'trunk_link'].includes(tags.highway) && !explicitFoot) return false
  return true
}

// Split geometric intersections and collinear overlaps. Distinct OSM layers
// stay separate; pedestrian access is respected independently of car one-way.
export function createRoadGraph(roads: RoadFootprint[], access: WalkingAccessOptions = {}): RoadGraph {
  const graph: RoadGraph = { nodes: new Map(), adjacency: new Map(), edges: [] }
  const segments: Segment[] = roads.filter((road) => isWalkableRoad(road, access)).flatMap((road) => road.paths.flatMap((path) => path.slice(1).flatMap((b, i) => {
    const a = path[i]
    return valid(a) && valid(b) && distance(a, b) > EPS ? [{ a, b, roadId: road.id, layer: road.tags.layer ?? (road.tags.bridge === 'yes' ? '1' : road.tags.tunnel === 'yes' ? '-1' : '0'),
      forward: road.tags['oneway:foot'] !== '-1', backward: road.tags['oneway:foot'] !== 'yes', cuts: [0, 1] }] : []
  })))
  const addCut = (segment: Segment, t: number) => { if (t >= -EPS && t <= 1 + EPS) segment.cuts.push(Math.max(0, Math.min(1, t))) }
  const project = (point: LocalCoordinate, segment: Segment) => {
    const dx = segment.b.x - segment.a.x, dz = segment.b.z - segment.a.z
    return ((point.x - segment.a.x) * dx + (point.z - segment.a.z) * dz) / (dx * dx + dz * dz)
  }
  for (let i = 0; i < segments.length; i++) for (let j = i + 1; j < segments.length; j++) {
    const a = segments[i], b = segments[j]
    if (a.layer !== b.layer) continue
    const dx = a.b.x - a.a.x, dz = a.b.z - a.a.z
    const ex = b.b.x - b.a.x, ez = b.b.z - b.a.z
    const ox = b.a.x - a.a.x, oz = b.a.z - a.a.z
    const denominator = cross(dx, dz, ex, ez)
    if (Math.abs(denominator) > EPS) {
      const t = cross(ox, oz, ex, ez) / denominator, u = cross(ox, oz, dx, dz) / denominator
      if (t >= -EPS && t <= 1 + EPS && u >= -EPS && u <= 1 + EPS) { addCut(a, t); addCut(b, u) }
    } else if (Math.abs(cross(ox, oz, dx, dz)) < EPS) {
      addCut(a, project(b.a, a)); addCut(a, project(b.b, a))
      addCut(b, project(a.a, b)); addCut(b, project(a.b, b))
    }
  }
  const node = (point: LocalCoordinate, layer: string): string => {
    // Millimeter quantization only removes numerical intersection noise.
    const id = `${Math.round(point.x * 1000)}:${Math.round(point.z * 1000)}:${layer}`
    if (!graph.nodes.has(id)) { graph.nodes.set(id, { ...point, id, layer }); graph.adjacency.set(id, []) }
    return id
  }
  const link = (from: string, to: string, length: number) => {
    const list = graph.adjacency.get(from)!
    const existing = list.find((edge) => edge.to === to)
    if (!existing) list.push({ to, distance: length })
    else existing.distance = Math.min(existing.distance, length)
  }
  for (const segment of segments) {
    const cuts = [...new Set(segment.cuts)].sort((a, b) => a - b)
    const at = (t: number) => ({ x: segment.a.x + (segment.b.x - segment.a.x) * t, z: segment.a.z + (segment.b.z - segment.a.z) * t })
    for (let i = 1; i < cuts.length; i++) {
      const a = at(cuts[i - 1]), b = at(cuts[i]), length = distance(a, b)
      if (length <= EPS) continue
      const from = node(a, segment.layer), to = node(b, segment.layer)
      if (from === to) continue
      graph.edges.push({ from, to, distance: length, roadId: segment.roadId, forward: segment.forward, backward: segment.backward })
      if (segment.forward) link(from, to, length)
      if (segment.backward) link(to, from, length)
    }
  }
  return graph
}

class MinHeap {
  private items: { id: string; priority: number; cost: number }[] = []
  push(item: { id: string; priority: number; cost: number }) {
    const items = this.items; items.push(item)
    let i = items.length - 1
    while (i > 0) {
      const parent = Math.floor((i - 1) / 2)
      if (items[parent].priority <= item.priority) break
      items[i] = items[parent]; i = parent
    }
    items[i] = item
  }
  pop() {
    const items = this.items, root = items[0], last = items.pop()
    if (!items.length || !last) return root
    let i = 0
    while (i * 2 + 1 < items.length) {
      let child = i * 2 + 1
      if (child + 1 < items.length && items[child + 1].priority < items[child].priority) child++
      if (last.priority <= items[child].priority) break
      items[i] = items[child]; i = child
    }
    items[i] = last
    return root
  }
  get size() { return this.items.length }
}

interface Snap { point: LocalCoordinate; edge: GraphEdge; t: number; distance: number }
function nearestEdge(point: LocalCoordinate, graph: RoadGraph): Snap | null {
  let best: Snap | null = null
  for (const edge of graph.edges) {
    const a = graph.nodes.get(edge.from)!, b = graph.nodes.get(edge.to)!
    const dx = b.x - a.x, dz = b.z - a.z
    const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.z - a.z) * dz) / (dx * dx + dz * dz)))
    const projected = { x: a.x + dx * t, z: a.z + dz * t }, length = distance(point, projected)
    if (!best || length < best.distance - EPS) best = { edge, point: projected, t, distance: length }
  }
  return best
}

export interface WalkingRoute {
  path: LocalCoordinate[]
  distance: number
  walkingMinutes: number
  startConnection: number
  endConnection: number
}

// Virtual start/end nodes connect to projections on segments, not merely the
// nearest vertex. Queries do not mutate the shared graph or join components.
export function planWalkingRoute(start: LocalCoordinate, end: LocalCoordinate, graph: RoadGraph, maxSnap = MAX_ROUTE_SNAP_METERS): WalkingRoute | null {
  if (!valid(start) || !valid(end) || !Number.isFinite(maxSnap) || maxSnap < 0 || !graph.edges.length) return null
  const from = nearestEdge(start, graph), to = nearestEdge(end, graph)
  if (!from || !to || from.distance > maxSnap || to.distance > maxSnap) return null
  if (distance(start, end) <= EPS) return { path: [from.point], distance: 0, walkingMinutes: 0, startConnection: 0, endConnection: 0 }
  const nodes = new Map(graph.nodes)
  nodes.set('@start', { ...from.point, id: '@start', layer: '' }); nodes.set('@end', { ...to.point, id: '@end', layer: '' })
  const extra = new Map<string, GraphLink[]>()
  const link = (a: string, b: string, length: number) => { if (!extra.has(a)) extra.set(a, []); extra.get(a)!.push({ to: b, distance: length }) }
  if (from.edge.backward || from.t <= EPS) link('@start', from.edge.from, from.edge.distance * from.t)
  if (from.edge.forward || from.t >= 1 - EPS) link('@start', from.edge.to, from.edge.distance * (1 - from.t))
  if (to.edge.forward || to.t <= EPS) link(to.edge.from, '@end', to.edge.distance * to.t)
  if (to.edge.backward || to.t >= 1 - EPS) link(to.edge.to, '@end', to.edge.distance * (1 - to.t))
  if (from.edge === to.edge && ((to.t >= from.t && from.edge.forward) || (to.t <= from.t && from.edge.backward))) link('@start', '@end', distance(from.point, to.point))
  const open = new MinHeap(), scores = new Map<string, number>([['@start', 0]]), previous = new Map<string, string>()
  open.push({ id: '@start', cost: 0, priority: distance(from.point, to.point) })
  while (open.size) {
    const current = open.pop()!
    if (current.cost > (scores.get(current.id) ?? Infinity) + EPS) continue
    if (current.id === '@end') {
      const ids = ['@end']
      while (previous.has(ids[ids.length - 1])) ids.push(previous.get(ids[ids.length - 1])!)
      const path = ids.reverse().map((id) => { const node = nodes.get(id)!; return { x: node.x, z: node.z } })
        .filter((point, i, points) => i === 0 || distance(point, points[i - 1]) > EPS)
      const total = current.cost + from.distance + to.distance
      return { path, distance: total, walkingMinutes: total / WALKING_METERS_PER_MINUTE, startConnection: from.distance, endConnection: to.distance }
    }
    for (const neighbor of [...(graph.adjacency.get(current.id) ?? []), ...(extra.get(current.id) ?? [])]) {
      const cost = current.cost + neighbor.distance
      if (cost + EPS >= (scores.get(neighbor.to) ?? Infinity)) continue
      scores.set(neighbor.to, cost); previous.set(neighbor.to, current.id)
      open.push({ id: neighbor.to, cost, priority: cost + distance(nodes.get(neighbor.to)!, to.point) })
    }
  }
  return null
}

export function findPath(start: LocalCoordinate, end: LocalCoordinate, graph: RoadGraph): LocalCoordinate[] {
  return planWalkingRoute(start, end, graph)?.path ?? []
}
export function createPathfinder(roads: RoadFootprint[], access: WalkingAccessOptions = {}) {
  const graph = createRoadGraph(roads, access)
  return { graph, findPath: (start: LocalCoordinate, end: LocalCoordinate) => findPath(start, end, graph) }
}
