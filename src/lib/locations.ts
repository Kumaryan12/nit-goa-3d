import { campusLocations } from '../data/campus.ts'
import type { BuildingSelection, CampusLocation } from '../types/campus.ts'
import type { LocalCoordinate } from './geo.ts'

export function selectionForLocation(locationId: string, locations: CampusLocation[] = campusLocations, assignments: BuildingSelection[] = []): BuildingSelection | null {
  const location = locations.find((item) => item.id === locationId)
  if (!location) return null
  const assignment = assignments.find((item) => item.location.id === locationId)
  return { buildingId: assignment?.buildingId ?? null, location, matchMethod: assignment?.matchMethod ?? 'unmatched' }
}

export function campusCenter(boundary: LocalCoordinate[]): LocalCoordinate {
  if (boundary.length < 3) return { x: 0, z: 0 }
  let twiceArea = 0, x = 0, z = 0
  for (let i = 0; i < boundary.length; i++) {
    const a = boundary[i], b = boundary[(i + 1) % boundary.length]
    const cross = a.x * b.z - b.x * a.z
    twiceArea += cross; x += (a.x + b.x) * cross; z += (a.z + b.z) * cross
  }
  return Math.abs(twiceArea) < 1e-6 ? { x: 0, z: 0 } : { x: x / (3 * twiceArea), z: z / (3 * twiceArea) }
}

export function locationDistance(a: LocalCoordinate, b: LocalCoordinate): number { return Math.hypot(a.x - b.x, a.z - b.z) }
export function nearbyLocations(location: CampusLocation, locations: CampusLocation[], limit = 3) {
  return locations.filter((item) => item.id !== location.id).map((item) => ({ location: item, distance: locationDistance(location.coordinates, item.coordinates) }))
    .sort((a, b) => a.distance - b.distance || a.location.id.localeCompare(b.location.id)).slice(0, Math.max(0, limit))
}
