import { useEffect, useState } from 'react'
import type { CampusOverrides } from '../lib/locationOverrides'
import type { DigitalTwin } from '../lib/digitalTwin'
import type { CampusMapData, CampusRoadData } from '../types/osm'
export function useDigitalTwin(map: CampusMapData | null, roads: CampusRoadData | null, settled: boolean, overrides: CampusOverrides) {
  const [twin, setTwin] = useState<DigitalTwin | null>(null)
  useEffect(() => {
    let active = true
    if (map || roads || settled) void import('../lib/digitalTwin').then(({ createDigitalTwin }) => { if (active) setTwin(createDigitalTwin(map, roads, settled, overrides)) })
    return () => { active = false }
  }, [map, roads, settled, overrides])
  return twin
}
