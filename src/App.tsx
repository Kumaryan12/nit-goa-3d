import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
const CampusScene = lazy(() => import('./components/CampusScene'))
const GalleryModal = lazy(() => import('./components/GalleryModal'))
const PhotoUploadDialog = lazy(() => import('./components/PhotoUploadDialog'))
const CampusLocationEditor = lazy(() => import('./components/CampusLocationEditor'))
const AuthDialog = lazy(() => import('./components/AuthDialog'))
import type { SceneMetrics } from './components/CampusScene'
import type { MapPickRequest, PickedLocation } from './components/CampusLocationEditor'
import { applyLocationOverride, readLocationEdits, validateOverrides, writeLocationEdits } from './lib/locationOverrides'
import type { CampusOverride } from './lib/locationOverrides'
import { savedCampusOverrides } from './data/campusOverrides'
import { useDigitalTwin } from './hooks/useDigitalTwin'
import { parseURLState, serializeURLState } from './lib/urlState'
import { loadMapWithCache, cacheAge } from './lib/osmCache'
import { routePoints } from './lib/traversal'
import type { Playback, RoutePresentation } from './lib/traversal'
import type { LocalCoordinate } from './lib/geo'
import ErrorBoundary from './components/ErrorBoundary'
import type { CameraRequest } from './lib/camera'
import { createRoadGraph, planWalkingRoute } from './lib/pathfinding'
import { campusCenter, selectionForLocation } from './lib/locations'
import { calculateCampusStats } from './lib/stats'
import SearchBar from './components/SearchBar'
import NavigationMode from './components/NavigationMode'
import CampusStats from './components/CampusStats'
import MiniMap from './components/MiniMap'
import { campusLocations } from './data/campus'
import LoadingOverlay from './components/LoadingOverlay'
import BuildingInfoPanel from './components/BuildingInfoPanel'
import { sceneConfig } from './lib/sceneConfig'
import { fetchCampusData, fetchCampusRoads } from './lib/osm'
import { LAT0, LON0 } from './lib/geo'
import type { CampusMapState, CampusRoadState } from './types/osm'
import type { BuildingSelection } from './types/campus'

