import type { AvatarStyle } from './lib/profile'
import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
const CampusScene = lazy(() => import('./components/CampusScene'))
const GalleryModal = lazy(() => import('./components/GalleryModal'))
const PhotoUploadDialog = lazy(() => import('./components/PhotoUploadDialog'))
const SlopeEditor = lazy(() => import('./components/SlopeEditor'))
const CampusLocationEditor = lazy(() => import('./components/CampusLocationEditor'))
const AuthDialog = lazy(() => import('./components/AuthDialog'))
import type { SlopeEnd, SlopePickedPoint, SlopePreviewPoints } from './components/SlopeEditor'
import type { MapPickRequest, PickedLocation } from './components/CampusLocationEditor'
import { applyLocationOverride, readLocationEdits, validateOverrides, writeLocationEdits } from './lib/locationOverrides'
import type { CampusOverride } from './lib/locationOverrides'
import FootballControls from './components/FootballControls'
import { createFootballControls, footballPitch } from './lib/football'
import type { FootballStatus } from './lib/football'
import { useFootballSession } from './hooks/useFootballSession'
import { useOatSession } from './hooks/useOatSession'
import { useCampusSession } from './hooks/useCampusSession'
import CampusSocial from './components/CampusSocial'
import { firebasePublicConfig } from './lib/firebase'
import { trackCampusEvent } from './lib/analytics'
import { CAMPUS_LOADING_ENTRY_MS, CAMPUS_LOADING_EXIT_MS, campusStartup } from './lib/campusStartup'
import CampusLoadingScreen from './components/CampusLoadingScreen'
import { useCampusLoadingBoundary } from './components/CampusLoadingBoundary'
import { CAMPUS_COLORS } from './lib/campusProtocol'
import type { CampusPose } from './lib/campusProtocol'
import OatControls from './components/OatControls'
import WalkControls from './components/WalkControls'
import TerrainControls from './components/TerrainControls'
import { readTerrainSettings, saveTerrainSettings, validateTerrainSettings } from './lib/terrainSettings'
import type { TerrainSettings } from './data/topography'
import { emptyWalkInput, explorerViewFromURL, withExplorerView } from './lib/walking'
import type { ExplorerView, WalkStatus, WalkSpawnRequest } from './lib/walking'
import { GYAN_MANDIR_ID } from './lib/hostelInterior'
import type { InteriorPose } from './lib/hostelInterior'
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
import SearchBar from './components/SearchBar'
import NavigationMode from './components/NavigationMode'
import MiniMap from './components/MiniMap'
import { campusLocations } from './data/campus'
import LoadingOverlay from './components/LoadingOverlay'
import BuildingInfoPanel from './components/BuildingInfoPanel'
import { fetchCampusData, fetchCampusRoads, fetchPublishedCampusData, fetchPublishedCampusRoads } from './lib/osm'
import { LAT0, LON0 } from './lib/geo'
import type { CampusMapState, CampusRoadState } from './types/osm'
import type { BuildingSelection } from './types/campus'
import GraphicsControl from './components/GraphicsControl'
import { validGraphicsMode } from './lib/graphics'
import AtmosphereControls from './components/AtmosphereControls'
import SocialActions from './components/SocialActions'
import { theatreSeats } from './lib/social'
import ViewControls, { initialViewLayout } from './components/ViewControls'
import type { ViewLayout } from './components/ViewControls'
import type { OverviewDrag } from './lib/cameraGestures'
import './components/campus-panels.css'

