import { useCallback, useEffect, useMemo, useState } from 'react'
import CampusScene from './components/CampusScene'
import type { SceneMetrics } from './components/CampusScene'
import { createDigitalTwin } from './lib/digitalTwin'
import type { CameraRequest } from './lib/camera'
import { campusLocations } from './data/campus'
import LoadingOverlay from './components/LoadingOverlay'
import BuildingInfoPanel from './components/BuildingInfoPanel'
import { sceneConfig } from './lib/sceneConfig'
import { fetchCampusData, fetchCampusRoads } from './lib/osm'
import { LAT0, LON0 } from './lib/geo'
import type { CampusMapState, CampusRoadState } from './types/osm'
import type { BuildingSelection } from './types/campus'

export default function App() {
  const [showGrid, setShowGrid] = useState(false)
  const [mapState, setMapState] = useState<CampusMapState>({ status: 'loading' })
  const [roadState, setRoadState] = useState<CampusRoadState>({ status: 'loading' })
  const [roadAttempt, setRoadAttempt] = useState(0)
  const [renderedCount, setRenderedCount] = useState(0)
  const [night, setNight] = useState(false)
  const [terrainReady, setTerrainReady] = useState(false)
  const [vegetationReady, setVegetationReady] = useState(false)
  const [treeCount, setTreeCount] = useState(0)
  const [metrics, setMetrics] = useState<SceneMetrics | null>(null)
  const [cameraRequest, setCameraRequest] = useState<CameraRequest>({ sequence: 0, locationId: null })
  const onFlyTo = useCallback((locationId: string) => setCameraRequest((request) => ({ sequence: request.sequence + 1, locationId })), [])
  const onResetCamera = () => setCameraRequest((request) => ({ sequence: request.sequence + 1, locationId: null }))
  const onTerrainReady = useCallback(() => setTerrainReady(true), [])
  const onVegetationReady = useCallback((count: number) => { setTreeCount(count); setVegetationReady(true) }, [])
  const retryRoads = useCallback(() => {
    setRoadState({ status: 'loading' })
    setVegetationReady(false)
    setTreeCount(0)
    setRoadAttempt((attempt) => attempt + 1)
  }, [])
  const mapData = mapState.status === 'ready' ? mapState.data : null
  const roadData = roadState.status === 'ready' ? roadState.data : null
  const requestsSettled = mapState.status !== 'loading' && roadState.status !== 'loading'
  const twin = useMemo(() => mapData || roadData || requestsSettled ? createDigitalTwin(mapData, roadData, requestsSettled) : null, [mapData, roadData, requestsSettled])
  const [selection, setSelection] = useState<BuildingSelection | null>(null)
  const clearSelection = useCallback(() => setSelection(null), [])
  const onRenderedCount = useCallback((count: number) => {
    setRenderedCount(count)
    if (import.meta.env.DEV) console.info('[NIT Goa OSM] Buildings successfully rendered:', count)
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    fetchCampusRoads(controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return
        if (import.meta.env.DEV) {
          console.info('[NIT Goa OSM] Road objects returned:', data.returnedRoadCount)
          console.info('[NIT Goa OSM] Campus roads rendered:', data.roads.length, 'source:', data.source)
        }
        setRoadState({ status: 'ready', data })
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        console.warn('[NIT Goa OSM] Unable to load campus roads.', error)
        setRoadState({ status: 'error' })
      })
    return () => controller.abort()
  }, [roadAttempt])

  useEffect(() => {
    const controller = new AbortController()
    if (import.meta.env.DEV) console.info('[NIT Goa OSM] Campus coordinate origin:', { lat: LAT0, lon: LON0, x: 0, z: 0 })
    fetchCampusData(controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return
        if (import.meta.env.DEV) {
          console.info('[NIT Goa OSM] Building objects returned:', data.returnedBuildingCount)
          console.info('[NIT Goa OSM] Query source:', data.source)
        }
        setMapState({ status: 'ready', data })
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        console.warn('[NIT Goa OSM] Unable to load campus data.', error)
        setMapState({ status: 'error' })
      })
    return () => controller.abort()
  }, [])

  return (
    <main className={`explorer ${night ? 'night-mode' : 'day-mode'}`} aria-label="NIT Goa 3D campus explorer">
      <div className="scene-viewport" aria-label="Interactive campus. Click a building for details, drag to orbit, scroll to zoom, and right-drag to pan.">
        <CampusScene
          showGrid={showGrid}
          twin={twin}
          night={night}
          cameraRequest={cameraRequest}
          onTerrainReady={onTerrainReady}
          onVegetationReady={onVegetationReady}
          onMetrics={setMetrics}
          onRenderedCount={onRenderedCount}
          selectedBuildingId={selection?.buildingId ?? null}
          onSelectBuilding={setSelection}
          onClearSelection={clearSelection}
        />
      </div>
      <LoadingOverlay state={mapState} roadState={roadState} terrainReady={terrainReady} vegetationReady={vegetationReady} onRetryRoads={retryRoads} />
      <BuildingInfoPanel selection={selection} onClose={clearSelection} onFlyTo={onFlyTo} />

      <header className="scene-header">
        <div className="title-block">
          <span className="eyebrow"><span className="live-dot" /> NIT GOA · CUNCOLIM</span>
          <h1>NIT Goa <span>3D Explorer</span></h1>
          <p className="title-caption">A new perspective on campus.</p>
        </div>
        <div className="scene-toolbar">
          <button type="button" className="toolbar-button mode-toggle" aria-pressed={night} aria-label="Toggle night mode" onClick={() => setNight((value) => !value)}>{night ? '🌙 Night' : '☀ Day'}</button>
          <button type="button" className="toolbar-button" aria-pressed={showGrid} onClick={() => setShowGrid((value) => !value)}>▦ Grid {showGrid ? 'on' : 'off'}</button>
          <button type="button" className="toolbar-button" onClick={onResetCamera}>↺ Reset view</button>
        </div>
      </header>
      <nav className="location-navigation" aria-label="Fly to campus location">
        <span className="eyebrow">Explore campus</span>
        <div className="location-buttons">{campusLocations.map((location) => <button key={location.id} type="button" onClick={() => onFlyTo(location.id)} disabled={!twin}>
          {location.name}<span aria-hidden="true">↗</span>
        </button>)}</div>
        <p className="approximation-note">Illustrative landscaping · approximate POIs</p>
      </nav>

      <footer className="scene-footer">
        <div>
          <p className="navigation-hint"><span className="control-icon">↻</span> Rotate <span className="control-detail">Drag</span><span className="control-icon">⊕</span> Zoom <span className="control-detail">Scroll / pinch</span><span className="control-icon">↖</span> Select Building <span className="control-detail">Click</span></p>
          <p className="map-attribution">
            © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a>
            {mapState.status === 'ready' && mapState.data.source === 'nearby-fallback' && ' · Nearby buildings (900 m fallback)'}
          </p>
        </div>
        <div className="scene-statistics">
          <p>{renderedCount} buildings <span>·</span> {roadData?.roads.length ?? 0} roads <span>·</span> {treeCount} trees</p>
          <p className="scale-note">1 unit ≈ 1 meter <span>·</span> {showGrid ? `Grid ${sceneConfig.gridSpacing} m` : 'Live OSM geometry'}</p>
          {import.meta.env.DEV && metrics && <p className="performance-note">{metrics.fps} fps · {metrics.calls} draws · {Math.round(metrics.triangles / 1000)}k triangles</p>}
        </div>
      </footer>
    </main>
  )
}
