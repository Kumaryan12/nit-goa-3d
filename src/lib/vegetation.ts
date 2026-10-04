import type { LocalCoordinate } from './geo.ts'
import { pointInCampus } from './roads.ts'
import { distanceToRect, distanceToSegment, footprintRect, terrainHeightAt, terrainGradeAt } from './terrain.ts'
import type { GroundRect, TerrainModel } from './terrain.ts'
import type { BuildingFootprint, RoadFootprint } from '../types/osm.ts'
import { inCanalOpening } from './canal.ts'

export interface TreeInstance { x: number; y: number; z: number; scale: number; rotation: number; palm: boolean; shade: number }
export const TREE_TARGET = 640

export function seededRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296 }
}

export function generateTrees(boundary: LocalCoordinate[], buildings: BuildingFootprint[], roads: RoadFootprint[], clearings: GroundRect[], terrain: TerrainModel, target = TREE_TARGET): TreeInstance[] {
  if (boundary.length < 3) return []
  const random = seededRandom(20261001)
  const rectangles = buildings.map(footprintRect)
  const lines = roads.flatMap((road) => road.paths.flatMap((path) => path.slice(1).map((b, i) => ({ a: path[i], b, width: road.width }))))
  const edges = boundary.slice(1).map((b, i) => ({ a: boundary[i], b }))
  const minX = Math.min(...boundary.map((p) => p.x)), maxX = Math.max(...boundary.map((p) => p.x))
  const minZ = Math.min(...boundary.map((p) => p.z)), maxZ = Math.max(...boundary.map((p) => p.z))
  const result: TreeInstance[] = []
  const buckets = new Map<string, TreeInstance[]>()
  const beside = (a: LocalCoordinate, b: LocalCoordinate, distance: number): LocalCoordinate => {
    const t = random(), length = Math.hypot(b.x - a.x, b.z - a.z) || 1
    const side = random() > 0.5 ? 1 : -1
    return { x: a.x + (b.x - a.x) * t - (b.z - a.z) / length * distance * side, z: a.z + (b.z - a.z) * t + (b.x - a.x) / length * distance * side }
  }
  for (let attempt = 0; result.length < target && attempt < target * 100; attempt++) {
    const mode = random()
    let p: LocalCoordinate
    if (mode < 0.35 && lines.length) {
      const line = lines[Math.floor(random() * lines.length)]
      p = beside(line.a, line.b, line.width / 2 + 7 + random() * 9)
    } else if (mode < 0.6 && rectangles.length) {
      const rect = rectangles[Math.floor(random() * rectangles.length)]
      const side = Math.floor(random() * 4), extra = 7 + random() * 14
      p = side < 2 ? { x: rect.x + (random() * 2 - 1) * rect.halfX, z: rect.z + (side ? 1 : -1) * (rect.halfZ + extra) }
        : { x: rect.x + (side === 2 ? 1 : -1) * (rect.halfX + extra), z: rect.z + (random() * 2 - 1) * rect.halfZ }
    } else if (mode < 0.8 && edges.length) {
      const edge = edges[Math.floor(random() * edges.length)]
      p = beside(edge.a, edge.b, 6 + random() * 12)
    } else p = { x: minX + random() * (maxX - minX), z: minZ + random() * (maxZ - minZ) }
    if (!pointInCampus(p, boundary) || rectangles.some((rect) => distanceToRect(p, rect) < 5)
      || clearings.some((rect) => distanceToRect(p, rect) < 6)
      || lines.some((line) => distanceToSegment(p, line.a, line.b) < line.width / 2 + 4)
      || edges.some((edge) => distanceToSegment(p, edge.a, edge.b) < 3)
      || (terrain.canal && inCanalOpening(p, terrain.canal, 3))
      || terrainGradeAt(terrain, p.x, p.z) > .48) continue
    const bx = Math.floor(p.x / 7), bz = Math.floor(p.z / 7)
    let occupied = false
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      if (buckets.get(`${bx + dx},${bz + dz}`)?.some((tree) => Math.hypot(tree.x - p.x, tree.z - p.z) < 7)) occupied = true
    }
    if (occupied) continue
    const tree = { ...p, y: terrainHeightAt(terrain, p.x, p.z), scale: 0.8 + random() * 0.55, rotation: random() * Math.PI * 2, palm: random() < 0.4, shade: random() }
    result.push(tree)
    const key = `${bx},${bz}`
    if (!buckets.has(key)) buckets.set(key, [])
    buckets.get(key)!.push(tree)
  }
  return result
}
