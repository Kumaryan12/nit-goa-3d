import { BufferGeometry, Float32BufferAttribute } from 'three'
import { terrainHeightAt } from './terrain.ts'
import type { TerrainModel } from './terrain.ts'
import type { LocalCoordinate } from './geo.ts'

export const ROAD_ELEVATION = 0.06
export const FOOTPATH_ELEVATION = 0.08

// Split ribbons on the terrain's cell edges and diagonals. Sampling only the
// road edges lets the ground rise through the middle of a wide, sloped ribbon.
function drapeRoad(positions: number[], indices: number[], terrain: TerrainModel, elevation: number): BufferGeometry {
  const vertices: number[] = [], triangles: number[] = [], shared = new Map<string, number>()
  const cell = terrain.size / terrain.segments, origin = -terrain.size / 2
  const clip = (polygon: LocalCoordinate[], distance: (p: LocalCoordinate) => number): LocalCoordinate[] => {
    const result: LocalCoordinate[] = []
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i], b = polygon[(i + 1) % polygon.length], da = distance(a), db = distance(b)
      if (da >= 0) result.push(a)
      if ((da >= 0) !== (db >= 0)) {
        const t = da / (da - db)
        result.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t })
      }
    }
    return result
  }
  const vertex = (p: LocalCoordinate) => {
    // Store the same coordinates that the GPU will use when sampling height.
    const x = Math.fround(p.x), z = Math.fround(p.z), key = `${x},${z}`
    let index = shared.get(key)
    if (index === undefined) {
      index = vertices.length / 3
      shared.set(key, index)
      vertices.push(x, terrainHeightAt(terrain, x, z) + elevation, z)
    }
    return index
  }
  const add = (polygon: LocalCoordinate[]) => {
    for (let i = 1; i < polygon.length - 1; i++) {
      const a = polygon[0], b = polygon[i], c = polygon[i + 1]
      if (Math.abs((b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x)) > 1e-8) {
        triangles.push(vertex(a), vertex(b), vertex(c))
      }
    }
  }
  for (let i = 0; i < indices.length; i += 3) {
    const triangle = indices.slice(i, i + 3).map(index => ({ x: positions[index * 3], z: positions[index * 3 + 2] }))
    const minCol = Math.floor((Math.min(...triangle.map(p => p.x)) - origin) / cell)
    const maxCol = Math.floor((Math.max(...triangle.map(p => p.x)) - origin) / cell)
    const minRow = Math.floor((Math.min(...triangle.map(p => p.z)) - origin) / cell)
    const maxRow = Math.floor((Math.max(...triangle.map(p => p.z)) - origin) / cell)
    for (let row = minRow; row <= maxRow; row++) for (let col = minCol; col <= maxCol; col++) {
      const x = origin + col * cell, z = origin + row * cell
      let polygon = clip(triangle, p => p.x - x)
      polygon = clip(polygon, p => x + cell - p.x)
      polygon = clip(polygon, p => p.z - z)
      polygon = clip(polygon, p => z + cell - p.z)
      if (polygon.length < 3) continue
      add(clip(polygon, p => cell - (p.x - x) - (p.z - z)))
      add(clip(polygon, p => (p.x - x) + (p.z - z) - cell))
    }
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(vertices, 3))
  geometry.setIndex(triangles)
  geometry.computeVertexNormals()
  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()
  return geometry
}

// Ribbons retain world X/Z; shared corner vertices avoid gaps.
// Miter lengths are capped to prevent sharp bends from producing long spikes.
export function createRoadGeometry(paths: LocalCoordinate[][], width: number, elevation = ROAD_ELEVATION, terrain?: TerrainModel): BufferGeometry {
  const positions: number[] = []
  const indices: number[] = []
  const halfWidth = width / 2
  const drapedPaths = terrain ? paths.map((path) => path.flatMap((point, i) => {
    if (!i) return [point]
    const previous = path[i - 1], count = Math.max(1, Math.ceil(Math.hypot(point.x - previous.x, point.z - previous.z)))
    return Array.from({ length: count }, (_, j) => ({ x: previous.x + (point.x - previous.x) * (j + 1) / count, z: previous.z + (point.z - previous.z) * (j + 1) / count }))
  })) : paths
  for (const path of drapedPaths) {
    if (path.length < 2) continue
    const closed = Math.hypot(path[0].x - path[path.length - 1].x, path[0].z - path[path.length - 1].z) < 1e-6
    const base = positions.length / 3
    const normal = (a: LocalCoordinate, b: LocalCoordinate) => {
      const dx = b.x - a.x
      const dz = b.z - a.z
      const length = Math.hypot(dx, dz)
      return { x: -dz / length, z: dx / length }
    }
    path.forEach((point, i) => {
      const previous = i === 0 ? (closed ? path[path.length - 2] : null) : path[i - 1]
      const next = i === path.length - 1 ? (closed ? path[1] : null) : path[i + 1]
      const incoming = previous ? normal(previous, point) : null
      const outgoing = next ? normal(point, next) : null
      let offset = outgoing ?? incoming!
      let distance = halfWidth
      if (incoming && outgoing) {
        const sum = { x: incoming.x + outgoing.x, z: incoming.z + outgoing.z }
        const length = Math.hypot(sum.x, sum.z)
        if (length > 1e-6) {
          offset = { x: sum.x / length, z: sum.z / length }
          const dot = offset.x * outgoing.x + offset.z * outgoing.z
          distance = Math.min(halfWidth / Math.max(dot, 0.25), halfWidth * 4)
        }
      }
      for (const side of [1, -1]) {
        const x = point.x + offset.x * distance * side, z = point.z + offset.z * distance * side
        positions.push(x, (terrain ? terrainHeightAt(terrain, x, z) : 0) + elevation, z)
      }
      if (i < path.length - 1) {
        const left = base + i * 2
        indices.push(left, left + 2, left + 1, left + 1, left + 2, left + 3)
      }
    })
  }
  if (terrain) return drapeRoad(positions, indices, terrain, elevation)
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()
  return geometry
}
