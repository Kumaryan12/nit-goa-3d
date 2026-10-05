import type { LocalCoordinate } from './geo.ts'

export const ROAD_ELEVATION = .06
export const FOOTPATH_ELEVATION = .08

// The render mesh and tyre contact use the same bounded-miter outline.
export function roadRibbon(paths: LocalCoordinate[][], width: number, subdivide = false) {
  const points: LocalCoordinate[] = [], indices: number[] = []
  const ribbons = subdivide ? paths.map(path => path.flatMap((point, i) => {
    if (!i) return [point]
    const previous = path[i - 1], count = Math.max(1, Math.ceil(Math.hypot(point.x - previous.x, point.z - previous.z)))
    return Array.from({ length: count }, (_, j) => ({ x: previous.x + (point.x - previous.x) * (j + 1) / count, z: previous.z + (point.z - previous.z) * (j + 1) / count }))
  })) : paths
  for (const path of ribbons) {
    if (path.length < 2) continue
    const closed = Math.hypot(path[0].x - path.at(-1)!.x, path[0].z - path.at(-1)!.z) < 1e-6
    const base = points.length, halfWidth = width / 2
    const normal = (a: LocalCoordinate, b: LocalCoordinate) => {
      const dx = b.x - a.x, dz = b.z - a.z, length = Math.hypot(dx, dz)
      return length > 1e-8 ? { x: -dz / length, z: dx / length } : { x: 0, z: 0 }
    }
    path.forEach((point, i) => {
      const previous = i === 0 ? closed ? path[path.length - 2] : null : path[i - 1]
      const next = i === path.length - 1 ? closed ? path[1] : null : path[i + 1]
      const incoming = previous ? normal(previous, point) : null, outgoing = next ? normal(point, next) : null
      let offset = outgoing ?? incoming!, distance = halfWidth
      if (incoming && outgoing) {
        const sum = { x: incoming.x + outgoing.x, z: incoming.z + outgoing.z }, length = Math.hypot(sum.x, sum.z)
        if (length > 1e-6) {
          offset = { x: sum.x / length, z: sum.z / length }
          distance = Math.min(halfWidth / Math.max(offset.x * outgoing.x + offset.z * outgoing.z, .25), halfWidth * 4)
        }
      }
      for (const side of [1, -1]) points.push({ x: point.x + offset.x * distance * side, z: point.z + offset.z * distance * side })
      if (i < path.length - 1) {
        const left = base + i * 2
        indices.push(left, left + 2, left + 1, left + 1, left + 2, left + 3)
      }
    })
  }
  return { points, indices }
}
