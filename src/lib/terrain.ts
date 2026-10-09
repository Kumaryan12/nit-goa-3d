import { BufferGeometry, Color, Float32BufferAttribute } from 'three'
import { gpsToLocal } from './geo.ts'
import type { LocalCoordinate } from './geo.ts'
import { slopeElevationAt, terraceElevationAt } from './topography.ts'
import type { SlopePatch, TerrainSlope } from './topography.ts'
import { pointInCampus } from './roads.ts'
import type { BuildingFootprint, RoadFootprint } from '../types/osm.ts'
import { canalPoint, cutCanalTriangle } from './canal.ts'
import type { CanalLayout, TerrainCutVertex } from './canal.ts'
import type { TheatreLayout } from './theatre.ts'
import { lawnWeightAt } from './landscaping.ts'
import type { LawnPatch } from './landscaping.ts'
import type { CampusFlagLayout } from './campusFlag.ts'
import type { MainEntranceLayout } from './mainEntrance.ts'

export interface GroundRect { x: number; z: number; halfX: number; halfZ: number; benchBuildingId?: string }
export interface TerrainModel {
  size: number
  segments: number
  heights: Float32Array
  colors: Float32Array
  canal?: CanalLayout
  theatre?: TheatreLayout
  lawns?: LawnPatch[]
  flag?: CampusFlagLayout
  entrance?: MainEntranceLayout
}
export interface TerrainFeatures {
  boundary: LocalCoordinate[]
  buildings: BuildingFootprint[]
  roads: RoadFootprint[]
  clearings: GroundRect[]
  slope?: TerrainSlope
  slopePatches?: SlopePatch[]
  canal?: CanalLayout
  lawns?: LawnPatch[]
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

export function generateTerrain(size: number, features: TerrainFeatures, segments = features.slope || features.slopePatches?.length ? 512 : 160): TerrainModel {
  if (!Number.isFinite(size) || size <= 0 || !Number.isInteger(segments) || segments < 2 || segments > 512) throw new Error('Invalid terrain dimensions')
  const rectangles = [...features.buildings.map(footprintRect), ...features.clearings]
  const roadSegments = features.roads.flatMap((road) => road.paths.flatMap((path) => path.slice(1).map((b, i) => ({ a: path[i], b, radius: road.width / 2 }))))
  const boundarySegments = features.boundary.slice(1).map((b, i) => ({ a: features.boundary[i], b }))
  const heights = new Float32Array((segments + 1) ** 2)
  const colors = new Float32Array(heights.length * 3)
  const beige = new Color('#d1caba'), grass = new Color('#477e58'), outside = new Color('#3f6950')
  const meadowHighlight = new Color('#638b5e'), meadowColor = new Color()
  const lawnGrass = new Color('#559665')
  const color = new Color()
  const hasRelief = !!features.slope || !!features.slopePatches?.length
  const terraceHeights = rectangles.map(rect => terraceElevationAt(rect, features.slope, features.slopePatches))
  // The cell diagonal protects every triangle intersecting a sloped terrace
  // while leaving space for a graded road beside it. Flat terrain keeps its
  // wider clearance. Roads follow the base grade when a slope exists.
  const flatBuffer = (size / segments) * (hasRelief ? Math.SQRT2 : 2)
  // Expanded foundations that touch must share a bench: one terrain triangle
  // cannot support two different heights beneath neighboring footprints.
  if (hasRelief) {
    const groups = features.buildings.map((_, index) => index)
    const root = (index: number): number => groups[index] === index ? index : (groups[index] = root(groups[index]))
    for (let a = 0; a < groups.length; a++) for (let b = a + 1; b < groups.length; b++) {
      const one = rectangles[a], two = rectangles[b]
      const gap = Math.hypot(Math.max(0, Math.abs(one.x - two.x) - one.halfX - two.halfX), Math.max(0, Math.abs(one.z - two.z) - one.halfZ - two.halfZ))
      if (gap < flatBuffer * 2) groups[root(b)] = root(a)
    }
    const benches = new Map<number, number>()
    groups.forEach((_, index) => benches.set(root(index), Math.max(benches.get(root(index)) ?? -Infinity, terraceHeights[index])))
    groups.forEach((_, index) => { terraceHeights[index] = benches.get(root(index))! })
    // An adjacent outdoor plaza shares its host building's resolved bench,
    // including merged foundations, instead of cutting into that foundation.
    features.clearings.forEach((clearing, index) => {
      const building = features.buildings.findIndex(item => item.id === clearing.benchBuildingId)
      if (building >= 0) terraceHeights[features.buildings.length + index] = terraceHeights[building]
    })
  }
  for (let row = 0; row <= segments; row++) {
    for (let col = 0; col <= segments; col++) {
      const point = { x: -size / 2 + col * size / segments, z: -size / 2 + row * size / segments }
      let settlementDistance = Infinity
      let terraceDistance = Infinity, terraceHeight = 0
      let terraceWeight = 0, weightedHeight = 0, gradeWeight = 1
      for (let r = 0; r < rectangles.length; r++) {
        const rect = rectangles[r]
        const distance = distanceToRect(point, rect)
        settlementDistance = Math.min(settlementDistance, distance)
        if (distance < terraceDistance) { terraceDistance = distance; terraceHeight = terraceHeights[r] }
        if (hasRelief) {
          const weight = 1 - smooth((distance - flatBuffer) / 20)
          terraceWeight += weight
          weightedHeight += terraceHeights[r] * weight
          gradeWeight *= 1 - weight
        }
      }
      let roadDistance = Infinity
      for (const line of roadSegments) roadDistance = Math.min(roadDistance, Math.max(0, distanceToSegment(point, line.a, line.b) - line.radius))
      settlementDistance = Math.min(settlementDistance, roadDistance)
      let boundaryDistance = Infinity
      for (const line of boundarySegments) boundaryDistance = Math.min(boundaryDistance, distanceToSegment(point, line.a, line.b))
      const blend = smooth((Math.min(settlementDistance, boundaryDistance) - flatBuffer) / 35)
      const noise = terrainNoise(point.x, point.z)
      const index = row * (segments + 1) + col
      const grade = slopeElevationAt(point, features.slope, features.slopePatches)
      // Blend all nearby benches outside protected foundations. Selecting only
      // the nearest bench caused a height jump at the boundary between two
      // terraces, visible as a crease across the Admin slope.
      let base = !hasRelief ? 0 : terraceDistance <= flatBuffer ? terraceHeight
        : terraceWeight > 0 ? weightedHeight / terraceWeight * (1 - gradeWeight) + grade * gradeWeight : grade
      if (hasRelief) {
        // Roads follow the described grade. Footprint
        // protection takes priority wherever a road hugs a building terrace.
        // A roadside service block may sit below the road bench. Give that
        // transition sixteen meters instead of squeezing it into one grid cell.
        const roadBlend = (1 - smooth((roadDistance - flatBuffer) / 10)) * smooth((terraceDistance - flatBuffer) / 16)
        base = base * (1 - roadBlend) + grade * roadBlend
      }
      // Once campus relief is known, use only those grades and terraces. Random
      // raised mounds would imply earth banks the owner says do not exist.
      heights[index] = hasRelief ? base : blend * (0.25 + noise * 1.5 + terrainNoise(point.x, point.z, 32) * 0.35)
      if (features.boundary.length && pointInCampus(point, features.boundary)) {
        // A narrow stone apron gives way to planted ground. The old 45 m
        // transition made almost every space between buildings look bare.
        meadowColor.copy(grass).lerp(meadowHighlight, terrainNoise(point.x, point.z, 28) * .35)
        color.copy(beige).lerp(meadowColor, smooth((settlementDistance - 2.5) / 9))
        // Paint the existing ground, preserving the exact height field and
        // road/building/plaza aprons. No floating turf or extra collision layer.
        const lawn = lawnWeightAt(point, features.lawns ?? []) * smooth(settlementDistance / 2.5)
        if (lawn > 0) color.lerp(lawnGrass, lawn)
      } else color.copy(outside)
      color.multiplyScalar(0.93 + noise * 0.09 + terrainNoise(point.x, point.z, 12) * 0.08)
      color.toArray(colors, index * 3)
    }
  }
  return { size, segments, heights, colors, ...(features.canal ? { canal: features.canal } : {}), ...(features.lawns?.length ? { lawns: features.lawns } : {}) }
}

export function terrainGradeAt(model: TerrainModel, x: number, z: number): number {
  const { size, segments, heights } = model, cell = size / segments
  const gx = Math.max(0, Math.min(segments, (x / size + .5) * segments)), gz = Math.max(0, Math.min(segments, (z / size + .5) * segments))
  const col = Math.min(segments - 1, Math.floor(gx)), row = Math.min(segments - 1, Math.floor(gz)), stride = segments + 1
  const a = heights[row * stride + col], b = heights[row * stride + col + 1], c = heights[(row + 1) * stride + col], d = heights[(row + 1) * stride + col + 1]
  return gx - col + gz - row <= 1 ? Math.hypot(b - a, c - a) / cell : Math.hypot(d - c, d - b) / cell
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
  const extraPositions: number[] = [], extraColors: number[] = []
  const canal = model.canal
  const corners = canal ? [-1, 1].flatMap(a => [-1, 1].map(b => canalPoint(canal, a * canal.length / 2, b * (canal.width / 2 + canal.bankWidth)))) : []
  const cutBounds = canal ? { minX: Math.min(...corners.map(p => p.x)), maxX: Math.max(...corners.map(p => p.x)), minZ: Math.min(...corners.map(p => p.z)), maxZ: Math.max(...corners.map(p => p.z)) } : null
  const vertex = (index: number): TerrainCutVertex => ({ x: positions[index * 3], y: positions[index * 3 + 1], z: positions[index * 3 + 2], r: colors[index * 3], g: colors[index * 3 + 1], b: colors[index * 3 + 2] })
  const addCutTriangle = (triangle: number[]) => {
    for (const polygon of cutCanalTriangle(triangle.map(vertex), canal!)) {
      const start = heights.length + extraPositions.length / 3
      for (const p of polygon) { extraPositions.push(p.x, p.y, p.z); extraColors.push(p.r, p.g, p.b) }
      for (let i = 1; i < polygon.length - 1; i++) {
        const a = polygon[0], b = polygon[i], c = polygon[i + 1]
        if (Math.abs((b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x)) > 1e-8) indices.push(start, start + i, start + i + 1)
      }
    }
  }
  // Populate the complete height field before clipping cells; downstream grid
  // vertices must already exist when their triangle intersects the narrow cut.
  for (let row = 0; row <= segments; row++) {
    for (let col = 0; col <= segments; col++) {
      const i = row * (segments + 1) + col
      positions.set([-size / 2 + col * size / segments, heights[i], -size / 2 + row * size / segments], i * 3)
    }
  }
  for (let row = 0; row < segments; row++) for (let col = 0; col < segments; col++) {
    const i = row * (segments + 1) + col, down = i + segments + 1
    const x = positions[i * 3], z = positions[i * 3 + 2], cell = size / segments
    if (cutBounds && x < cutBounds.maxX && x + cell > cutBounds.minX && z < cutBounds.maxZ && z + cell > cutBounds.minZ) {
      addCutTriangle([i, down, i + 1]); addCutTriangle([i + 1, down, down + 1])
    } else indices.push(i, down, i + 1, i + 1, down, down + 1)
  }
  const allPositions = new Float32Array(positions.length + extraPositions.length), allColors = new Float32Array(colors.length + extraColors.length)
  allPositions.set(positions); allPositions.set(extraPositions, positions.length)
  allColors.set(colors); allColors.set(extraColors, colors.length)
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(allPositions, 3))
  geometry.setAttribute('color', new Float32BufferAttribute(allColors, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}
