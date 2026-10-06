import type { LocalCoordinate } from './geo.ts'
import type { DigitalTwin } from './digitalTwin.ts'
import { pointInCampus } from './roads.ts'
import { distanceToRect, distanceToSegment, footprintRect, terrainGradeAt, terrainHeightAt } from './terrain.ts'
import { inCanalOpening } from './canal.ts'
import { flagBlocksWalking } from './campusFlag.ts'
import { seededRandom, treeTrunkRadius } from './vegetation.ts'

export const MEADOW_LIMIT = 10000
export const MEADOW_CHUNK_SIZE = 48
export interface MeadowTuft extends LocalCoordinate { y: number; height: number; width: number; rotation: number; shade: number }
export interface MeadowChunk { id: string; center: [number, number, number]; radius: number; tufts: MeadowTuft[] }
type MeadowCampus = Pick<DigitalTwin, 'boundary' | 'buildings' | 'roads' | 'vegetationClearings' | 'terrain' | 'trees' | 'lamps' | 'gardens'>
const ringDistance = (p: LocalCoordinate, ring: LocalCoordinate[]) => Math.min(...ring.map((a, i) => distanceToSegment(p, a, ring[(i + 1) % ring.length])))

// Worker-only decorative planting. Low grass has no collider and leaves every
// road, building apron, court, theatre approach and utility pad accessible.
export function generateCampusMeadow(campus: MeadowCampus): MeadowChunk[] {
  const { boundary, buildings, roads, vegetationClearings, terrain, trees, lamps, gardens } = campus
  if (boundary.length < 3 || !buildings.length) return []
  const random = seededRandom(20261007), rects = buildings.map(footprintRect)
  const lines = roads.flatMap(r => r.paths.flatMap(path => path.slice(1).map((b, i) => ({ a: path[i], b, width: r.width }))))
  const minX = Math.min(...boundary.map(p => p.x)), maxX = Math.max(...boundary.map(p => p.x))
  const minZ = Math.min(...boundary.map(p => p.z)), maxZ = Math.max(...boundary.map(p => p.z))
  const candidates: LocalCoordinate[] = []
  for (let z = minZ; z < maxZ; z += 2.5) for (let x = minX; x < maxX; x += 2.5) candidates.push({ x: x + random() * 2.5, z: z + random() * 2.5 })
  // Shuffle before applying the cap so every part of campus receives planting.
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1)); [candidates[i], candidates[j]] = [candidates[j], candidates[i]]
  }
  const chunks = new Map<string, MeadowTuft[]>(); let count = 0
  for (const p of candidates) {
    if (count >= MEADOW_LIMIT) break
    if (!pointInCampus(p, boundary) || ringDistance(p, boundary) < 1
      || rects.some(r => distanceToRect(p, r) < 6.5)
      || lines.some(l => distanceToSegment(p, l.a, l.b) < l.width / 2 + 6.5)
      || vegetationClearings.some(r => distanceToRect(p, r) < 6.5)
      || trees.some(t => Math.hypot(p.x - t.x, p.z - t.z) < treeTrunkRadius(t) + .8)
      || lamps.some(l => Math.hypot(p.x - l.x, p.z - l.z) < 1)
      || (terrain.canal && inCanalOpening(p, terrain.canal, 1.5))
      || (terrain.flag && flagBlocksWalking(p, terrain.flag, 2.5))
      || terrainGradeAt(terrain, p.x, p.z) > .4
      || terrain.lawns?.some(lawn => lawn.hardscape.some(ring => pointInCampus(p, ring) || ringDistance(p, ring) < .8))
      || gardens.beds.some(b => {
        const dx = p.x - b.x, dz = p.z - b.z
        const along = dx * Math.cos(b.angle) + dz * Math.sin(b.angle), across = -dx * Math.sin(b.angle) + dz * Math.cos(b.angle)
        return (along / (b.length / 2 + .6)) ** 2 + (across / (b.width / 2 + .6)) ** 2 < 1
      }) || gardens.shrubs.some(s => Math.hypot(p.x - s.x, p.z - s.z) < s.radius + .5)) continue
    const tuft = { ...p, y: terrainHeightAt(terrain, p.x, p.z) + .012, height: .18 + random() * .18, width: .28 + random() * .22, rotation: random() * Math.PI * 2, shade: random() }
    const id = `${Math.floor(p.x / MEADOW_CHUNK_SIZE)}/${Math.floor(p.z / MEADOW_CHUNK_SIZE)}`
    if (!chunks.has(id)) chunks.set(id, [])
    chunks.get(id)!.push(tuft); count++
  }
  return [...chunks].sort(([a], [b]) => a.localeCompare(b)).map(([id, tufts]) => {
    const lo = [Math.min(...tufts.map(t => t.x)), Math.min(...tufts.map(t => t.y)), Math.min(...tufts.map(t => t.z))]
    const hi = [Math.max(...tufts.map(t => t.x)), Math.max(...tufts.map(t => t.y + t.height)), Math.max(...tufts.map(t => t.z))]
    const center: [number, number, number] = [0, 1, 2].map(i => (lo[i] + hi[i]) / 2) as [number, number, number]
    return { id, tufts, center, radius: Math.hypot(...hi.map((v, i) => v - center[i])) + .6 }
  })
}

export function nearbyMeadowChunks(chunks: MeadowChunk[], camera: { x: number; y: number; z: number }, level: number): Set<number> {
  const quality = Math.max(0, Math.min(2, Math.floor(level))), distance = [65, 95, 125][quality], limit = [6, 9, 12][quality]
  return new Set(chunks.map((c, index) => ({ index, distance: Math.hypot(camera.x - c.center[0], camera.y - c.center[1], camera.z - c.center[2]) - c.radius }))
    .filter(c => c.distance <= distance).sort((a, b) => a.distance - b.distance || a.index - b.index).slice(0, limit).map(c => c.index))
}
