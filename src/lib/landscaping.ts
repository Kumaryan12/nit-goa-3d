import { campusLawnReferences } from '../data/landscaping.ts'
import { gpsToLocal } from './geo.ts'
import type { LocalCoordinate } from './geo.ts'
import { pointInCampus } from './roads.ts'
import type { BuildingFootprint } from '../types/osm.ts'

export interface LawnPatch {
  id: string
  outer: LocalCoordinate[]
  hardscape: LocalCoordinate[][]
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number }
}

export function createCampusLawns(buildings: BuildingFootprint[]): LawnPatch[] {
  const ids = new Set(buildings.map(building => building.id))
  return campusLawnReferences.filter(lawn => ids.has(lawn.buildingId)).map(lawn => {
    const outer = lawn.outer.map(gpsToLocal)
    return {
      id: lawn.id, outer, hardscape: lawn.hardscape.map(ring => ring.map(gpsToLocal)),
      bounds: { minX: Math.min(...outer.map(p => p.x)), maxX: Math.max(...outer.map(p => p.x)), minZ: Math.min(...outer.map(p => p.z)), maxZ: Math.max(...outer.map(p => p.z)) },
    }
  })
}

export function inLawnBoundary(point: LocalCoordinate, lawn: LawnPatch): boolean {
  const b = lawn.bounds
  return point.x >= b.minX && point.x <= b.maxX && point.z >= b.minZ && point.z <= b.maxZ && pointInCampus(point, lawn.outer)
}

function edgeDistance(point: LocalCoordinate, ring: LocalCoordinate[]): number {
  let distance = Infinity
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[j], b = ring[i], dx = b.x - a.x, dz = b.z - a.z
    const lengthSquared = dx * dx + dz * dz
    const t = lengthSquared ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.z - a.z) * dz) / lengthSquared)) : 0
    distance = Math.min(distance, Math.hypot(point.x - a.x - t * dx, point.z - a.z - t * dz))
  }
  return distance
}

// A short fade avoids harsh grid-cell edges; hardscape holes keep their paving.
export function lawnWeightAt(point: LocalCoordinate, lawns: LawnPatch[]): number {
  let weight = 0
  for (const lawn of lawns) {
    if (!inLawnBoundary(point, lawn) || lawn.hardscape.some(ring => pointInCampus(point, ring))) continue
    const distance = Math.min(edgeDistance(point, lawn.outer), ...lawn.hardscape.map(ring => edgeDistance(point, ring)))
    const t = Math.min(1, distance / 1.8)
    weight = Math.max(weight, t * t * (3 - 2 * t))
  }
  return weight
}
