import type { LocalCoordinate } from './geo.ts'
import { pointInCampus } from './roads.ts'
import { distanceToRect, distanceToSegment, footprintRect, terrainGradeAt, terrainHeightAt } from './terrain.ts'
import type { GroundRect, TerrainModel } from './terrain.ts'
import { inCanalOpening } from './canal.ts'
import { flagBlocksWalking } from './campusFlag.ts'
import { inLawnBoundary } from './landscaping.ts'
import { seededRandom, treeTrunkRadius } from './vegetation.ts'
import type { TreeInstance } from './vegetation.ts'
import type { CampusLamp } from './nightLighting.ts'
import type { BuildingFootprint, RoadFootprint } from '../types/osm.ts'
import type { CampusLocation } from '../types/campus.ts'

export const GARDEN_LIMITS = { beds: 128, flowers: 4000, shrubs: 750 } as const
export type GardenPalette = 'warm' | 'rose' | 'cool' | 'meadow'
export const FLOWER_PALETTES = {
  warm: ['#ffb52e', '#ef822b', '#ffe0a0', '#fff5d9'],
  rose: ['#e8759d', '#cf5c86', '#f4acbc', '#fff4e7'],
  cool: ['#ad87da', '#8261b5', '#e2b4dc', '#fff4e7'],
  meadow: ['#fff5dc', '#ffd76c', '#e5ad67', '#eee4cb'],
} as const
export interface GardenBed extends LocalCoordinate { id: string; angle: number; length: number; width: number; palette: GardenPalette }
export interface GardenPlant extends LocalCoordinate { y: number; height: number; radius: number; rotation: number; color: string }
export interface CampusGardens { beds: GardenBed[]; flowers: GardenPlant[]; shrubs: GardenPlant[] }
interface GardenCampus {
  boundary: LocalCoordinate[]; buildings: BuildingFootprint[]; roads: RoadFootprint[]
  clearings: GroundRect[]; terrain: TerrainModel; trees: TreeInstance[]; lamps: CampusLamp[]; locations: CampusLocation[]
}
export const gardenPoint = (bed: GardenBed, along: number, across: number): LocalCoordinate => ({
  x: bed.x + Math.cos(bed.angle) * along - Math.sin(bed.angle) * across,
  z: bed.z + Math.sin(bed.angle) * along + Math.cos(bed.angle) * across,
})
const ringDistance = (p: LocalCoordinate, ring: LocalCoordinate[]) => ring.reduce((d, a, i) => Math.min(d, distanceToSegment(p, a, ring[(i + 1) % ring.length])), Infinity)

