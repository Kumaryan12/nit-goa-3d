import type { LocalCoordinate } from './geo.ts'
import type { WalkingRoute } from './pathfinding.ts'
export interface RoutePresentation { route: WalkingRoute; start: LocalCoordinate; end: LocalCoordinate; startName: string; endName: string }
export interface Playback { status: 'stopped' | 'playing' | 'paused' | 'complete'; speed: 1 | 2 | 4; sequence: number }
export function routePoints(presentation: RoutePresentation): LocalCoordinate[] {
  return [presentation.start, ...presentation.route.path, presentation.end].filter((p, i, points) => !i || Math.hypot(p.x - points[i - 1].x, p.z - points[i - 1].z) > 0.001)
}
export function cumulativeDistances(path: LocalCoordinate[]): number[] {
  const lengths = [0]
  for (let i = 1; i < path.length; i++) lengths.push(lengths[i - 1] + Math.hypot(path[i].x - path[i - 1].x, path[i].z - path[i - 1].z))
  return lengths
}
export function positionAtDistance(path: LocalCoordinate[], lengths: number[], distance: number): LocalCoordinate {
  if (!path.length) return { x: 0, z: 0 }
  if (distance <= 0) return path[0]
  let low = 1, high = lengths.length - 1
  while (low < high) { const middle = (low + high) >> 1; if (lengths[middle] < distance) low = middle + 1; else high = middle }
  const i = Math.min(low, path.length - 1), a = path[Math.max(0, i - 1)], b = path[i]
  const t = Math.max(0, Math.min(1, (distance - (lengths[i - 1] ?? 0)) / (lengths[i] - (lengths[i - 1] ?? 0) || 1)))
  return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t }
}
