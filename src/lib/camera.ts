import { campusLocations } from '../data/campus.ts'
import type { CampusLocation } from '../types/campus.ts'
import type { LocalCoordinate } from './geo.ts'

export interface CameraView { position: [number, number, number]; target: [number, number, number] }
export interface CameraRequest { sequence: number; locationId: string | null }

export function lookupCameraLocation(locationId: string, locations: CampusLocation[] = campusLocations): CampusLocation | null {
  const location = locations.find((item) => item.id === locationId)
  return location && Number.isFinite(location.coordinates.x) && Number.isFinite(location.coordinates.z) ? location : null
}

export function flyToLocation(locationId: string, locations: CampusLocation[] = campusLocations, height = 0): CameraView | null {
  const location = lookupCameraLocation(locationId, locations)
  if (!location) return null
  const { x, z } = location.coordinates
  const y = Number.isFinite(height) ? Math.max(0, height * 0.45) : 0
  const offset = location.category === 'sports' ? 110 : location.category === 'hostel' ? 100 : 72
  return { position: [x + offset, y + offset * 1.15, z + offset], target: [x, y, z] }
}

export function campusCameraView(points: LocalCoordinate[], aspect = 1.5): CameraView {
  if (!points.length) return { position: [110, 110, 110], target: [0, 0, 0] }
  const minX = Math.min(...points.map((p) => p.x)), maxX = Math.max(...points.map((p) => p.x))
  const minZ = Math.min(...points.map((p) => p.z)), maxZ = Math.max(...points.map((p) => p.z))
  const x = (minX + maxX) / 2, z = (minZ + maxZ) / 2
  const radius = Math.max(90, Math.hypot(maxX - minX, maxZ - minZ) / 2)
  const distance = radius * 1.12 / (Math.sin(Math.PI / 8) * Math.min(1, Math.max(0.3, aspect)))
  const offset = distance / Math.sqrt(3)
  return { position: [x + offset, offset * 1.08, z + offset], target: [x, 0, z] }
}
