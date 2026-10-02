import type { LocalCoordinate } from './geo.ts'
export type Turn = 'continue' | 'slight-left' | 'left' | 'sharp-left' | 'slight-right' | 'right' | 'sharp-right' | 'arrive'
export interface DirectionStep { turn: Turn; distance: number; instruction: string }
export const pathDistance = (path: LocalCoordinate[]) => path.slice(1).reduce((sum, p, i) => sum + Math.hypot(p.x - path[i].x, p.z - path[i].z), 0)
export function classifyTurn(degrees: number): Turn {
  const angle = Math.abs(degrees)
  if (angle < 18) return 'continue'
  const side = degrees > 0 ? 'right' : 'left'
  return angle < 45 ? `slight-${side}` : angle < 125 ? side : `sharp-${side}`
}
export function headingChange(a: LocalCoordinate, b: LocalCoordinate, c: LocalCoordinate): number {
  const x = b.x - a.x, z = b.z - a.z, nx = c.x - b.x, nz = c.z - b.z
  return Math.atan2(x * nz - z * nx, x * nx + z * nz) * 180 / Math.PI
}
// RDP only simplifies instruction headings; the rendered/routed coordinates stay intact.
export function simplifyHeadings(path: LocalCoordinate[], tolerance = 3): LocalCoordinate[] {
  if (path.length < 3) return path
  const a = path[0], b = path[path.length - 1], dx = b.x - a.x, dz = b.z - a.z
  let farthest = 0, index = 0
  path.slice(1, -1).forEach((p, i) => {
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz || 1)))
    const d = Math.hypot(p.x - a.x - t * dx, p.z - a.z - t * dz)
    if (d > farthest) { farthest = d; index = i + 1 }
  })
  return farthest <= tolerance ? [a, b] : [...simplifyHeadings(path.slice(0, index + 1), tolerance).slice(0, -1), ...simplifyHeadings(path.slice(index), tolerance)]
}
const phrases: Record<Turn, string> = { continue: 'Continue', 'slight-left': 'Bear slightly left', left: 'Turn left', 'sharp-left': 'Turn sharply left', 'slight-right': 'Bear slightly right', right: 'Turn right', 'sharp-right': 'Turn sharply right', arrive: 'Arrive' }
export function routeDirections(path: LocalCoordinate[], destination: string): DirectionStep[] {
  const headings = simplifyHeadings(path)
  const steps: DirectionStep[] = []
  let distance = 0, turn: Turn = 'continue'
  for (let i = 1; i < headings.length; i++) {
    const next = i > 1 ? classifyTurn(headingChange(headings[i - 2], headings[i - 1], headings[i])) : 'continue'
    if (next !== 'continue' && distance >= 8) {
      steps.push({ turn, distance, instruction: `${phrases[turn]} for ${Math.round(distance)} m` }); distance = 0; turn = next
    }
    distance += Math.hypot(headings[i].x - headings[i - 1].x, headings[i].z - headings[i - 1].z)
  }
  if (distance) steps.push({ turn, distance, instruction: `${phrases[turn]} for ${Math.round(distance)} m` })
  // Distribute measured road length across simplified heading groups to preserve total distance.
  const total = steps.reduce((sum, step) => sum + step.distance, 0), actual = pathDistance(path)
  for (const step of steps) { step.distance *= total ? actual / total : 1; step.instruction = `${phrases[step.turn]} for ${Math.round(step.distance)} m` }
  steps.push({ turn: 'arrive', distance: 0, instruction: `${destination} anchor is ahead` })
  return steps
}