const browserStorage = { getItem: (key: string) => localStorage.getItem(key), setItem: (key: string, value: string) => localStorage.setItem(key, value), removeItem: (key: string) => localStorage.removeItem(key) }
const readState = () => {
  const params = new URL(window.location.href).searchParams
  const extra = ['location','from','to'].map((key) => params.get(key)).filter((id): id is string => !!id && /^(osm-(way|relation)-[0-9]+(-[0-9]+)?|way\/[0-9]+|relation\/[0-9]+\/[0-9]+)$/.test(id))
  return parseURLState(window.location.href, [...campusLocations.map((p) => p.id), ...extra])
}
export default function App({avatarStyle,accountControl,accountOpen=false,canEdit=false,publishedMap=import.meta.env.PROD}:{avatarStyle?:AvatarStyle;accountControl?:ReactNode;accountOpen?:boolean;canEdit?:boolean;publishedMap?:boolean}={}) {
  const loadingBoundary = useCampusLoadingBoundary()
  const explorer = useRef<HTMLElement>(null), [layout, setLayout] = useState(initialViewLayout)
  const [mobileToolsOpen, setMobileToolsOpen] = useState(false)
  const changeLayout = (value: ViewLayout) => { setLayout(value); try { localStorage.setItem('nit-goa:view-layout', JSON.stringify(value)) } catch { /* View changes work without storage. */ } }
  const revealPanels = useCallback(() => setLayout(previous => {
    if (previous.panels) return previous
    const next = { ...previous, panels: true }
    try { localStorage.setItem('nit-goa:view-layout', JSON.stringify(next)) } catch { /* Inspection still opens without storage. */ }
    return next
  }), [])
  const initial = useRef(readState()).current
  const initialView = useRef(explorerViewFromURL(window.location.href)).current
  const [view, setView] = useState<ExplorerView>(initialView)
  const [overviewDrag, setOverviewDrag] = useState<OverviewDrag>('pan')
  const [graphicsMode, setGraphicsMode] = useState(() => { try { return validGraphicsMode(localStorage.getItem('nit-goa:graphics')) } catch { return validGraphicsMode(null) } })
  const changeGraphics = (mode: typeof graphicsMode) => { setGraphicsMode(mode); try { localStorage.setItem('nit-goa:graphics', mode) } catch { /* Rendering still works without storage. */ } }
  const [terrainSettings, setTerrainSettings] = useState(() => readTerrainSettings(browserStorage))
  const [terrainControlsOpen, setTerrainControlsOpen] = useState(false)
  const [slopeEditorOpen, setSlopeEditorOpen] = useState(false)
  const [slopePicking, setSlopePicking] = useState<SlopeEnd | null>(null)
  const [slopePicked, setSlopePicked] = useState<SlopePickedPoint | null>(null)
  const [slopePreview, setSlopePreview] = useState<SlopePreviewPoints | null>(null)
  const closeSlopeEditor = useCallback(() => { setSlopeEditorOpen(false); setSlopePicking(null); setSlopePicked(null); setSlopePreview(null) }, [])
  const applyTerrainSettings = useCallback((value: TerrainSettings) => { const settings = validateTerrainSettings(value); setTerrainSettings(settings); saveTerrainSettings(browserStorage, settings) }, [])
  const walkInput = useRef(emptyWalkInput()), avatarPosition = useRef<LocalCoordinate | null>(null)
  const campusPose = useRef<CampusPose | null>(null), [campusOpen, setCampusOpen] = useState(false), [chatReadAt, setChatReadAt] = useState(() => Date.now())
  const interiorPose = useRef<InteriorPose | null>(null)
  const footballInput = useRef(createFootballControls())
  const [footballJoined, setFootballJoined] = useState(false), [footballRetry, setFootballRetry] = useState(0)
  const [footballStatus, setFootballStatus] = useState<FootballStatus | null>(null)
  const [oatOpen, setOatOpen] = useState(() => new URL(window.location.href).searchParams.get('concert') === '1')
  const [oatJoined, setOatJoined] = useState(false), [oatName, setOatName] = useState(''), [oatRetry, setOatRetry] = useState(0)
  const oat = useOatSession(oatOpen && oatJoined, oatName, oatRetry)
  const closeOat = () => { oat.stopMic(); setOatJoined(false); setOatOpen(false) }
  const onFootballStatus = useCallback((status: FootballStatus) => setFootballStatus(previous => previous && previous.blue === status.blue && previous.gold === status.gold && previous.canKick === status.canKick && previous.onPitch === status.onPitch && previous.event === status.event && previous.countdown === status.countdown ? previous : status), [])
  const processedWalkSpawn = useRef(0)
  const [walkStatus, setWalkStatus] = useState<WalkStatus | null>(null), [walkManualPause, setWalkManualPause] = useState(false)
  const [walkSpawn, setWalkSpawn] = useState<WalkSpawnRequest>({ sequence: 0, locationId: 'main-entrance' })
  const onWalkStatus = useCallback((status: WalkStatus) => setWalkStatus(status), [])
  const spawnNear = useCallback((locationId: string) => { setFootballJoined(false); setWalkSpawn(request => ({ sequence: request.sequence + 1, locationId })); setWalkManualPause(false) }, [])
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
    if (slopePicking) { setSlopePicked(previous => ({ end: slopePicking, point: coordinates, sequence: (previous?.sequence ?? 0) + 1 })); setSlopePicking(null); return }
    if (!picking || picking.mode !== 'point') return
    setPicked({ locationId: picking.locationId, coordinates }); setPicking(null)
  }, [picking, slopePicking])
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
  const lastURLState = useRef(JSON.stringify({ location: initial.to ?? initial.location, from: initial.to ? initial.from ?? 'main-entrance' : null, to: initial.to, night: initial.night, photo: initial.photo, view: initialView }))
  const initialSelectionResolved = useRef(!!selectionForLocation(initial.to ?? initial.location ?? ''))

  const [showGrid, setShowGrid] = useState(false)
  const [mapState, setMapState] = useState<CampusMapState>({ status: 'loading' })
  const [roadState, setRoadState] = useState<CampusRoadState>({ status: 'loading' })
  const [roadAttempt, setRoadAttempt] = useState(0)
  const [night, setNight] = useState(initial.night)
  const [terrainReady, setTerrainReady] = useState(false)
  const [vegetationReady, setVegetationReady] = useState(false)
  const [firstFrame, setFirstFrame] = useState(false), [sceneUnavailable, setSceneUnavailable] = useState(false)
  const [startupVisible, setStartupVisible] = useState(true), [startupExiting, setStartupExiting] = useState(false)
  const startupStartedAt = useRef(loadingBoundary?.startedAt ?? performance.now())
  const onSceneReady = useCallback(() => setFirstFrame(true), [])
  const onSceneUnavailable = useCallback(() => setSceneUnavailable(true), [])
  const [cameraRequest, setCameraRequest] = useState<CameraRequest>({ sequence: 0, locationId: initial.to ?? initial.location })
  const onFlyTo = useCallback((locationId: string) => { if (view === 'walk') spawnNear(locationId); else setCameraRequest((request) => ({ sequence: request.sequence + 1, locationId })) }, [view, spawnNear])
  const onResetCamera = () => { if (view === 'walk') spawnNear('main-entrance'); else setCameraRequest((request) => ({ sequence: request.sequence + 1, locationId: null })) }
  const onTerrainReady = useCallback(() => setTerrainReady(true), [])
  const onVegetationReady = useCallback(() => setVegetationReady(true), [])
  const retryRoads = useCallback(() => {
    setRoadState({ status: 'loading' })
    setVegetationReady(false)
    setRoadAttempt((attempt) => attempt + 1)
  }, [])
  const retryStartupBuildings = useCallback(() => { setMapState({ status: 'loading' }); setMapAttempt(attempt => attempt + 1); setTerrainReady(false); setVegetationReady(false); setFirstFrame(false) }, [])
  const retryStartupRoads = useCallback(() => { retryRoads(); setFirstFrame(false) }, [retryRoads])
  const exploreAvailableCampus = useCallback(() => setStartupExiting(true), [])
  const mapData = mapState.status === 'ready' ? mapState.data : null
  const roadData = roadState.status === 'ready' ? roadState.data : null
  const requestsSettled = mapState.status !== 'loading' && roadState.status !== 'loading'
  const twin = useDigitalTwin(mapData, roadData, requestsSettled, overrides, terrainSettings)
  const startup = campusStartup({ buildings: mapState.status, roads: roadState.status, terrain: terrainReady, vegetation: vegetationReady, frame: firstFrame, boundary: !!twin && twin.boundary.length >= 3, unavailable: sceneUnavailable })
  const loadingScreen = useMemo(() => ({
    phase: startup.phase, stages: startup.stages, exiting: startupExiting,
    retryBuildings: mapState.status === 'error' ? retryStartupBuildings : undefined,
    retryRoads: roadState.status === 'error' ? retryStartupRoads : undefined,
    onExplore: startup.canExplore ? exploreAvailableCampus : undefined,
  }), [startup.phase, startup.stages[0], startup.stages[1], startup.stages[2], startup.stages[3], startup.canExplore, startupExiting, mapState.status, roadState.status, retryStartupBuildings, retryStartupRoads, exploreAvailableCampus])
  useLayoutEffect(() => {
    loadingBoundary?.report(startupVisible ? loadingScreen : null)
  }, [loadingBoundary, startupVisible, loadingScreen])
  useEffect(() => {
    if (!startupVisible || !startup.complete && !startupExiting) return
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (!startupExiting) {
      // A warm cache can finish before the foreground arrival. Let that short
      // motion settle before beginning the retreat, without faking progress.
      const delay = reducedMotion ? 0 : Math.max(0, CAMPUS_LOADING_ENTRY_MS - (performance.now() - startupStartedAt.current))
      const timer = window.setTimeout(() => setStartupExiting(true), delay)
      return () => window.clearTimeout(timer)
    }
    const duration = reducedMotion ? 180 : CAMPUS_LOADING_EXIT_MS
    const timer = window.setTimeout(() => setStartupVisible(false), duration)
    return () => window.clearTimeout(timer)
  }, [startupVisible, startup.complete, startupExiting])
  const socialSeats = useMemo(() => twin ? theatreSeats(twin.theatre).filter(seat => seat.row >= 3) : [], [twin])
  const campusLive = useCampusSession(!!firebasePublicConfig && !!twin && twin.boundary.length >= 3, campusPose, view === 'walk', footballJoined ? 'football' : oatJoined ? 'concert' : view === 'walk' ? 'walk' : 'overview', import.meta.env.DEV && !firebasePublicConfig, socialSeats)
  const stopSocial = useCallback(() => { campusLive.socialAction('stop') }, [campusLive.socialAction])
  useEffect(() => {
    if (!oatJoined || !twin || view === 'walk') return
    // Concert visitors have a live presence even before their first walk.
    campusPose.current = { x: twin.theatre.center.x, y: twin.theatre.elevation + .53, z: twin.theatre.center.z, yaw: twin.theatre.rotation, vehicle: 'walk', moving: false, running: false, airborne: false, active: true, visible: false, space: 'outdoors', epoch: (campusPose.current?.epoch ?? 0) + 1 }
  }, [oatJoined, twin, view])
  const selfColor = campusLive.people.find(p => p.id === campusLive.session.current.id)?.color
  const unreadChat = campusOpen ? 0 : campusLive.messages.filter(m => m.time > chatReadAt && m.sender !== campusLive.session.current.id).length
  useEffect(() => { if (campusOpen) setChatReadAt(Date.now()) }, [campusOpen, campusLive.messages])
  const pitch = useMemo(() => { const sports = twin?.locations.find(location => location.id === 'sports-ground'); return sports ? footballPitch(sports) : null }, [twin])
  const football = useFootballSession(footballJoined, footballRetry, footballInput, avatarPosition, pitch)
  const hostelPlan = twin?.interiors?.hostel ?? null
  const gyanPlan = twin?.interiors?.gyan ?? null
  const [selection, setSelection] = useState<BuildingSelection | null>(selectionForLocation(initial.to ?? initial.location ?? ''))
  const viewHostelCourtyards = () => {
    if (!hostelPlan) return
    const points = hostelPlan.holes.flat(), x = (Math.min(...points.map(p => p.x)) + Math.max(...points.map(p => p.x))) / 2, z = (Math.min(...points.map(p => p.z)) + Math.max(...points.map(p => p.z))) / 2
    setView('overview')
    setCameraRequest(request => ({ sequence: request.sequence + 1, locationId: 'boys-hostel', view: { position: [x, hostelPlan.base + 150, z + 8], target: [x, hostelPlan.base, z] } }))
  }
  const [navigationOpen, setNavigationOpen] = useState(initialView === 'overview' && !!initial.to)
  const [startId, setStartId] = useState(initial.from ?? '@current')
  const locations = twin?.locations ?? editableMetadata
  const catalog = useMemo(() => [...locations, ...(twin?.selections.filter((item) => item.matchMethod === 'unmatched').map((item) => item.location) ?? [])], [locations, twin])
  const activeSelection = useMemo(() => selection ? selectionForLocation(selection.location.id, catalog, twin?.selections) ?? selection : null, [selection, catalog, twin])
  const analyticsEntered = useRef(false)
  const analyticsState = useRef({ mode: '', selection: '', football: '', concert: '' })
  useEffect(() => {
    if (!twin || analyticsEntered.current) return
    analyticsEntered.current = true
    trackCampusEvent('campus_enter')
  }, [twin])
  useEffect(() => {
    if (analyticsState.current.mode === view) return
    analyticsState.current.mode = view
    trackCampusEvent('exploration_mode', { mode: view })
  }, [view])
  useEffect(() => {
    const id = activeSelection?.location.id || ''
    if (analyticsState.current.selection === id) return
    analyticsState.current.selection = id
    if (activeSelection) trackCampusEvent('select_building', { category: activeSelection.location.category })
  }, [activeSelection?.location.id])
  useEffect(() => {
    if (analyticsState.current.football === football.connection) return
    analyticsState.current.football = football.connection
    if (football.connection === 'live') trackCampusEvent('join_activity', { activity: 'football' })
  }, [football.connection])
  useEffect(() => {
    if (analyticsState.current.concert === oat.connection) return
    analyticsState.current.concert = oat.connection
    if (oat.connection === 'live') trackCampusEvent('join_activity', { activity: 'concert' })
  }, [oat.connection])
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
  const chooseLocation = useCallback((id: string) => {
    const next = selectionForLocation(id, catalog, twin?.selections)
    if (!next) return
    revealPanels()
    setSelection(next)
    setNavigationOpen(false)
    if (view === 'overview') onFlyTo(id)
  }, [catalog, twin, onFlyTo, view, revealPanels])
  const chooseNavigationDestination = useCallback((id: string) => { chooseLocation(id); setNavigationOpen(true) }, [chooseLocation])
  const closeNavigation = useCallback(() => setNavigationOpen(false), [])
  const openNavigation = useCallback(() => { revealPanels(); setOatJoined(false); setOatOpen(false); setView('overview'); setNavigationOpen(true) }, [revealPanels])
  const clearSelection = useCallback(() => { if (!editorOpen && !slopeEditorOpen && !picking) setSelection(null) }, [editorOpen, picking, slopeEditorOpen])
  const onSelectBuilding = useCallback((next: BuildingSelection) => {
    if (slopeEditorOpen || picking?.mode === 'point') return
    if (picking?.mode === 'building' && next.buildingId) { setPicked({ locationId: picking.locationId, buildingId: next.buildingId, coordinates: next.location.coordinates }); setPicking(null); return }
    if (!editorOpen) { revealPanels(); setSelection(next) }
  }, [editorOpen, picking, slopeEditorOpen, revealPanels])
  const editLocation = useCallback((id: string) => { setOatJoined(false); setOatOpen(false); closeSlopeEditor(); setView('overview'); setEditorLocationId(id); setEditorOpen(true); setNavigationOpen(false); setPicking(null); setPicked(null); setSelection(selectionForLocation(id, catalog, twin?.selections)); if (['main-entrance', 'sports-ground'].includes(id)) setCameraRequest((request) => ({ sequence: request.sequence + 1, locationId: null })) }, [catalog, twin, closeSlopeEditor])
  const changeView = useCallback((next: ExplorerView) => {
    setView(next); setFootballJoined(false); setOatJoined(false); setOatOpen(false); closeEditor(); closeSlopeEditor(); setNavigationOpen(false); setSelection(null); setWalkManualPause(false)
    setPlayback(previous => ({ ...previous, status: 'stopped', sequence: previous.sequence + 1 }))
    walkInput.current = emptyWalkInput()
    if (next === 'overview') setCameraRequest(request => ({ sequence: request.sequence + 1, locationId: null }))
  }, [closeEditor, closeSlopeEditor])
  const joinFootball = () => { changeView('walk'); setFootballJoined(true); setFootballStatus(null); setWalkSpawn(request => ({ sequence: request.sequence + 1, locationId: 'sports-ground', football: true })) }
  const openOat = () => {
    if (!oatOpen) changeView('overview')
    setOatOpen(true); setSelection(selectionForLocation('open-air-theatre', catalog, twin?.selections))
    setCameraRequest(request => ({ sequence: request.sequence + 1, locationId: 'open-air-theatre' }))
  }
  const enterHostel = useCallback(() => {
    changeView('walk'); setWalkSpawn(request => ({ sequence: request.sequence + 1, locationId: 'boys-hostel', enterHostel: true }))
  }, [changeView])
  const enterGyan = useCallback(() => { changeView('walk'); setWalkSpawn(request => ({sequence:request.sequence+1,locationId:GYAN_MANDIR_ID,enterGyan:true})) },[changeView])
  const viewNescafeSlope = () => {
    if (!twin?.slope) return
    changeView('overview')
    setCameraRequest(request => ({ sequence: request.sequence + 1, locationId: null, routePoints: [twin.slope!.lower, twin.slope!.upper] }))
  }
  const viewCampusSlope = (section: 'gate' | 'faculty') => {
    const profile = section === 'gate' ? twin?.slope?.gateApproach : twin?.slope?.facultyApproach
    if (!profile) return
    changeView('overview')
    setCameraRequest(request => ({ sequence: request.sequence + 1, locationId: null, routePoints: [profile.lower, profile.upper] }))
  }
  const openSlopeEditor = () => { changeView('overview'); setSlopeEditorOpen(true) }
  const viewSlopeSection = (points: LocalCoordinate[]) => setCameraRequest(request => ({ sequence: request.sequence + 1, locationId: null, routePoints: points }))
  const walkPaused = startupVisible || accountOpen || walkManualPause || galleryOpen || uploadOpen || authOpen || editorOpen || slopeEditorOpen || terrainControlsOpen
  const onRenderedCount = useCallback((count: number) => {
    if (import.meta.env.DEV) console.info('[NIT Goa OSM] Buildings successfully rendered:', count)
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    loadMapWithCache('roads', () => publishedMap ? fetchPublishedCampusRoads(controller.signal) : fetchCampusRoads(controller.signal, true), browserStorage, controller.signal, !online)
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
  }, [roadAttempt, online, publishedMap])

  useEffect(() => {
    const controller = new AbortController()
    if (import.meta.env.DEV) console.info('[NIT Goa OSM] Campus coordinate origin:', { lat: LAT0, lon: LON0, x: 0, z: 0 })
    loadMapWithCache('buildings', () => publishedMap ? fetchPublishedCampusData(controller.signal) : fetchCampusData(controller.signal, true), browserStorage, controller.signal, !online)
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
  }, [mapAttempt, online, publishedMap])

  useEffect(() => {
    const changed = () => setOnline(navigator.onLine)
    window.addEventListener('online', changed); window.addEventListener('offline', changed)
    return () => { window.removeEventListener('online', changed); window.removeEventListener('offline', changed) }
  }, [])
  useEffect(() => {
    const restore = () => {
      const state = parseURLState(window.location.href, catalog.map((p) => p.id))
      const restoredView = explorerViewFromURL(window.location.href); setView(restoredView); setFootballJoined(false); setOatJoined(false); setOatOpen(new URL(window.location.href).searchParams.get('concert') === '1'); closeEditor(); closeSlopeEditor(); setWalkManualPause(false)
      lastURLState.current = JSON.stringify({ location: state.to ?? state.location, from: state.to ? state.from ?? 'main-entrance' : null, to: state.to, night: state.night, photo: state.photo, view: restoredView })
      const id = state.to ?? state.location
      setSelection(id ? selectionForLocation(id, catalog, twin?.selections) : null)
      setNavigationOpen(restoredView === 'overview' && !!state.to); setStartId(state.from ?? '@current'); setNight(state.night); setPhotoId(state.photo); setGalleryOpen(!!state.photo)
      setCameraRequest((p) => ({sequence: p.sequence + 1, locationId: id}))
    }
    window.addEventListener('popstate', restore); return () => window.removeEventListener('popstate', restore)
  }, [catalog, twin, closeEditor, closeSlopeEditor])
  useEffect(() => {
    const state = { location: activeSelection?.location.id ?? null, from: navigationOpen && activeSelection ? startId === '@current' ? 'main-entrance' : startId : null, to: navigationOpen ? activeSelection?.location.id ?? null : null, night, photo: photoId, view }
    const snapshot = JSON.stringify(state)
    if (lastURLState.current === snapshot) return
    lastURLState.current = snapshot
    const url = withExplorerView(serializeURLState(state, window.location.href), view)
    if (url !== window.location.pathname + window.location.search + window.location.hash) window.history.pushState(null, '', url)
  }, [activeSelection?.location.id, navigationOpen, startId, night, photoId, view])
  useEffect(() => { if (twin && !initialSelectionResolved.current && (initial.to ?? initial.location)) { initialSelectionResolved.current = true; const resolved = selectionForLocation(initial.to ?? initial.location!, catalog, twin.selections); if (resolved) setSelection(resolved) } }, [twin])

  return (<>
    <main ref={explorer} inert={startupVisible} aria-hidden={startupVisible || undefined} className={`explorer ${!layout.panels ? 'panels-hidden' : ''} ${!layout.minimap ? 'minimap-hidden' : ''} ${!layout.toolbar ? 'toolbar-hidden' : ''} ${night ? 'night-mode' : 'day-mode'} ${picking || slopePicking ? 'picking-location' : ''} ${editorOpen || slopeEditorOpen ? 'editing-campus' : ''} ${view === 'walk' ? 'walk-mode' : ''} ${footballJoined ? 'football-mode' : ''} ${oatOpen ? 'oat-mode' : ''} ${campusOpen ? 'social-open' : ''}`} aria-label="NIT Goa 3D campus explorer">
      <ViewControls explorer={explorer} layout={layout} onChange={changeLayout} view={view} drag={overviewDrag} onDrag={setOverviewDrag} vehicle={walkStatus?.vehicle ?? 'walk'} football={footballJoined} />
      <div className="scene-viewport" aria-label={view === 'walk' ? 'Avatar campus exploration. WASD to move, arrows or drag to look, scroll or pinch with two fingers to zoom, Shift to run, Space or J to jump (J during football), E to inspect nearby places.' : `Interactive campus. Click a building for details, left-drag to ${overviewDrag === 'pan' ? 'move the view' : 'rotate'}, right-drag to rotate, scroll or pinch with two fingers to zoom. Touch: one finger to rotate, pinch to zoom, three fingers to move the view.`}>
        <Suspense fallback={null}><CampusScene
          overviewDrag={overviewDrag}
          scenePrepared={requestsSettled && !!twin && terrainReady && vegetationReady}
          onSceneReady={onSceneReady} onSceneUnavailable={onSceneUnavailable}
          oatConcert={oat.snapshot}
          onSocialStop={stopSocial} onBuggyRide={campusLive.rideBuggy} campusPeople={campusLive.people} campusSession={campusLive.session} campusPose={campusPose} campusMessages={campusLive.messages} avatarStyle={campusLive.people.find(p => p.id === campusLive.session.current.id)?.avatarStyle ?? avatarStyle} avatarColor={selfColor ? CAMPUS_COLORS[selfColor] : undefined}
          footballPitch={pitch} footballJoined={footballJoined} footballLive={football.connection === 'live'} footballSession={football.session} footballPlayers={football.players} footballInput={footballInput} onFootballStatus={onFootballStatus}
          showContours={terrainSettings.showContours} hostelPlan={hostelPlan} gyanPlan={gyanPlan} interiorPose={interiorPose} processedWalkSpawn={processedWalkSpawn} hostelFloor={walkStatus?.interior?.floor ?? null} stairLowFloor={walkStatus?.interior?.stairLowFloor ?? null} interiorBuildingId={walkStatus?.interior ? interiorPose.current?.buildingId ?? null : null}
          view={view} walkPaused={walkPaused} walkInput={walkInput} avatarPosition={avatarPosition} walkSpawn={walkSpawn} onWalkStatus={onWalkStatus} onWalkInspect={chooseLocation}
          presentation={presentation} playback={playback} travelerPosition={travelerPosition} onWalkComplete={onWalkComplete}
          slopePreview={slopeEditorOpen ? slopePreview : null} pickingPosition={!!slopePicking || picking?.mode === 'point'} pickedPosition={editorOpen ? picked?.coordinates ?? null : null} onPickPosition={onPickPosition}
          showGrid={showGrid}
          twin={twin} graphicsMode={graphicsMode}
          night={night}
          cameraRequest={cameraRequest}
          onTerrainReady={onTerrainReady}
          onVegetationReady={onVegetationReady}
          onRenderedCount={onRenderedCount}
          selectedBuildingId={activeSelection?.buildingId ?? null}
          selectedLocationId={activeSelection?.location.id ?? null}
          onSelectBuilding={onSelectBuilding}
          onClearSelection={clearSelection}
        /></Suspense>
      </div>
      <LoadingOverlay state={mapState} roadState={roadState} terrainReady={terrainReady} vegetationReady={vegetationReady} onRetryRoads={retryRoads} onRetryBuildings={() => { setMapState({ status: 'loading' }); setMapAttempt(attempt => attempt + 1) }} />
      {!editorOpen && !slopeEditorOpen && !footballJoined && !oatOpen && (navigationOpen ? <NavigationMode locations={catalog}
        destination={activeSelection?.location ?? null} startId={startId} onStartChange={setStartId} onDestinationChange={chooseNavigationDestination}
        presentation={presentation} playback={playback} onPlayback={setPlayback} onViewRoute={viewRoute} roadStatus={roadState.status} onClose={closeNavigation} />
        : <BuildingInfoPanel onOpenConcert={openOat} onPlayFootball={joinFootball} gyanPlan={gyanPlan} onEnterGyan={enterGyan} hostelPlan={hostelPlan} onEnterHostel={enterHostel} onViewCourtyards={hostelPlan ? viewHostelCourtyards : undefined} walkMode={view === 'walk'} onEdit={canEdit ? editLocation : undefined} onGallery={onGallery} onUpload={onUpload} selection={activeSelection} locations={locations} center={center} onClose={clearSelection} onFlyTo={onFlyTo} onNavigate={openNavigation} onSelectLocation={chooseLocation} />)}
      {oatOpen && <OatControls session={oat} joined={oatJoined} onJoin={name => { setOatName(name); setOatJoined(true) }} onRetry={() => setOatRetry(value => value + 1)} onClose={closeOat} />}
      {editorOpen && <Suspense fallback={<p className="scene-loading">Opening location editor…</p>}><CampusLocationEditor locations={catalog} locationId={editorLocationId}
        assignedBuildingId={twin?.selections.find((item) => item.location.id === editorLocationId)?.buildingId ?? null} picking={picking} picked={picked} edits={overrides}
        onLocation={(id) => { setEditorLocationId(id); setPicking(null); setPicked(null) }} onPick={setPicking} onSave={saveCorrection} onReset={resetCorrection} onClose={closeEditor} /></Suspense>}
      {slopeEditorOpen && <Suspense fallback={<p className="scene-loading">Opening slope editor…</p>}><SlopeEditor settings={terrainSettings} picking={slopePicking} picked={slopePicked} onPick={setSlopePicking} onChange={applyTerrainSettings} onPreview={setSlopePreview} onView={viewSlopeSection} onClose={closeSlopeEditor} /></Suspense>}
      <MiniMap avatarPosition={view === 'walk' ? avatarPosition : undefined} presentation={view === 'overview' ? presentation : null} travelerPosition={travelerPosition} twin={twin} selection={activeSelection} onSelect={(id) => {
        const match = twin?.selections.find((item) => item.location.id === id)
        if (picking?.mode === 'building' && match) onSelectBuilding(match)
        else if (!picking && !slopeEditorOpen) chooseLocation(id)
      }} />

      {(!online || Object.keys(cacheNotices).length > 0 || mapState.status === 'error') && <div className="resilience-notice" role="status">
        {!online && 'Offline · '}{Object.keys(cacheNotices).length > 0 ? `Using cached map data · ${Object.keys(cacheNotices).join(' and ')} · Updated ${cacheAge(Math.min(...Object.values(cacheNotices).map((c) => c.timestamp)))}${Object.values(cacheNotices).some((c) => c.stale) ? ' (older than 24 hours)' : ''}` : mapState.status === 'error' ? 'Map unavailable. Reconnect or retry; no usable building cache is available.' : 'Live map loading paused.'}
        <button className="text-button" onClick={() => { setMapState({status:'loading'}); setMapAttempt((p) => p+1); retryRoads() }}>Retry map</button></div>}
      <header className={`scene-header ${mobileToolsOpen ? 'mobile-tools-open' : ''}`}>
        <div className="title-block">
          <span className="eyebrow"><span className="live-dot" /> NIT GOA · CUNCOLIM</span>
          <h1>NIT Goa <span>3D Explorer</span></h1>
          <div className="explorer-version-switch" role="group" aria-label="Explorer version">
            <button aria-pressed={view === 'overview'} onClick={() => changeView('overview')}>Overview</button>
            <button aria-pressed={view === 'walk'} onClick={() => changeView('walk')} disabled={!twin || twin.boundary.length < 3}>Walk with avatar</button>
          </div>
        </div>
        <button className="mobile-tools-toggle" aria-expanded={mobileToolsOpen} aria-label={mobileToolsOpen ? 'Hide campus tools' : 'Show campus tools'} onClick={() => setMobileToolsOpen(value => !value)}>{mobileToolsOpen ? 'Close ×' : 'Tools ☷'}</button>
        <SearchBar locations={catalog} onSelect={chooseLocation} />
        <div className="scene-toolbar">
          <button className="toolbar-button" disabled={!twin || twin.boundary.length < 3} onClick={joinFootball}>⚽ Play football</button>
          <button className="toolbar-button" disabled={!twin || twin.boundary.length < 3} onClick={openOat}>🎤 OAT concerts</button>
          <button className="toolbar-button campus-live-toggle" aria-expanded={campusOpen} onClick={() => setCampusOpen(value => !value)}><span className={`campus-connection-dot ${campusLive.connection === 'live' ? 'connected' : ''}`} />{campusLive.connection === 'live' ? `${campusLive.people.length} on campus` : campusLive.connection === 'waiting' ? `Campus queue · ${campusLive.queue}` : 'People & chat'}{unreadChat > 0 && <span className="campus-unread" aria-label={`${unreadChat} unread chat messages`}>{Math.min(99, unreadChat)}</span>}</button>
          {canEdit && <button className="toolbar-button edit-campus-toggle" aria-pressed={editorOpen} onClick={() => editorOpen ? closeEditor() : editLocation('main-entrance')}>✎ Edit campus</button>}
          <button className="toolbar-button" onClick={() => onGallery()}>▧ Gallery</button>
          <button type="button" className="toolbar-button mode-toggle" aria-pressed={night} aria-label="Toggle night mode" onClick={() => setNight((value) => !value)}>{night ? '🌙 Night' : '☀ Day'}</button>
          <GraphicsControl mode={graphicsMode} onChange={changeGraphics} />
          <SocialActions live={campusLive} pose={campusPose} seats={socialSeats} walking={view === 'walk'} concert={oatJoined} disabled={footballJoined || view === 'walk' && walkPaused} />
          <AtmosphereControls pose={campusPose} night={night} walking={view === 'walk'} concert={oatJoined} />
          {view === 'overview' && <button type="button" className="toolbar-button navigate-toggle" aria-pressed={navigationOpen} onClick={() => setNavigationOpen((value) => !value)}>📍 Navigate</button>}
          {canEdit && <button type="button" className="toolbar-button" aria-pressed={showGrid} onClick={() => setShowGrid((value) => !value)}>▦ Grid {showGrid ? 'on' : 'off'}</button>}
          {canEdit && <TerrainControls settings={terrainSettings} onChange={applyTerrainSettings} onOpenChange={setTerrainControlsOpen} onViewCampusSlope={twin?.slope ? viewCampusSlope : undefined} onEditSlopes={twin ? openSlopeEditor : undefined} onViewSlope={twin?.slope ? viewNescafeSlope : undefined} />}
          <button type="button" className="toolbar-button" onClick={onResetCamera}>{view === 'walk' ? '↺ Reset walk' : '↺ Reset view'}</button>
          {accountControl}
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
      {view === 'walk' && <WalkControls compact={!layout.panels} campusLive={campusLive} input={walkInput} status={walkStatus} paused={walkPaused} ready={!!twin && twin.boundary.length >= 3} locations={catalog} onPause={() => setWalkManualPause(previous => !previous)} onSpawn={spawnNear} onInspect={chooseLocation} onOverview={() => changeView('overview')} />}
      {footballJoined && <FootballControls input={footballInput} status={footballStatus} connection={football.connection} players={football.players} selfId={football.session.current.id} paused={walkPaused} onLeave={() => { setFootballJoined(false); footballInput.current.actor = null }} onRetry={() => setFootballRetry(value => value + 1)} />}
      <CampusSocial live={campusLive} open={campusOpen} onClose={() => setCampusOpen(false)} pose={campusPose} walking={view === 'walk'} />
      <a className="map-credit" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors</a>
    </main>
    {!loadingBoundary && startupVisible && <CampusLoadingScreen {...loadingScreen} />}
    </>
  )
}
