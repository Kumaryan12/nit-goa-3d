import { gpsToLocal, isGeoCoordinate, sameCoordinate } from './geo.ts'
import type { LocalCoordinate } from './geo.ts'
import { parseHeight } from './buildings.ts'
import type { GeoCoordinate, OSMElement, OSMTags, RoadFootprint } from '../types/osm.ts'

const footpaths = new Set(['footway', 'path', 'pedestrian', 'steps', 'cycleway', 'bridleway'])
const roads = new Set(['service', 'residential', 'unclassified', 'living_street', 'road', 'track',
  'tertiary', 'secondary', 'primary', 'trunk', 'motorway', 'tertiary_link', 'secondary_link',
  'primary_link', 'trunk_link', 'motorway_link'])
const EPSILON = 1e-6
const cross = (a: LocalCoordinate, b: LocalCoordinate) => a.x * b.z - a.z * b.x
const subtract = (a: LocalCoordinate, b: LocalCoordinate) => ({ x: a.x - b.x, z: a.z - b.z })
const equal = (a: LocalCoordinate, b: LocalCoordinate) => Math.hypot(a.x - b.x, a.z - b.z) < EPSILON

export function roadKind(tags: OSMTags): RoadFootprint['kind'] | null {
  if (tags.area === 'yes') return null // Area plazas aren't linear centerlines.
  if (footpaths.has(tags.highway)) return 'footpath'
  return roads.has(tags.highway) ? 'road' : null
}

export function roadWidth(tags: OSMTags, kind: RoadFootprint['kind']): number {
  const explicit = parseHeight(tags.width)
  if (explicit !== null && explicit >= 0.3 && explicit <= 30) return explicit
  if (kind === 'footpath') return tags.highway === 'cycleway' ? 2.5 : 1.8
  if (tags.highway === 'service') return tags.service === 'driveway' ? 3 : 4.5
  if (tags.highway === 'track') return 3
  return 6
}

export function roadCoordinates(geometry: GeoCoordinate[] | undefined): LocalCoordinate[] | null {
  if (!Array.isArray(geometry) || geometry.length < 2 || !geometry.every(isGeoCoordinate)) return null
  const points = geometry.filter((point, index) => index === 0 || !sameCoordinate(point, geometry[index - 1]))
  return points.length >= 2 ? points.map(gpsToLocal) : null
}

function onSegment(point: LocalCoordinate, a: LocalCoordinate, b: LocalCoordinate): boolean {
  const direction = subtract(b, a)
  const length = Math.hypot(direction.x, direction.z)
  return length > EPSILON && Math.abs(cross(subtract(point, a), direction)) / length < EPSILON
    && point.x >= Math.min(a.x, b.x) - EPSILON && point.x <= Math.max(a.x, b.x) + EPSILON
    && point.z >= Math.min(a.z, b.z) - EPSILON && point.z <= Math.max(a.z, b.z) + EPSILON
}

export function pointInCampus(point: LocalCoordinate, polygon: LocalCoordinate[]): boolean {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[j]
    const b = polygon[i]
    if (onSegment(point, a, b)) return true
    if ((a.z > point.z) !== (b.z > point.z)
      && point.x < ((b.x - a.x) * (point.z - a.z)) / (b.z - a.z) + a.x) inside = !inside
  }
  return inside
}

// Clip each segment against all polygon edges. Midpoint tests also handle
// concave campus boundaries and ways which leave and later re-enter campus.
export function clipRoadToCampus(points: LocalCoordinate[], polygon: LocalCoordinate[]): LocalCoordinate[][] {
  if (polygon.length < 3) return []
  const paths: LocalCoordinate[][] = []
  let current: LocalCoordinate[] | null = null
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]
    const b = points[i]
    const direction = subtract(b, a)
    const lengthSquared = direction.x ** 2 + direction.z ** 2
    if (lengthSquared < EPSILON ** 2) continue
    const cuts = [0, 1]
    for (let j = 0; j < polygon.length; j++) {
      const c = polygon[j]
      const d = polygon[(j + 1) % polygon.length]
      const edge = subtract(d, c)
      const offset = subtract(c, a)
      const denominator = cross(direction, edge)
      if (Math.abs(denominator) > EPSILON) {
        const t = cross(offset, edge) / denominator
        const u = cross(offset, direction) / denominator
        if (t > 0 && t < 1 && u >= 0 && u <= 1) cuts.push(t)
      } else if (Math.abs(cross(offset, direction)) < EPSILON) {
        for (const endpoint of [c, d]) {
          const delta = subtract(endpoint, a)
          const t = (delta.x * direction.x + delta.z * direction.z) / lengthSquared
          if (t > 0 && t < 1) cuts.push(t)
        }
      }
    }
    const sorted = [...new Set(cuts)].sort((x, y) => x - y)
    const at = (t: number) => ({ x: a.x + t * direction.x, z: a.z + t * direction.z })
    for (let j = 1; j < sorted.length; j++) {
      const start = at(sorted[j - 1])
      const end = at(sorted[j])
      if (equal(start, end)) continue
      if (!pointInCampus(at((sorted[j - 1] + sorted[j]) / 2), polygon)) {
        current = null
        continue
      }
      if (current && equal(current[current.length - 1], start)) current.push(end)
      else { current = [start, end]; paths.push(current) }
    }
  }
  return paths
}

export function extractCampusRoads(elements: OSMElement[], boundary: GeoCoordinate[]): RoadFootprint[] {
  const polygon = boundary.map(gpsToLocal)
  const result: RoadFootprint[] = []
  const seen = new Set<number>()
  for (const element of elements) {
    if (element.type !== 'way' || seen.has(element.id)) continue
    const tags = element.tags ?? {}
    const kind = roadKind(tags)
    if (!kind) continue
    const points = roadCoordinates(element.geometry)
    if (!points) continue
    const paths = clipRoadToCampus(points, polygon)
    if (!paths.length) continue
    seen.add(element.id)
    result.push({ id: `way/${element.id}`, osmId: element.id, tags, kind, width: roadWidth(tags, kind), paths })
  }
  return result
}
