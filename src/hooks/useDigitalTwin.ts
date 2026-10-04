import { useEffect, useState } from 'react'
import type { CampusOverrides } from '../lib/locationOverrides'
import type { DigitalTwin } from '../lib/digitalTwin'
import type { CampusMapData, CampusRoadData } from '../types/osm'
import type { TerrainSettings } from '../data/topography'
export function useDigitalTwin(map: CampusMapData | null, roads: CampusRoadData | null, settled: boolean, overrides: CampusOverrides, terrainSettings: TerrainSettings) {
  const [twin, setTwin] = useState<DigitalTwin | null>(null)
  useEffect(() => {
    let active = true
    if (map || roads || settled) void import('../lib/digitalTwin').then(({ createDigitalTwin }) => { if (active) setTwin(createDigitalTwin(map, roads, settled, overrides, terrainSettings)) })
    return () => { active = false }
  }, [map, roads, settled, overrides, terrainSettings])
  return twin
}
