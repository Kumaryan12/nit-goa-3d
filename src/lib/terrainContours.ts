import { BufferGeometry, Float32BufferAttribute } from 'three'
import type { TerrainModel } from './terrain.ts'
import { inCanalOpening } from './canal.ts'

export const TERRAIN_CONTOUR_OFFSET = 0.08
// A malformed height field or an extremely small interval must not freeze the scene.
const MAX_CONTOUR_SEGMENTS = 100_000
const MAX_LEVELS_PER_TRIANGLE = 256
type Vertex = { x: number; y: number; z: number }

/** Trace the two displayed terrain triangles in each grid cell at fixed elevations. */
export function createTerrainContourGeometry(model: TerrainModel, interval = 2): BufferGeometry {
  if (!Number.isFinite(interval) || interval <= 0) throw new RangeError('Contour interval must be a finite positive number')
  const { size, segments, heights } = model
  if (!Number.isFinite(size) || size <= 0 || !Number.isInteger(segments) || segments < 1 || segments > 512 || heights.length !== (segments + 1) ** 2) {
    throw new RangeError('Invalid terrain dimensions for contours')
  }
  const positions: number[] = []
  const seen = new Set<string>()
  const key = (point: Vertex) => `${point.x.toFixed(7)},${point.y.toFixed(7)},${point.z.toFixed(7)}`

  function triangle(a: Vertex, b: Vertex, c: Vertex) {
    const vertices = [a, b, c]
    if (!vertices.every((point) => Number.isFinite(point.y))) return
    const low = Math.min(a.y, b.y, c.y), high = Math.max(a.y, b.y, c.y)
    if (high - low < 1e-9) return // Flat terraces should not fill with triangle edges.
    const first = Math.ceil(low / interval), last = Math.floor(high / interval)
    if (!Number.isSafeInteger(first) || !Number.isSafeInteger(last)) return
    const count = Math.min(last - first + 1, MAX_LEVELS_PER_TRIANGLE)
    for (let index = 0; index < count && positions.length / 6 < MAX_CONTOUR_SEGMENTS; index++) {
      const level = (first + index) * interval
      const crossings: Vertex[] = []
      const add = (point: Vertex) => {
        if (!crossings.some((other) => Math.hypot(other.x - point.x, other.z - point.z) < 1e-8)) crossings.push(point)
      }
      for (let edge = 0; edge < 3; edge++) {
        const from = vertices[edge], to = vertices[(edge + 1) % 3]
        if (from.y === level) add({ x: from.x, y: level + TERRAIN_CONTOUR_OFFSET, z: from.z })
        if (to.y === level) add({ x: to.x, y: level + TERRAIN_CONTOUR_OFFSET, z: to.z })
        if ((from.y < level && to.y > level) || (from.y > level && to.y < level)) {
          const fraction = (level - from.y) / (to.y - from.y)
          add({ x: from.x + (to.x - from.x) * fraction, y: level + TERRAIN_CONTOUR_OFFSET, z: from.z + (to.z - from.z) * fraction })
        }
      }
      if (crossings.length !== 2) continue
      const [from, to] = crossings
      if (model.canal && [from, to, { x: (from.x + to.x) / 2, z: (from.z + to.z) / 2 }].some(p => inCanalOpening(p, model.canal!))) continue
      const signature = [key(from), key(to)].sort().join('|')
      if (seen.has(signature)) continue
      seen.add(signature)
      positions.push(from.x, from.y, from.z, to.x, to.y, to.z)
    }
  }

  const stride = segments + 1, spacing = size / segments
  const vertex = (col: number, row: number): Vertex => ({ x: -size / 2 + col * spacing, y: heights[row * stride + col], z: -size / 2 + row * spacing })
  for (let row = 0; row < segments && positions.length / 6 < MAX_CONTOUR_SEGMENTS; row++) {
    for (let col = 0; col < segments && positions.length / 6 < MAX_CONTOUR_SEGMENTS; col++) {
      const a = vertex(col, row), b = vertex(col + 1, row)
      const c = vertex(col, row + 1), d = vertex(col + 1, row + 1)
      triangle(a, c, b)
      triangle(b, c, d)
    }
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  if (positions.length) geometry.computeBoundingSphere()
  return geometry
}
