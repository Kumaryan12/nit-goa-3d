import { gpsToLocal } from './geo.ts'
import type { LocalCoordinate } from './geo.ts'
import { lawnWeightAt } from './landscaping.ts'
import type { LawnPatch } from './landscaping.ts'
import { distanceToRect, distanceToSegment, footprintRect, terrainHeightAt } from './terrain.ts'
import type { TerrainModel } from './terrain.ts'
import { pointInCampus } from './roads.ts'
import type { BuildingFootprint, RoadFootprint } from '../types/osm.ts'

export const INDIAN_FLAG = {
  width: 4.5, height: 3, poleHeight: 18, poleRadius: .12, baseRadius: 1.35,
  spokes: 24, saffron: '#ff9933', white: '#ffffff', green: '#138808', chakra: '#000080',
} as const

// Owner-confirmed lawn opposite Admin; exact mast position and height estimated.
export const campusFlagReference = { lat: 15.1684, lon: 74.01164 }
export interface CampusFlagLayout extends LocalCoordinate {
  y: number
  baseElevation: number
  baseHeight: number
  rotation: number
}

export function createCampusFlag(buildings: BuildingFootprint[], lawns: LawnPatch[], boundary: LocalCoordinate[], roads: RoadFootprint[], terrain: TerrainModel): CampusFlagLayout | null {
  if (!buildings.some(b => b.id === 'way/1423803681')) return null
  const lawn = lawns.find(lawn => lawn.id === 'seminar-south-lawn')
  const p = gpsToLocal(campusFlagReference), radius = INDIAN_FLAG.baseRadius
  if (!lawn || !pointInCampus(p, boundary) || lawnWeightAt(p, [lawn]) < .99
    || buildings.some(b => distanceToRect(p, footprintRect(b)) < radius + 1)
    || roads.some(road => road.paths.some(path => path.slice(1).some((b, i) => distanceToSegment(p, path[i], b) < road.width / 2 + radius + 1)))) return null
  const samples = [terrainHeightAt(terrain, p.x, p.z)]
  for (let i = 0; i < 24; i++) {
    const a = i * Math.PI / 12
    samples.push(terrainHeightAt(terrain, p.x + Math.cos(a) * radius, p.z + Math.sin(a) * radius))
  }
  const baseElevation = Math.min(...samples) - .08, y = Math.max(...samples) + .24
  return { ...p, y, baseElevation, baseHeight: y - baseElevation, rotation: -.25 }
}

export function flagBlocksWalking(point: LocalCoordinate, flag: CampusFlagLayout, radius: number): boolean {
  return Math.hypot(point.x - flag.x, point.z - flag.z) < INDIAN_FLAG.baseRadius + radius
}

export function flagBlocksCamera(point: LocalCoordinate & { y: number }, flag: CampusFlagLayout, radius = .2): boolean {
  if (point.y < flag.baseElevation - radius || point.y > flag.y + INDIAN_FLAG.poleHeight + radius) return false
  const solidRadius = point.y <= flag.y + radius ? INDIAN_FLAG.baseRadius : INDIAN_FLAG.poleRadius
  return Math.hypot(point.x - flag.x, point.z - flag.z) < solidRadius + radius
}
