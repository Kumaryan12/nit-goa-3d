import { campusTerrainRevision, defaultTerrainSettings } from '../data/topography.ts'
import type { TerrainSettings } from '../data/topography.ts'
import { readCampusSlopes } from './slopeEdits.ts'

export const TERRAIN_SETTINGS_KEY = 'nit-goa-terrain-v1'
export function validateTerrainSettings(value: unknown): TerrainSettings {
  const input = value && typeof value === 'object' ? value as Partial<TerrainSettings> : {}
  const bounded = (key: 'nescafeRiseMeters' | 'gateRiseMeters' | 'girlsRoadRiseMeters', min: number, max: number) => {
    const number = input[key]
    return typeof number === 'number' && Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : defaultTerrainSettings[key]
  }
  // Ignore the old hillside setting so saved browsers cannot restore invented banks.
  return { nescafeRiseMeters: bounded('nescafeRiseMeters', 2, 24), gateRiseMeters: bounded('gateRiseMeters', 0, 16), girlsRoadRiseMeters: bounded('girlsRoadRiseMeters', 0, 12), showContours: typeof input.showContours === 'boolean' ? input.showContours : false, customSlopes: readCampusSlopes(input.customSlopes === undefined ? defaultTerrainSettings.customSlopes : input.customSlopes) }
}
export function readTerrainSettings(storage: Pick<Storage, 'getItem'> & Partial<Pick<Storage, 'setItem'>>): TerrainSettings {
  try {
    const saved = JSON.parse(storage.getItem(TERRAIN_SETTINGS_KEY) ?? 'null')
    const settings = validateTerrainSettings(saved)
    if (saved && typeof saved === 'object' && !Array.isArray(saved) && saved.campusTerrainRevision !== campusTerrainRevision) {
      // Older browser saves inherit newly published slopes once. Keep local
      // edits with matching IDs, and respect removals after the next save.
      const localIds = new Set(settings.customSlopes.map(slope => slope.id))
      settings.customSlopes = readCampusSlopes([...settings.customSlopes, ...defaultTerrainSettings.customSlopes.filter(slope => !localIds.has(slope.id))])
      if (storage.setItem) saveTerrainSettings({ setItem: storage.setItem.bind(storage) }, settings)
    }
    return settings
  } catch { return validateTerrainSettings(null) }
}
export function saveTerrainSettings(storage: Pick<Storage, 'setItem'>, settings: TerrainSettings): void {
  try { storage.setItem(TERRAIN_SETTINGS_KEY, JSON.stringify({ ...validateTerrainSettings(settings), campusTerrainRevision })) } catch { /* Keep the session usable when storage is unavailable. */ }
}