const browserStorage = { getItem: (key: string) => localStorage.getItem(key), setItem: (key: string, value: string) => localStorage.setItem(key, value), removeItem: (key: string) => localStorage.removeItem(key) }
const readState = () => {
  const params = new URL(window.location.href).searchParams
  const extra = ['location','from','to'].map((key) => params.get(key)).filter((id): id is string => !!id && /^(osm-(way|relation)-[0-9]+(-[0-9]+)?|way\/[0-9]+|relation\/[0-9]+\/[0-9]+)$/.test(id))
  return parseURLState(window.location.href, [...campusLocations.map((p) => p.id), ...extra])
}
export default function App() {
  const initial = useRef(readState()).current
  const [localEdits, setLocalEdits] = useState(() => readLocationEdits(browserStorage))
  const overrides = useMemo(() => validateOverrides({ ...savedCampusOverrides, ...localEdits }), [localEdits])
  const editableMetadata = useMemo(() => campusLocations.map((location) => applyLocationOverride(location, overrides[location.id])), [overrides])
  const [editorOpen, setEditorOpen] = useState(false), [editorLocationId, setEditorLocationId] = useState('main-entrance')
  const [picking, setPicking] = useState<MapPickRequest | null>(null), [picked, setPicked] = useState<PickedLocation | null>(null)
  const closeEditor = useCallback(() => { setEditorOpen(false); setPicking(null); setPicked(null) }, [])
  const saveCorrection = useCallback((id: string, edit: CampusOverride) => {
    const next = { ...localEdits, [id]: edit }; validateOverrides({ ...savedCampusOverrides, ...next }); setLocalEdits(next); setPicked(null); setPicking(null); writeLocationEdits(browserStorage, next)
  }, [localEdits])
  const resetCorrection = useCallback((id: string) => {
    const next = { ...localEdits }; delete next[id]; setLocalEdits(next); setPicked(null); setPicking(null); writeLocationEdits(browserStorage, next)
  }, [localEdits])
  const onPickPosition = useCallback((coordinates: LocalCoordinate) => {
    if (!picking || picking.mode !== 'point') return
    setPicked({ locationId: picking.locationId, coordinates }); setPicking(null)
  }, [picking])
  const [online, setOnline] = useState(navigator.onLine), [mapAttempt, setMapAttempt] = useState(0)
  const [cacheNotices, setCacheNotices] = useState<Record<string, {timestamp: number; stale: boolean}>>({})
  const [galleryOpen, setGalleryOpen] = useState(!!initial.photo), [galleryLocation, setGalleryLocation] = useState<string | undefined>(), [photoId, setPhotoId] = useState(initial.photo)
  const [uploadLocation, setUploadLocation] = useState<string | undefined>(), [uploadOpen, setUploadOpen] = useState(false), [authOpen, setAuthOpen] = useState(false)
  const [playback, setPlayback] = useState<Playback>({ status: 'stopped', speed: 1, sequence: 0 })
  const travelerPosition = useRef<LocalCoordinate | null>(null)
  const onWalkComplete = useCallback(() => setPlayback((p) => ({ ...p, status: 'complete' })), [])
  const onGallery = useCallback((id?: string, photo?: string) => { setGalleryLocation(id); setGalleryOpen(true); if (photo) setPhotoId(photo) }, [])
  const onUpload = useCallback((id?: string) => { setUploadLocation(id); setUploadOpen(true) }, [])
  const closeGallery = () => { setGalleryOpen(false); setPhotoId(null) }
  const lastURLState = useRef(JSON.stringify({ location: initial.to ?? initial.location, from: initial.to ? initial.from ?? 'main-entrance' : null, to: initial.to, night: initial.night, photo: initial.photo }))
  const initialSelectionResolved = useRef(!!selectionForLocation(initial.to ?? initial.location ?? ''))

  const [showGrid, setShowGrid] = useState(false)
  const [mapState, setMapState] = useState<CampusMapState>({ status: 'loading' })
  const [roadState, setRoadState] = useState<CampusRoadState>({ status: 'loading' })
  const [roadAttempt, setRoadAttempt] = useState(0)
  const [renderedCount, setRenderedCount] = useState(0)
  const [night, setNight] = useState(initial.night)
  const [terrainReady, setTerrainReady] = useState(false)
  const [vegetationReady, setVegetationReady] = useState(false)
  const [treeCount, setTreeCount] = useState(0)
  const [metrics, setMetrics] = useState<SceneMetrics | null>(null)
  const onMetrics = useCallback((next: SceneMetrics) => setMetrics((previous) =>
    previous?.fps === next.fps && previous.calls === next.calls && previous.triangles === next.triangles ? previous : next), [])
  const [cameraRequest, setCameraRequest] = useState<CameraRequest>({ sequence: 0, locationId: initial.to ?? initial.location })
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
  const twin = useDigitalTwin(mapData, roadData, requestsSettled, overrides)
  const [selection, setSelection] = useState<BuildingSelection | null>(selectionForLocation(initial.to ?? initial.location ?? ''))
  const [navigationOpen, setNavigationOpen] = useState(!!initial.to)
  const [startId, setStartId] = useState(initial.from ?? '@current')
  const locations = twin?.locations ?? editableMetadata
  const catalog = useMemo(() => [...locations, ...(twin?.selections.filter((item) => item.matchMethod === 'unmatched').map((item) => item.location) ?? [])], [locations, twin])
  const activeSelection = useMemo(() => selection ? selectionForLocation(selection.location.id, catalog, twin?.selections) ?? selection : null, [selection, catalog, twin])
  const center = useMemo(() => twin?.boundary.length ? campusCenter(twin.boundary) : null, [twin])
  // Internal campus estimates assume authorized campus access. General-purpose
  // routing keeps the engine's default exclusion of private roads.
  const roadGraph = useMemo(() => createRoadGraph(roadData?.roads ?? [], { allowPrivate: true }), [roadData])
  const start = catalog.find((location) => location.id === (startId === '@current' ? 'main-entrance' : startId))
  const presentation = useMemo<RoutePresentation | null>(() => {
    if (!navigationOpen || !start || !activeSelection || roadState.status !== 'ready') return null
    const route = planWalkingRoute(start.coordinates, activeSelection.location.coordinates, roadGraph)
    return route ? { route, start: start.coordinates, end: activeSelection.location.coordinates, startName: start.name, endName: activeSelection.location.name } : null
  }, [navigationOpen, start, activeSelection, roadGraph, roadState.status])
  useEffect(() => { setPlayback((p) => ({...p, status: 'stopped', sequence: p.sequence + 1})); travelerPosition.current = null }, [presentation])
  const viewRoute = () => { if (presentation) setCameraRequest((p) => ({ sequence: p.sequence + 1, locationId: null, routePoints: routePoints(presentation) })) }
  const stats = useMemo(() => calculateCampusStats(twin), [twin])
  const chooseLocation = useCallback((id: string) => {
    const next = selectionForLocation(id, catalog, twin?.selections)
    if (!next) return
    setSelection(next)
    setNavigationOpen(false)
    onFlyTo(id)
  }, [catalog, twin, onFlyTo])
  const chooseNavigationDestination = useCallback((id: string) => { chooseLocation(id); setNavigationOpen(true) }, [chooseLocation])
  const closeNavigation = useCallback(() => setNavigationOpen(false), [])
  const openNavigation = useCallback(() => setNavigationOpen(true), [])
  const clearSelection = useCallback(() => { if (!editorOpen && !picking) setSelection(null) }, [editorOpen, picking])
  const onSelectBuilding = useCallback((next: BuildingSelection) => {
    if (picking?.mode === 'point') return
    if (picking?.mode === 'building' && next.buildingId) { setPicked({ locationId: picking.locationId, buildingId: next.buildingId, coordinates: next.location.coordinates }); setPicking(null); return }
    if (!editorOpen) setSelection(next)
  }, [editorOpen, picking])
  const editLocation = useCallback((id: string) => { setEditorLocationId(id); setEditorOpen(true); setNavigationOpen(false); setPicking(null); setPicked(null); setSelection(selectionForLocation(id, catalog, twin?.selections)); if (['main-entrance', 'sports-ground'].includes(id)) setCameraRequest((request) => ({ sequence: request.sequence + 1, locationId: null })) }, [catalog, twin])
  const onRenderedCount = useCallback((count: number) => {
    setRenderedCount(count)
    if (import.meta.env.DEV) console.info('[NIT Goa OSM] Buildings successfully rendered:', count)
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    loadMapWithCache('roads', () => fetchCampusRoads(controller.signal, true), browserStorage, controller.signal, !online)
      .then(({ data, cache }) => {
        if (controller.signal.aborted) return
        if (import.meta.env.DEV) {
          console.info('[NIT Goa OSM] Road objects returned:', data.returnedRoadCount)
          console.info('[NIT Goa OSM] Campus roads rendered:', data.roads.length, 'source:', data.source)
        }
        setCacheNotices((previous) => { const next = {...previous}; if (cache) next.roads = cache; else delete next.roads; return next }); setRoadState({ status: 'ready', data })
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        console.warn('[NIT Goa OSM] Unable to load campus roads.', error)
        setRoadState({ status: 'error' })
      })
    return () => controller.abort()
  }, [roadAttempt, online])

  useEffect(() => {
    const controller = new AbortController()
    if (import.meta.env.DEV) console.info('[NIT Goa OSM] Campus coordinate origin:', { lat: LAT0, lon: LON0, x: 0, z: 0 })
    loadMapWithCache('buildings', () => fetchCampusData(controller.signal, true), browserStorage, controller.signal, !online)
      .then(({ data, cache }) => {
        if (controller.signal.aborted) return
        if (import.meta.env.DEV) {
          console.info('[NIT Goa OSM] Building objects returned:', data.returnedBuildingCount)
          console.info('[NIT Goa OSM] Query source:', data.source)
        }
        setCacheNotices((previous) => { const next = {...previous}; if (cache) next.buildings = cache; else delete next.buildings; return next }); setMapState({ status: 'ready', data })
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        console.warn('[NIT Goa OSM] Unable to load campus data.', error)
        setMapState({ status: 'error' })
      })
    return () => controller.abort()
  }, [mapAttempt, online])

  useEffect(() => {
    const changed = () => setOnline(navigator.onLine)
    window.addEventListener('online', changed); window.addEventListener('offline', changed)
    return () => { window.removeEventListener('online', changed); window.removeEventListener('offline', changed) }
  }, [])
  useEffect(() => {
    const restore = () => {
      const state = parseURLState(window.location.href, catalog.map((p) => p.id))
      lastURLState.current = JSON.stringify({ location: state.to ?? state.location, from: state.to ? state.from ?? 'main-entrance' : null, to: state.to, night: state.night, photo: state.photo })
      const id = state.to ?? state.location
      setSelection(id ? selectionForLocation(id, catalog, twin?.selections) : null)
      setNavigationOpen(!!state.to); setStartId(state.from ?? '@current'); setNight(state.night); setPhotoId(state.photo); setGalleryOpen(!!state.photo)
      setCameraRequest((p) => ({sequence: p.sequence + 1, locationId: id}))
    }
    window.addEventListener('popstate', restore); return () => window.removeEventListener('popstate', restore)
  }, [catalog, twin])
  useEffect(() => {
    const state = { location: activeSelection?.location.id ?? null, from: navigationOpen && activeSelection ? startId === '@current' ? 'main-entrance' : startId : null, to: navigationOpen ? activeSelection?.location.id ?? null : null, night, photo: photoId }
    const snapshot = JSON.stringify(state)
    if (lastURLState.current === snapshot) return
    lastURLState.current = snapshot
    const url = serializeURLState(state, window.location.href)
    if (url !== window.location.pathname + window.location.search + window.location.hash) window.history.pushState(null, '', url)
  }, [activeSelection?.location.id, navigationOpen, startId, night, photoId])
  useEffect(() => { if (twin && !initialSelectionResolved.current && (initial.to ?? initial.location)) { initialSelectionResolved.current = true; const resolved = selectionForLocation(initial.to ?? initial.location!, catalog, twin.selections); if (resolved) setSelection(resolved) } }, [twin])

  return (
    <main className={`explorer ${night ? 'night-mode' : 'day-mode'} ${picking ? 'picking-location' : ''} ${editorOpen ? 'editing-campus' : ''}`} aria-label="NIT Goa 3D campus explorer">
      <div className="scene-viewport" aria-label="Interactive campus. Click a building for details, drag to orbit, scroll to zoom, and right-drag to pan.">
        <Suspense fallback={<p className="scene-loading" role="status">Preparing 3D campus…</p>}><CampusScene
          presentation={presentation} playback={playback} travelerPosition={travelerPosition} onWalkComplete={onWalkComplete}
          pickingPosition={picking?.mode === 'point'} pickedPosition={editorOpen ? picked?.coordinates ?? null : null} onPickPosition={onPickPosition}
          showGrid={showGrid}
          twin={twin}
          night={night}
          cameraRequest={cameraRequest}
          onTerrainReady={onTerrainReady}
          onVegetationReady={onVegetationReady}
          onMetrics={onMetrics}
          onRenderedCount={onRenderedCount}
          selectedBuildingId={activeSelection?.buildingId ?? null}
          onSelectBuilding={onSelectBuilding}
          onClearSelection={clearSelection}
        /></Suspense>
      </div>
      <LoadingOverlay state={mapState} roadState={roadState} terrainReady={terrainReady} vegetationReady={vegetationReady} onRetryRoads={retryRoads} />
      {!editorOpen && (navigationOpen ? <NavigationMode locations={catalog}
        destination={activeSelection?.location ?? null} startId={startId} onStartChange={setStartId} onDestinationChange={chooseNavigationDestination}
        presentation={presentation} playback={playback} onPlayback={setPlayback} onViewRoute={viewRoute} roadStatus={roadState.status} onClose={closeNavigation} />
        : <BuildingInfoPanel onEdit={editLocation} onGallery={onGallery} onUpload={onUpload} selection={activeSelection} locations={locations} center={center} onClose={clearSelection} onFlyTo={onFlyTo} onNavigate={openNavigation} onSelectLocation={chooseLocation} />)}
      {editorOpen && <Suspense fallback={<p className="scene-loading">Opening location editor…</p>}><CampusLocationEditor locations={catalog} locationId={editorLocationId}
        assignedBuildingId={twin?.selections.find((item) => item.location.id === editorLocationId)?.buildingId ?? null} picking={picking} picked={picked} edits={overrides}
        onLocation={(id) => { setEditorLocationId(id); setPicking(null); setPicked(null) }} onPick={setPicking} onSave={saveCorrection} onReset={resetCorrection} onClose={closeEditor} /></Suspense>}
      <MiniMap presentation={presentation} travelerPosition={travelerPosition} twin={twin} selection={activeSelection} onSelect={(id) => {
        const match = twin?.selections.find((item) => item.location.id === id)
        if (picking?.mode === 'building' && match) onSelectBuilding(match)
        else if (!picking) chooseLocation(id)
      }} />

      {(!online || Object.keys(cacheNotices).length > 0 || mapState.status === 'error') && <div className="resilience-notice" role="status">
        {!online && 'Offline · '}{Object.keys(cacheNotices).length > 0 ? `Using cached map data · ${Object.keys(cacheNotices).join(' and ')} · Updated ${cacheAge(Math.min(...Object.values(cacheNotices).map((c) => c.timestamp)))}${Object.values(cacheNotices).some((c) => c.stale) ? ' (older than 24 hours)' : ''}` : mapState.status === 'error' ? 'Map unavailable. Reconnect or retry; no usable building cache is available.' : 'Live map loading paused.'}
        <button className="text-button" onClick={() => { setMapState({status:'loading'}); setMapAttempt((p) => p+1); retryRoads() }}>Retry map</button></div>}
      <header className="scene-header">
        <div className="title-block">
          <span className="eyebrow"><span className="live-dot" /> NIT GOA · CUNCOLIM</span>
          <h1>NIT Goa <span>3D Explorer</span></h1>
          <p className="title-caption">Digital twin · Explore. Discover. Connect.</p>
        </div>
        <SearchBar locations={catalog} onSelect={chooseLocation} />
        <div className="scene-toolbar">
          <button className="toolbar-button edit-campus-toggle" aria-pressed={editorOpen} onClick={() => editorOpen ? closeEditor() : editLocation('main-entrance')}>✎ Edit campus</button>
          <button className="toolbar-button" onClick={() => onGallery()}>▧ Gallery</button>
          <button type="button" className="toolbar-button mode-toggle" aria-pressed={night} aria-label="Toggle night mode" onClick={() => setNight((value) => !value)}>{night ? '🌙 Night' : '☀ Day'}</button>
          <button type="button" className="toolbar-button navigate-toggle" aria-pressed={navigationOpen} onClick={() => setNavigationOpen((value) => !value)}>📍 Navigate</button>
          <button type="button" className="toolbar-button" aria-pressed={showGrid} onClick={() => setShowGrid((value) => !value)}>▦ Grid {showGrid ? 'on' : 'off'}</button>
          <button type="button" className="toolbar-button" onClick={onResetCamera}>↺ Reset view</button>
        </div>
      </header>
      <nav className="location-navigation" aria-label="Fly to campus location">
        <span className="eyebrow">Explore campus</span>
        <div className="location-buttons">{locations.map((location) => <button key={location.id} type="button" onClick={() => chooseLocation(location.id)}>
          <span className="location-button-icon" aria-hidden="true">{location.icon}</span>{location.name}<span aria-hidden="true">↗</span>
        </button>)}</div>
        <p className="approximation-note">Illustrative landscaping · approximate POIs</p>
      </nav>

      <ErrorBoundary onClose={() => { closeGallery(); setUploadOpen(false); setAuthOpen(false) }}>
      <Suspense fallback={<div className="gallery-opening" role="status">Opening community tools…</div>}>
      {galleryOpen && <GalleryModal locations={locations} locationId={galleryLocation} photoId={photoId} onPhoto={setPhotoId} onClose={closeGallery} onUpload={onUpload} onAuth={() => setAuthOpen(true)} />}
      {uploadOpen && <PhotoUploadDialog locations={locations} locationId={uploadLocation} onClose={() => setUploadOpen(false)} onAuth={() => setAuthOpen(true)} />}
      {authOpen && <AuthDialog onClose={() => setAuthOpen(false)} />}
      </Suspense></ErrorBoundary>
      <CampusStats stats={stats} metrics={metrics} />
      <footer className="scene-footer">
        <div>
          <p className="navigation-hint"><span className="control-icon">↻</span> Rotate <span className="control-detail">Drag</span><span className="control-icon">⊕</span> Zoom <span className="control-detail">Scroll / pinch</span><span className="control-icon">↖</span> Select Building <span className="control-detail">Click</span></p>
          <p className="map-attribution">
            © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a>
            {mapState.status === 'ready' && mapState.data.source === 'nearby-fallback' && ' · Nearby buildings (900 m fallback)'}
          </p>
        </div>
        <div className="footer-scale"><p>1 unit ≈ 1 meter · {showGrid ? `Grid ${sceneConfig.gridSpacing} m` : 'Illustrative landscaping'}</p>
          {import.meta.env.DEV && metrics && <p className="performance-note">{metrics.fps} fps · {metrics.calls} draws · {Math.round(metrics.triangles / 1000)}k triangles · {renderedCount} rendered buildings · {treeCount} trees</p>}
        </div>
      </footer>
    </main>
  )
}
