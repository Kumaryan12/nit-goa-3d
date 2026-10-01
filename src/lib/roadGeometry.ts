import { BufferGeometry, Float32BufferAttribute } from 'three'
import type { LocalCoordinate } from './geo.ts'

export const ROAD_ELEVATION = 0.06
export const FOOTPATH_ELEVATION = 0.08

// Flat ribbons use world X/Z directly; shared corner vertices avoid gaps.
// Miter lengths are capped to prevent sharp bends from producing long spikes.
export function createRoadGeometry(paths: LocalCoordinate[][], width: number, elevation = ROAD_ELEVATION): BufferGeometry {
  const positions: number[] = []
  const indices: number[] = []
  const halfWidth = width / 2
  for (const path of paths) {
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
      positions.push(point.x + offset.x * distance, elevation, point.z + offset.z * distance,
        point.x - offset.x * distance, elevation, point.z - offset.z * distance)
      if (i < path.length - 1) {
        const left = base + i * 2
        indices.push(left, left + 2, left + 1, left + 1, left + 2, left + 3)
      }
    })
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()
  return geometry
}
