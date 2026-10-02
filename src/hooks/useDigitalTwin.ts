import { useEffect, useState } from 'react'
import type { DigitalTwin } from '../lib/digitalTwin'
import type { CampusMapData, CampusRoadData } from '../types/osm'
export function useDigitalTwin(map: CampusMapData | null, roads: CampusRoadData | null, settled: boolean) {
  const [twin, setTwin] = useState<DigitalTwin | null>(null)
  useEffect(() => {
    let active = true
    if (map || roads || settled) void import('../lib/digitalTwin').then(({ createDigitalTwin }) => { if (active) setTwin(createDigitalTwin(map, roads, settled)) })
    return () => { active = false }
  }, [map, roads, settled])
  return twin
}
