import { BufferGeometry, Color, Float32BufferAttribute } from 'three'
import { gpsToLocal } from './geo.ts'
import type { LocalCoordinate } from './geo.ts'
import { slopeElevationAt } from './topography.ts'
import type { TerrainSlope } from './topography.ts'
import { pointInCampus } from './roads.ts'
import type { BuildingFootprint, RoadFootprint } from '../types/osm.ts'

export interface GroundRect { x: number; z: number; halfX: number; halfZ: number }
export interface TerrainModel {
  size: number
  segments: number
  heights: Float32Array
  colors: Float32Array
}
export interface TerrainFeatures {
  boundary: LocalCoordinate[]
  buildings: BuildingFootprint[]
  roads: RoadFootprint[]
  clearings: GroundRect[]
  slope?: TerrainSlope
}

export function footprintRect(building: BuildingFootprint): GroundRect {
  const points = building.outer.map(gpsToLocal)
  const xs = points.map((p) => p.x)
  const zs = points.map((p) => p.z)
  const minX = Math.min(...xs), maxX = Math.max(...xs)
  const minZ = Math.min(...zs), maxZ = Math.max(...zs)
  return { x: (minX + maxX) / 2, z: (minZ + maxZ) / 2, halfX: (maxX - minX) / 2, halfZ: (maxZ - minZ) / 2 }
}

export function distanceToRect(p: LocalCoordinate, rect: GroundRect): number {
  return Math.hypot(Math.max(0, Math.abs(p.x - rect.x) - rect.halfX), Math.max(0, Math.abs(p.z - rect.z) - rect.halfZ))
}

export function distanceToSegment(p: LocalCoordinate, a: LocalCoordinate, b: LocalCoordinate): number {
  const dx = b.x - a.x, dz = b.z - a.z
  const squared = dx * dx + dz * dz
  const t = squared ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / squared)) : 0
  return Math.hypot(p.x - a.x - t * dx, p.z - a.z - t * dz)
}

const smooth = (n: number) => { const t = Math.max(0, Math.min(1, n)); return t * t * (3 - 2 * t) }
const hash = (x: number, z: number) => { const n = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return n - Math.floor(n) }

// Seed-free value noise is deterministic in world meters and continuous at cell edges.
export function terrainNoise(x: number, z: number, scale = 90): number {
  const gx = x / scale, gz = z / scale
  const ix = Math.floor(gx), iz = Math.floor(gz)
  const tx = smooth(gx - ix), tz = smooth(gz - iz)
  const a = hash(ix, iz) * (1 - tx) + hash(ix + 1, iz) * tx
  const b = hash(ix, iz + 1) * (1 - tx) + hash(ix + 1, iz + 1) * tx
  return a * (1 - tz) + b * tz
}

export function generateTerrain(size: number, features: TerrainFeatures, segments = 160): TerrainModel {
  if (!Number.isFinite(size) || size <= 0 || !Number.isInteger(segments) || segments < 2 || segments > 256) throw new Error('Invalid terrain dimensions')
  const rectangles = [...features.buildings.map(footprintRect), ...features.clearings]
  const roadSegments = features.roads.flatMap((road) => road.paths.flatMap((path) => path.slice(1).map((b, i) => ({ a: path[i], b, radius: road.width / 2 }))))
  const boundarySegments = features.boundary.slice(1).map((b, i) => ({ a: features.boundary[i], b }))
  const heights = new Float32Array((segments + 1) ** 2)
  const colors = new Float32Array(heights.length * 3)
  const beige = new Color('#ded2b7'), grass = new Color('#81965a'), outside = new Color('#587a4e')
  const color = new Color()
  // Two cells of flat clearance guarantee that interpolated triangles beneath
  // footprints and POIs stay level. Roads follow the base grade when a slope exists.
  const flatBuffer = (size / segments) * 2
  for (let row = 0; row <= segments; row++) {
    for (let col = 0; col <= segments; col++) {
      const point = { x: -size / 2 + col * size / segments, z: -size / 2 + row * size / segments }
      let settlementDistance = Infinity
      let terraceDistance = Infinity, terraceHeight = 0
      for (const rect of rectangles) {
        const distance = distanceToRect(point, rect)
        settlementDistance = Math.min(settlementDistance, distance)
        if (distance < terraceDistance) { terraceDistance = distance; terraceHeight = slopeElevationAt(rect, features.slope) }
      }
      for (const line of roadSegments) settlementDistance = Math.min(settlementDistance, Math.max(0, distanceToSegment(point, line.a, line.b) - line.radius))
      let boundaryDistance = Infinity
      for (const line of boundarySegments) boundaryDistance = Math.min(boundaryDistance, distanceToSegment(point, line.a, line.b))
      const blend = smooth((Math.min(settlementDistance, boundaryDistance) - flatBuffer) / 35)
      const noise = terrainNoise(point.x, point.z)
      const index = row * (segments + 1) + col
      const terraceBlend = smooth((terraceDistance - flatBuffer) / 25)
      const base = features.slope ? terraceHeight * (1 - terraceBlend) + slopeElevationAt(point, features.slope) * terraceBlend : 0
      heights[index] = base + blend * (0.25 + noise * 1.5 + terrainNoise(point.x, point.z, 32) * 0.35)
      if (features.boundary.length && pointInCampus(point, features.boundary)) color.copy(beige).lerp(grass, smooth((settlementDistance - 5) / 45))
      else color.copy(outside)
      color.multiplyScalar(0.92 + noise * 0.16)
      color.toArray(colors, index * 3)
    }
  }
  return { size, segments, heights, colors }
}

// Triangle interpolation matches the mesh diagonal exactly, attaching trees
// to the displayed surface rather than an independent noise approximation.
export function terrainHeightAt(model: TerrainModel, x: number, z: number): number {
  const { segments, size, heights } = model
  const gx = Math.max(0, Math.min(segments, (x / size + 0.5) * segments))
  const gz = Math.max(0, Math.min(segments, (z / size + 0.5) * segments))
  const col = Math.min(segments - 1, Math.floor(gx)), row = Math.min(segments - 1, Math.floor(gz))
  const tx = gx - col, tz = gz - row, stride = segments + 1
  const a = heights[row * stride + col], b = heights[row * stride + col + 1]
  const c = heights[(row + 1) * stride + col], d = heights[(row + 1) * stride + col + 1]
  return tx + tz <= 1 ? a + (b - a) * tx + (c - a) * tz : d + (c - d) * (1 - tx) + (b - d) * (1 - tz)
}

export function createTerrainGeometry(model: TerrainModel): BufferGeometry {
  const { size, segments, heights, colors } = model
  const positions = new Float32Array(heights.length * 3)
  const indices: number[] = []
  for (let row = 0; row <= segments; row++) {
    for (let col = 0; col <= segments; col++) {
      const i = row * (segments + 1) + col
      positions.set([-size / 2 + col * size / segments, heights[i], -size / 2 + row * size / segments], i * 3)
      if (row < segments && col < segments) {
        const down = i + segments + 1
        indices.push(i, down, i + 1, i + 1, down, down + 1)
      }
    }
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}
