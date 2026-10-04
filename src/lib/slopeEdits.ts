import type { CampusSlope } from '../data/topography.ts'

export const MAX_CAMPUS_SLOPES = 20

export function validateCampusSlope(value: unknown): CampusSlope {
  if (!value || typeof value !== 'object') throw new Error('Choose both ends of the slope.')
  const slope = value as CampusSlope
  if (typeof slope.id !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(slope.id)) throw new Error('Invalid slope ID.')
  if (typeof slope.name !== 'string' || !slope.name.trim() || slope.name.trim().length > 80) throw new Error('Give the slope a name (up to 80 characters).')
  const point = (p: CampusSlope['lower']) => {
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.z) || Math.max(Math.abs(p.x), Math.abs(p.z)) > 5000) throw new Error('Pick both ends within the campus area.')
    return { x: Math.round(p.x * 100) / 100, z: Math.round(p.z * 100) / 100 }
  }
  const lower = point(slope.lower), upper = point(slope.upper)
  if (Math.hypot(upper.x - lower.x, upper.z - lower.z) < 8) throw new Error('Pick ends at least 8 meters apart.')
  if (!Number.isFinite(slope.riseMeters) || slope.riseMeters < 0.5 || slope.riseMeters > 24) throw new Error('Choose a rise between 0.5 and 24 meters.')
  if (!Number.isFinite(slope.widthMeters) || slope.widthMeters < 8 || slope.widthMeters > 120) throw new Error('Choose a width between 8 and 120 meters.')
  return { id: slope.id, name: slope.name.trim(), lower, upper, riseMeters: slope.riseMeters, widthMeters: slope.widthMeters }
}

export function readCampusSlopes(value: unknown): CampusSlope[] {
  if (!Array.isArray(value)) return []
  const result: CampusSlope[] = [], ids = new Set<string>()
  for (const candidate of value.slice(0, MAX_CAMPUS_SLOPES)) {
    try {
      const slope = validateCampusSlope(candidate)
      if (!ids.has(slope.id)) { result.push(slope); ids.add(slope.id) }
    } catch { /* Discard corrupt saved entries without losing the valid slopes. */ }
  }
  return result
}
