import type { CampusLocation } from '../types/campus.ts'

export interface CampusOverride {
  name?: string
  coordinates?: { x: number; z: number }
  buildingId?: string | null
  rotationDegrees?: number
}
export type CampusOverrides = Record<string, CampusOverride>
export const LOCATION_EDITS_KEY = 'nit-goa:location-edits:v1'
export const isBuildingId = (id: string) => /^(way\/[0-9]+|relation\/[0-9]+\/[0-9]+)$/.test(id)
const landmarkIds = new Set(['academic-block', 'administration-block', 'boys-hostel', 'girls-hostel', 'canteen', 'sports-ground', 'main-entrance'])

// Sanitize stored/exported data without allowing unknown properties or prototype keys.
export function validateOverrides(value: unknown): CampusOverrides {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length > 1000) throw new Error('Invalid campus edits.')
  const result: CampusOverrides = {}, claimed = new Set<string>()
  for (const [id, candidate] of Object.entries(value)) {
    if (!landmarkIds.has(id) && !isBuildingId(id)) throw new Error('Unknown campus location ID.')
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) throw new Error('Invalid location edit.')
    const data = candidate as CampusOverride, edit: CampusOverride = {}
    if (data.name !== undefined) {
      if (typeof data.name !== 'string' || !data.name.trim() || data.name.trim().length > 100) throw new Error('Name must contain 1–100 characters.')
      edit.name = data.name.trim()
    }
    if (data.coordinates !== undefined) {
      if (!['sports-ground', 'main-entrance'].includes(id)) throw new Error('Assign buildings to an OSM footprint instead of moving real geometry.')
      const point = data.coordinates
      if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.z) || Math.max(Math.abs(point.x), Math.abs(point.z)) > 5000) throw new Error('Choose a campus position within 5 km of the map origin.')
      edit.coordinates = { x: Math.round(point.x * 100) / 100, z: Math.round(point.z * 100) / 100 }
    }
    if (data.buildingId !== undefined) {
      if (!landmarkIds.has(id) || ['sports-ground', 'main-entrance'].includes(id) || data.buildingId !== null && !isBuildingId(data.buildingId)) throw new Error('Choose a valid OSM building footprint.')
      if (data.buildingId && claimed.has(data.buildingId)) throw new Error('Two landmarks cannot use the same building. Reset its existing assignment first.')
      if (data.buildingId) claimed.add(data.buildingId)
      edit.buildingId = data.buildingId
    }
    if (data.rotationDegrees !== undefined) {
      if (!['sports-ground', 'main-entrance'].includes(id) || !Number.isFinite(data.rotationDegrees) || Math.abs(data.rotationDegrees) > 360) throw new Error('Rotation must be between -360 and 360 degrees.')
      edit.rotationDegrees = data.rotationDegrees
    }
    result[id] = edit
  }
  return result
}
export function applyLocationOverride(location: CampusLocation, edit?: CampusOverride): CampusLocation {
  if (!edit) return location
  return { ...location, ...(edit.name !== undefined ? { name: edit.name, keywords: [...new Set([...location.keywords, location.name, edit.name])] } : {}),
    ...(edit.coordinates ? { coordinates: edit.coordinates } : {}),
    ...(edit.buildingId !== undefined ? { osmBuildingId: edit.buildingId } : {}),
    ...(edit.rotationDegrees !== undefined ? { rotationDegrees: edit.rotationDegrees } : {}) }
}
export function readLocationEdits(storage: Pick<Storage, 'getItem'>): CampusOverrides {
  try { const text = storage.getItem(LOCATION_EDITS_KEY); return text && text.length < 200000 ? validateOverrides(JSON.parse(text)) : {} } catch { return {} }
}
export function writeLocationEdits(storage: Pick<Storage, 'setItem'>, edits: CampusOverrides): void {
  const valid = validateOverrides(edits)
  try { storage.setItem(LOCATION_EDITS_KEY, JSON.stringify(valid)) } catch { throw new Error('Browser storage is unavailable. Your changes were not saved; export a copy before closing.') }
}
