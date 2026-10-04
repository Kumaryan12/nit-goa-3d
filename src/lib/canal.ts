import { entranceCanal } from '../data/waterways.ts'
import type { LocalCoordinate } from './geo.ts'
import type { RoadFootprint } from '../types/osm.ts'

export interface CanalLayout {
  center: LocalCoordinate
  along: LocalCoordinate
  across: LocalCoordinate
  length: number
  width: number
  bankWidth: number
  depth: number
  bridge: { length: number; width: number; roadIds: string[] }
}

function projectOnRoad(point: LocalCoordinate, road: RoadFootprint) {
  let nearest: { point: LocalCoordinate; distance: number; direction: LocalCoordinate } | null = null
  for (const path of road.paths) for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i], dx = b.x - a.x, dz = b.z - a.z, length = Math.hypot(dx, dz)
    if (length < 0.001) continue
    const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.z - a.z) * dz) / length ** 2))
    const projected = { x: a.x + dx * t, z: a.z + dz * t }, distance = Math.hypot(projected.x - point.x, projected.z - point.z)
    if (!nearest || distance < nearest.distance) nearest = { point: projected, distance, direction: { x: dx / length, z: dz / length } }
  }
  return nearest
}

export function createEntranceCanal(roads: RoadFootprint[], entrance: LocalCoordinate): CanalLayout | undefined {
  const pair = entranceCanal.roadIds.map(id => roads.find(road => road.id === id))
  if (!pair[0] || !pair[1]) return undefined // Do not invent a crossing before the entrance roads load.
  const entry = projectOnRoad(entrance, pair[0])
  if (!entry || entry.distance > 45) return undefined
  const across = entry.direction.x < 0 ? { x: -entry.direction.x, z: -entry.direction.z } : entry.direction
  const target = { x: entrance.x + across.x * entranceCanal.insideGateMeters, z: entrance.z + across.z * entranceCanal.insideGateMeters }
  const first = projectOnRoad(target, pair[0]), second = projectOnRoad(target, pair[1])
  if (!first || !second || first.distance > 25 || second.distance > 25) return undefined
  const separation = Math.hypot(first.point.x - second.point.x, first.point.z - second.point.z)
  if (separation > 20) return undefined
  return {
    center: { x: (first.point.x + second.point.x) / 2, z: (first.point.z + second.point.z) / 2 },
    across, along: { x: -across.z, z: across.x },
    length: entranceCanal.lengthMeters, width: entranceCanal.waterWidthMeters,
    bankWidth: entranceCanal.bankWidthMeters, depth: entranceCanal.depthMeters,
    bridge: { length: entranceCanal.bridgeSpanMeters, width: separation + Math.max(pair[0].width, pair[1].width) + 2.4, roadIds: [...entranceCanal.roadIds] },
  }
}

export function canalCoordinates(point: LocalCoordinate, canal: CanalLayout): { along: number; across: number } {
  const dx = point.x - canal.center.x, dz = point.z - canal.center.z
  return { along: dx * canal.along.x + dz * canal.along.z, across: dx * canal.across.x + dz * canal.across.z }
}

export function canalPoint(canal: CanalLayout, along: number, across = 0): LocalCoordinate {
  return { x: canal.center.x + canal.along.x * along + canal.across.x * across, z: canal.center.z + canal.along.z * along + canal.across.z * across }
}

export function inCanalOpening(point: LocalCoordinate, canal: CanalLayout, buffer = 0): boolean {
  const local = canalCoordinates(point, canal)
  return Math.abs(local.along) < canal.length / 2 + buffer && Math.abs(local.across) < canal.width / 2 + canal.bankWidth + buffer
}

export function canalBlocksWalking(point: LocalCoordinate, canal: CanalLayout, radius: number): boolean {
  const local = canalCoordinates(point, canal)
  // The deck follows the same road surface sampled by avatars and route previews.
  const onDeck = Math.abs(local.along) <= canal.bridge.width / 2 - 0.25 - radius
    && Math.abs(local.across) <= canal.bridge.length / 2 + radius
  if (inCanalOpening(point, canal, radius) && !onDeck) return true
  // Solid outer parapets also block stepping sideways off the bridge approach.
  return Math.abs(local.across) <= canal.bridge.length / 2 + radius
    && Math.abs(Math.abs(local.along) - (canal.bridge.width / 2 - 0.14)) < radius + 0.14
}

export interface TerrainCutVertex extends LocalCoordinate { y: number; r: number; g: number; b: number }

/** Subtract the exact canal opening from one terrain triangle, preserving its grade and colors. */
export function cutCanalTriangle(vertices: TerrainCutVertex[], canal: CanalLayout): TerrainCutVertex[][] {
  const local = vertices.map(vertex => canalCoordinates(vertex, canal))
  const halfLength = canal.length / 2, halfWidth = canal.width / 2 + canal.bankWidth
  if (Math.min(...local.map(p => p.along)) >= halfLength || Math.max(...local.map(p => p.along)) <= -halfLength
    || Math.min(...local.map(p => p.across)) >= halfWidth || Math.max(...local.map(p => p.across)) <= -halfWidth) return [vertices]
  const planes = [
    (p: LocalCoordinate) => canalCoordinates(p, canal).along + halfLength,
    (p: LocalCoordinate) => halfLength - canalCoordinates(p, canal).along,
    (p: LocalCoordinate) => canalCoordinates(p, canal).across + halfWidth,
    (p: LocalCoordinate) => halfWidth - canalCoordinates(p, canal).across,
  ]
  const clip = (polygon: TerrainCutVertex[], plane: (p: LocalCoordinate) => number, inside: boolean) => {
    const output: TerrainCutVertex[] = []
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i], b = polygon[(i + 1) % polygon.length], da = plane(a), db = plane(b)
      const keepA = inside ? da >= 0 : da <= 0, keepB = inside ? db >= 0 : db <= 0
      if (keepA) output.push(a)
      if (keepA !== keepB) {
        const t = da / (da - db)
        output.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t,
          r: a.r + (b.r - a.r) * t, g: a.g + (b.g - a.g) * t, b: a.b + (b.b - a.b) * t })
      }
    }
    return output
  }
  let remainder = vertices
  const pieces: TerrainCutVertex[][] = []
  for (const plane of planes) {
    if (remainder.length < 3) break
    const outside = clip(remainder, plane, false)
    if (outside.length >= 3) pieces.push(outside)
    remainder = clip(remainder, plane, true)
  }
  return pieces
}
