import { useEffect, useRef, useState } from 'react'
import type { CampusOverrides } from '../lib/locationOverrides'
import type { DigitalTwin } from '../lib/digitalTwin'
import type { CampusMapData, CampusRoadData } from '../types/osm'
import type { TerrainSettings } from '../data/topography'
import type { TwinBuildReply, TwinBuildRequest } from '../lib/prepareDigitalTwin'
export function useDigitalTwin(map: CampusMapData | null, roads: CampusRoadData | null, settled: boolean, overrides: CampusOverrides, terrainSettings: TerrainSettings) {
  const [twin, setTwin] = useState<DigitalTwin | null>(null)
  const sequence = useRef(0)
  useEffect(() => {
    if (!map && !roads && !settled) return
    let active = true, worker: Worker | undefined, fallingBack = false
    const request: TwinBuildRequest = { id: ++sequence.current, map, roads, settled, overrides, terrainSettings }
    const fallback = () => {
      if (!active || fallingBack) return
      fallingBack = true; worker?.terminate()
      // Preserve exploration on browsers where workers are unavailable.
      void import('../lib/prepareDigitalTwin').then(({ prepareDigitalTwin }) => {
        if (active) setTwin(prepareDigitalTwin(request))
      })
    }
    try {
      worker = new Worker(new URL('../workers/digitalTwin.worker.ts', import.meta.url), { type: 'module' })
      worker.onmessage = ({ data }: MessageEvent<TwinBuildReply>) => {
        if (!active || data.id !== sequence.current) return
        if ('twin' in data) { setTwin(data.twin); worker?.terminate() }
        else fallback()
      }
      worker.onerror = fallback
      worker.postMessage(request)
    } catch { fallback() }
    // Cancel obsolete generation so quick edits cannot queue slow work or
    // publish an older terrain after a newer owner correction.
    return () => { active = false; worker?.terminate() }
  }, [map, roads, settled, overrides, terrainSettings])
  return twin
}
