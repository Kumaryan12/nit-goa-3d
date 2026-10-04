// Relative elevation described by the campus owner. Tune after a site measurement.
// An anchor is resolved by its corrected name, so editor changes are respected.
export const campusTopography = {
  upperLocationName: 'Nescafe',
  lowerLocationId: 'sports-ground',
  riseMeters: 8,
}

export interface CampusSlope {
  id: string
  name: string
  lower: { x: number; z: number }
  upper: { x: number; z: number }
  riseMeters: number
  widthMeters: number
}

export interface TerrainSettings {
  nescafeRiseMeters: number
  gateRiseMeters: number
  girlsRoadRiseMeters: number
  showContours: boolean
  customSlopes: CampusSlope[]
}

// Relative, editable estimates, including the owner's campus-terrain.json export.
export const campusTerrainRevision = '2026-10-03-admin-upwards'
export const defaultTerrainSettings: TerrainSettings = {
  nescafeRiseMeters: 8,
  gateRiseMeters: 6,
  girlsRoadRiseMeters: 4,
  showContours: false,
  customSlopes: [{
    id: '1e3bfd45-1eff-4269-96d1-2702d6a7ed02',
    name: 'admin to upwards',
    lower: { x: -383.23, z: -106.08 },
    upper: { x: -319.58, z: -106.24 },
    riseMeters: 4,
    widthMeters: 40,
  }],
}
