import { BufferGeometry, Float32BufferAttribute } from 'three'
import { terrainHeightAt } from './terrain.ts'
import type { TerrainModel } from './terrain.ts'
import type { LocalCoordinate } from './geo.ts'

import { roadRibbon, ROAD_ELEVATION } from './roadRibbon.ts'
export { ROAD_ELEVATION, FOOTPATH_ELEVATION } from './roadRibbon.ts'

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
  const { points, indices } = roadRibbon(paths, width, !!terrain)
  const positions = points.flatMap(({ x, z }) => [x, (terrain ? terrainHeightAt(terrain, x, z) : 0) + elevation, z])
  if (terrain) return drapeRoad(positions, indices, terrain, elevation)
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()
  return geometry
}