// Decorative planting follows the real map. It never changes the height field,
// tree colliders or route graph; beds are low soft planting, without raised walls.
export function generateCampusGardens(campus: GardenCampus): CampusGardens {
  const { boundary, buildings, roads, clearings, terrain, trees, lamps, locations } = campus
  const result: CampusGardens = { beds: [], flowers: [], shrubs: [] }
  if (boundary.length < 3 || !buildings.length) return result
  const random = seededRandom(20261006)
  const rectangles = buildings.map(footprintRect)
  const roadEdges = roads.flatMap(road => road.paths.flatMap(path => path.slice(1).map((b, i) => ({ a: path[i], b, width: road.width }))))
  const legal = (p: LocalCoordinate, radius = .4) => {
    if (!pointInCampus(p, boundary) || ringDistance(p, boundary) < radius + .5
      || rectangles.some(rect => distanceToRect(p, rect) < 3.8 + radius)
      || roadEdges.some(edge => distanceToSegment(p, edge.a, edge.b) < edge.width / 2 + 1.6 + radius)
      || clearings.some(rect => distanceToRect(p, rect) < 1.7 + radius)
      || trees.some(tree => Math.hypot(p.x - tree.x, p.z - tree.z) < treeTrunkRadius(tree) + 1.2 + radius)
      || lamps.some(lamp => Math.hypot(p.x - lamp.x, p.z - lamp.z) < .65 + radius)
      || (terrain.canal && inCanalOpening(p, terrain.canal, 2 + radius))
      || (terrain.flag && flagBlocksWalking(p, terrain.flag, 3 + radius))
      || terrainGradeAt(terrain, p.x, p.z) > .35) return false
    // Keep the known lawns usable: planting follows their edges, leaving the
    // middle open. Utility pads and their approach remain unplanted.
    for (const lawn of terrain.lawns ?? []) {
      if (lawn.hardscape.some(ring => pointInCampus(p, ring) || ringDistance(p, ring) < radius + .5)) return false
      if (inLawnBoundary(p, lawn) && ringDistance(p, lawn.outer) > 3.6) return false
    }
    return true
  }
  const paletteAt = (p: LocalCoordinate): GardenPalette => {
    const nearest = [...locations].sort((a, b) => Math.hypot(p.x - a.coordinates.x, p.z - a.coordinates.z) - Math.hypot(p.x - b.coordinates.x, p.z - b.coordinates.z))[0]
    if (!nearest || Math.hypot(p.x - nearest.coordinates.x, p.z - nearest.coordinates.z) > 140) return 'meadow'
    if (nearest.id === 'main-entrance' || nearest.id === 'administration-block' || nearest.category === 'food') return 'warm'
    return nearest.category === 'hostel' ? 'rose' : 'cool'
  }
  const addBed = (p: LocalCoordinate, angle: number, length: number, width: number, id: string, palette = paletteAt(p)) => {
    if (result.beds.length >= GARDEN_LIMITS.beds || !legal(p)) return
    const bed = { ...p, angle, length, width, id, palette }
    if (result.beds.some(other => Math.hypot(p.x - other.x, p.z - other.z) < (length + other.length) / 2 + 1.5)) return
    for (let i = 0; i < 24; i++) {
      const a = i * Math.PI / 12
      if (!legal(gardenPoint(bed, Math.cos(a) * length / 2, Math.sin(a) * width / 2))) return
    }
    result.beds.push(bed)
  }
  // Plant outside the gate, sports and theatre plazas; their interiors and
  // approaches remain clear. These anchors also work without an OSM building.
  for (const [i, rect] of clearings.entries()) for (const side of [-1, 1]) for (const offset of [-.6, 0, .6]) {
    addBed({ x: rect.x + rect.halfX * offset, z: rect.z + side * (rect.halfZ + 4.2) }, 0, 5, 1.6, `plaza/${i}/front/${side}/${offset}`)
    addBed({ x: rect.x + side * (rect.halfX + 4.2), z: rect.z + rect.halfZ * offset }, Math.PI / 2, 5, 1.6, `plaza/${i}/side/${side}/${offset}`)
  }
  // Entry and building gardens have priority over roadside infill.
  buildings.forEach((building, i) => {
    const rect = rectangles[i]
    for (const side of [-1, 1]) for (const offset of [-.45, .45]) {
      addBed({ x: rect.x + rect.halfX * offset, z: rect.z + side * (rect.halfZ + 6.5) }, 0, 6.2, 2, `${building.id}/front/${side}/${offset}`)
      addBed({ x: rect.x + side * (rect.halfX + 6.5), z: rect.z + rect.halfZ * offset }, Math.PI / 2, 6.2, 2, `${building.id}/side/${side}/${offset}`)
    }
  })
  for (const lawn of terrain.lawns ?? []) for (let i = 0; i < lawn.outer.length; i++) {
    const a = lawn.outer[i], b = lawn.outer[(i + 1) % lawn.outer.length], angle = Math.atan2(b.z - a.z, b.x - a.x)
    const length = Math.hypot(b.x - a.x, b.z - a.z)
    for (let along = 9; along < length - 4; along += 14) for (const side of [-1, 1]) {
      const p = { x: a.x + (b.x - a.x) * along / length - Math.sin(angle) * side * 2, z: a.z + (b.z - a.z) * along / length + Math.cos(angle) * side * 2 }
      if (inLawnBoundary(p, lawn)) addBed(p, angle, 5, 1.4, `${lawn.id}/${i}/${along}`, 'rose')
    }
  }
  const roadsideBeds: { p: LocalCoordinate; angle: number; id: string }[][] = []
  for (const road of [...roads].sort((a, b) => a.id.localeCompare(b.id))) for (const [pathIndex, path] of road.paths.entries()) {
    const candidates: typeof roadsideBeds[number] = []
    let travelled = 0, next = 12, index = 0
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1], b = path[i], length = Math.hypot(b.x - a.x, b.z - a.z), angle = Math.atan2(b.z - a.z, b.x - a.x)
      if (length < .001) continue
      while (next <= travelled + length) {
        const t = (next - travelled) / length, offset = road.width / 2 + 3.8
        for (const side of [index % 2 ? 1 : -1, index % 2 ? -1 : 1]) {
          candidates.push({ p: { x: a.x + (b.x - a.x) * t - Math.sin(angle) * offset * side, z: a.z + (b.z - a.z) * t + Math.cos(angle) * offset * side }, angle, id: `${road.id}/${pathIndex}/${index}/${side}` })
        }
        index++; next += 24
      }
      travelled += length
    }
    // Interleave roads and mix positions along each road, so one long road
    // cannot consume the remaining plant budget before other areas get beds.
    for (let i = candidates.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1)); [candidates[i], candidates[j]] = [candidates[j], candidates[i]]
    }
    roadsideBeds.push(candidates)
  }
  for (let i = 0; i < Math.max(0, ...roadsideBeds.map(beds => beds.length)); i++) for (const beds of roadsideBeds) {
    const candidate = beds[i]
    if (candidate) addBed(candidate.p, candidate.angle, 6, 1.8, candidate.id)
  }
  for (const bed of result.beds) {
    const colors = FLOWER_PALETTES[bed.palette]
    // Fill every bed within the total budget, including the last roadside beds.
    const columns = Math.min(10, Math.floor(bed.length / .48))
    for (let row = -1; row <= 1; row++) for (let col = 0; col < columns; col++) {
      if (result.flowers.length >= GARDEN_LIMITS.flowers) break
      const u = ((col + .5) / columns - .5) * bed.length * .88, v = row * bed.width * .27
      if ((u / (bed.length / 2)) ** 2 + (v / (bed.width / 2)) ** 2 > .81) continue
      const p = gardenPoint(bed, u + (random() - .5) * .1, v + (random() - .5) * .1)
      if (legal(p, .25)) result.flowers.push({ ...p, y: terrainHeightAt(terrain, p.x, p.z), height: .35 + random() * .24, radius: .15 + random() * .06, rotation: random() * Math.PI * 2, color: colors[col % 5 === 0 ? 3 : row === 0 ? 0 : 1 + col % 2] })
    }
    for (const side of [-1, 1]) {
      const p = gardenPoint(bed, side * bed.length * .42, 0)
      if (legal(p, .45)) result.shrubs.push({ ...p, y: terrainHeightAt(terrain, p.x, p.z), height: .48, radius: .46, rotation: random() * Math.PI * 2, color: '#4d7548' })
    }
  }
  // Low understory softens the remaining open ground around existing trees.
  for (const [i, tree] of trees.entries()) {
    if (result.shrubs.length >= GARDEN_LIMITS.shrubs) break
    const angle = tree.rotation + i * .4, distance = 2 + random() * 1.5
    const p = { x: tree.x + Math.cos(angle) * distance, z: tree.z + Math.sin(angle) * distance }
    if (legal(p, .65) && !result.shrubs.some(s => Math.hypot(s.x - p.x, s.z - p.z) < 1.4)) {
      result.shrubs.push({ ...p, y: terrainHeightAt(terrain, p.x, p.z), height: .45 + random() * .22, radius: .48 + random() * .15, rotation: angle, color: i % 3 ? '#53794b' : '#71894f' })
    }
  }
  return result
}
