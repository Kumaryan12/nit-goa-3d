import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { CameraControls, CameraControlsImpl, Sky, Stars } from '@react-three/drei'
import { ACESFilmicToneMapping, PCFShadowMap } from 'three'
import { sceneConfig } from '../lib/sceneConfig'
import { campusCameraView, flyToLocation, routeCameraView } from '../lib/camera'
import { bindCameraGestures } from '../lib/cameraGestures'
import type { CameraRequest } from '../lib/camera'
import { gpsToLocal } from '../lib/geo'
import { createAdministrationFacade } from '../lib/administrationFacade'
import { createCampusFacade, campusFacadeCamera } from '../lib/campusFacade'
import type { CampusFacadePlan } from '../lib/campusFacade'
import { generateTerrain } from '../lib/terrain'
import type { DigitalTwin } from '../lib/digitalTwin'
import type { BuildingSelection } from '../types/campus'
import Lighting from './Lighting'
import CampusStreetlights from './CampusStreetlights'
import CampusNationalFlag from './CampusNationalFlag'
import CampusGardens from './CampusGardens'
import CampusMeadow from './CampusMeadow'
import FootballScene from './FootballScene'
import type { FootballControls, FootballPitch, FootballStatus } from '../lib/football'
import type { FootballPlayer, FootballSession } from '../lib/footballProtocol'
import AvatarExplorer from './AvatarExplorer'
import BuildingInterior from './BuildingInterior'
import type { HostelPlan, InteriorPose } from '../lib/hostelInterior'
import type { ExplorerView, WalkInput, WalkSpawnRequest, WalkStatus } from '../lib/walking'
import LocationPicker from './LocationPicker'
import SlopePreview from './SlopePreview'
import type { SlopePreviewPoints } from './SlopeEditor'
import Terrain from './Terrain'
import TerrainContours from './TerrainContours'
import CampusBoundary from './CampusBoundary'
import Vegetation from './Vegetation'
import POIObjects from './POIObjects'
import LocationLabels from './LocationLabels'
import OSMBuildings from './OSMBuildings'
import OSMRoads from './OSMRoads'
import EntranceCanal from './EntranceCanal'
import OpenAirTheatre from './OpenAirTheatre'
import OatConcertScene from './OatConcertScene'
import type { OatSnapshot } from '../lib/oatProtocol'
import BuildingWindows from './BuildingWindows'
import RouteOverlay from './RouteOverlay'
import RouteTraveler from './RouteTraveler'
import type { Playback, RoutePresentation } from '../lib/traversal'
import type { LocalCoordinate } from '../lib/geo'
import CampusPeopleScene from './CampusPeopleScene'
import HostelCourtyards from './HostelCourtyards'
import ScenePerformance, { GraphicsContext } from './ScenePerformance'
import { adaptGraphics, graphicsProfile, initialGraphics } from '../lib/graphics'
import type { GraphicsMode } from '../lib/graphics'
import type { CampusChat, CampusPerson, CampusPose, CampusSession } from '../lib/campusProtocol'

export interface SceneMetrics { fps: number; calls: number; triangles: number }
interface CampusSceneProps {
  onSocialStop: () => void
  graphicsMode: GraphicsMode
  onBuggyRide: (driverId: string | null) => void
  campusPeople: CampusPerson[]
  campusSession: React.RefObject<CampusSession>
  campusPose: React.RefObject<CampusPose | null>
  campusMessages: CampusChat[]
  avatarColor?: string
  oatConcert: OatSnapshot | null
  footballPitch: FootballPitch | null
  footballJoined: boolean
  footballLive: boolean
  footballSession: React.RefObject<FootballSession>
  footballPlayers: FootballPlayer[]
  footballInput: React.RefObject<FootballControls>
  onFootballStatus: (status: FootballStatus) => void
  gyanPlan: HostelPlan | null
  interiorBuildingId: string | null
  hostelPlan: HostelPlan | null
  interiorPose: React.RefObject<InteriorPose | null>
  processedWalkSpawn: React.RefObject<number>
  hostelFloor: number | null
  stairLowFloor: number | null
  view: ExplorerView
  walkPaused: boolean
  walkInput: React.RefObject<WalkInput>
  avatarPosition: React.RefObject<LocalCoordinate | null>
  walkSpawn: WalkSpawnRequest
  onWalkStatus: (status: WalkStatus) => void
  onWalkInspect: (id: string) => void
  slopePreview: SlopePreviewPoints | null
  pickingPosition: boolean
  pickedPosition: LocalCoordinate | null
  onPickPosition: (point: LocalCoordinate) => void
  presentation: RoutePresentation | null
  playback: Playback
  travelerPosition: React.RefObject<LocalCoordinate | null>
  onWalkComplete: () => void
  showGrid: boolean
  showContours: boolean
  night: boolean
  twin: DigitalTwin | null
  cameraRequest: CameraRequest
  onRenderedCount: (count: number) => void
  onTerrainReady: () => void
  onVegetationReady: (count: number) => void
  onMetrics?: (metrics: SceneMetrics) => void
  selectedBuildingId: string | null
  selectedLocationId: string | null
  onSelectBuilding: (selection: BuildingSelection) => void
  onClearSelection: () => void
}

const loadingTerrain = generateTerrain(650, { boundary: [], buildings: [], roads: [], clearings: [] }, 48)
const noop = () => {}

function Navigation({ twin, request, facades }: { twin: DigitalTwin | null; request: CameraRequest; facades: Map<string, CampusFacadePlan> }) {
  const controls = useRef<CameraControls>(null)
  const { width, height } = useThree((state) => state.size), gl = useThree(state => state.gl)
  const pinchDistance = useRef<number | null>(null)
  useEffect(() => {
    const control = controls.current
    if (!control) return
    const reset = () => { pinchDistance.current = null }
    const wheel = (event: WheelEvent) => { if (!event.ctrlKey) reset() }
    gl.domElement.addEventListener('pointerdown', reset)
    gl.domElement.addEventListener('wheel', wheel, { passive: true })
    const unbind = bindCameraGestures(gl.domElement, { zoom: ratio => {
      const next = Math.max(control.minDistance, Math.min(control.maxDistance, (pinchDistance.current ?? control.distance) * ratio))
      pinchDistance.current = next; void control.dollyTo(next, true)
    } })
    control.addEventListener('rest', reset)
    return () => { unbind(); gl.domElement.removeEventListener('pointerdown', reset); gl.domElement.removeEventListener('wheel', wheel); control.removeEventListener('rest', reset) }
  }, [gl])
  // Road arrival, selection, grid and lighting changes never reframe the camera.
  const points = useMemo(() => twin?.buildings.flatMap((building) => building.outer.map(gpsToLocal)) ?? [], [twin])
  const framingKey = points.map((point) => `${point.x},${point.z}`).join(';')
  const home = useMemo(() => campusCameraView(points, width / height), [framingKey, width, height])
  const facadeDestination = () => {
    const index = twin?.selections.findIndex(selection => selection.location.id === request.locationId) ?? -1
    const building = twin?.buildings[index], plan = building && facades.get(building.id)
    return plan && building ? campusFacadeCamera(plan, building.baseElevation ?? 0) : null
  }
  useEffect(() => {
    const destination = request.view ?? (request.routePoints ? routeCameraView(request.routePoints, width / height) : request.locationId ? facadeDestination() ?? flyToLocation(request.locationId, twin?.locations,
      twin?.locations.find((location) => location.id === request.locationId)?.height) : home)
    if (destination) void controls.current?.setLookAt(...destination.position, ...destination.target, !window.matchMedia('(prefers-reduced-motion: reduce)').matches)
    // Resizing or entering fullscreen preserves the visitor's camera position.
  }, [framingKey])
  useEffect(() => {
    const building = twin?.selections.findIndex((selection) => selection.location.id === request.locationId) ?? -1
    const destination = request.view ?? (request.routePoints ? routeCameraView(request.routePoints, width / height) : request.locationId
      ? facadeDestination() ?? flyToLocation(request.locationId, twin ? [...twin.locations, ...twin.selections.filter((item) => item.matchMethod === 'unmatched').map((item) => item.location)] : undefined, twin?.buildings[building]?.height)
      : home)
    if (destination) void controls.current?.setLookAt(...destination.position, ...destination.target, !window.matchMedia('(prefers-reduced-motion: reduce)').matches)
    // Requests have a monotonic sequence so repeated clicks on the same place work.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request])
  return <CameraControls ref={controls} makeDefault smoothTime={0.4} draggingSmoothTime={0.18} azimuthRotateSpeed={0.45} polarRotateSpeed={0.45} dollySpeed={0.28}
    touches={{ one: CameraControlsImpl.ACTION.TOUCH_ROTATE, two: CameraControlsImpl.ACTION.TOUCH_DOLLY, three: CameraControlsImpl.ACTION.TOUCH_TRUCK }}
    minDistance={12} maxDistance={twin ? twin.size * 2 : 2000} maxPolarAngle={Math.PI / 2 - 0.035} />
}

function RuntimeMetrics({ onMetrics }: { onMetrics: (metrics: SceneMetrics) => void }) {
  const elapsed = useRef(0), frames = useRef(0)
  useFrame(({ gl }, delta) => {
    elapsed.current += delta; frames.current++
    if (elapsed.current >= 2) {
      onMetrics({ fps: Math.round(frames.current / elapsed.current), calls: gl.info.render.calls, triangles: gl.info.render.triangles })
      elapsed.current = 0; frames.current = 0
    }
  })
  return null
}

function CampusScene({ onSocialStop, graphicsMode, onBuggyRide, campusPeople, campusSession, campusPose, campusMessages, avatarColor, oatConcert, footballPitch, footballJoined, footballLive, footballSession, footballPlayers, footballInput, onFootballStatus, hostelPlan, gyanPlan, interiorBuildingId, interiorPose, processedWalkSpawn, hostelFloor, stairLowFloor, view, walkPaused, walkInput, avatarPosition, walkSpawn, onWalkStatus, onWalkInspect, slopePreview, pickingPosition, pickedPosition, onPickPosition, presentation, playback, travelerPosition, onWalkComplete, showGrid, showContours, night, twin, cameraRequest, onRenderedCount, onTerrainReady, onVegetationReady, onMetrics, selectedBuildingId, selectedLocationId, onSelectBuilding, onClearSelection }: CampusSceneProps) {
  const compact = useRef(window.matchMedia('(pointer: coarse)').matches || navigator.hardwareConcurrency <= 4).current
  const adaptation = useRef(initialGraphics(compact)), [qualityLevel, setQualityLevel] = useState(adaptation.current.level)
  const profile = useMemo(() => graphicsProfile(graphicsMode, qualityLevel), [graphicsMode, qualityLevel])
  const reportMetrics = useCallback((metrics: SceneMetrics) => {
    onMetrics?.(metrics)
    if (graphicsMode !== 'auto' || document.hidden || !document.hasFocus()) return
    adaptation.current = adaptGraphics(adaptation.current, metrics.fps, 2, compact)
    setQualityLevel(adaptation.current.level)
  }, [graphicsMode, compact, onMetrics])
  const dynamicShadows = view === 'walk' || campusPeople.some(p => p.pose?.visible) || (footballLive && footballPlayers.length > 0) || !!oatConcert?.participants.length || playback.status === 'playing'
  const shadowRevision = useMemo(() => ({}), [twin, night, selectedBuildingId, hostelFloor, stairLowFloor, view])
  const size = twin?.size ?? 650
  const background = night ? '#101b30' : '#dcebe9'
  const labelLocations = useMemo(() => twin ? [...twin.locations, ...(twin.upperLocation && !twin.locations.some((location) => location.id === twin.upperLocation!.id) ? [twin.upperLocation] : [])] : [], [twin])
  const heights = useMemo(() => Object.fromEntries(twin?.selections.map((selection, i) => [selection.location.id, twin.buildings[i].height]) ?? []), [twin])
  const administration = useMemo(() => {
    if (!twin) return null
    const index = twin.selections.findIndex(selection => selection.location.id === 'administration-block')
    const entrance = twin.locations.find(location => location.id === 'main-entrance')
    return index < 0 || !entrance ? null : createAdministrationFacade(twin.buildings[index], entrance.coordinates, twin.roads)
  }, [twin])
  const facades = useMemo(() => new Map(twin?.buildings.flatMap((building, i) => {
    const plan = createCampusFacade(building, twin.selections[i], twin.roads, building.id===gyanPlan?.buildingId?gyanPlan:hostelPlan)
    return plan ? [[building.id, plan] as const] : []
  }) ?? []), [twin, hostelPlan, gyanPlan])
  const activeInterior=interiorBuildingId===gyanPlan?.buildingId?gyanPlan:hostelPlan
  const selectHostel = useCallback(() => { const selection = twin?.selections.find(item => item.buildingId === hostelPlan?.buildingId); if (selection) onSelectBuilding(selection) }, [twin, hostelPlan, onSelectBuilding])
  const selectGyan = useCallback(() => { const selection = twin?.selections.find(item => item.buildingId === gyanPlan?.buildingId); if (selection) onSelectBuilding(selection) }, [twin, gyanPlan, onSelectBuilding])
  const selectTheatre = useCallback(() => { const location = twin?.locations.find(item => item.id === 'open-air-theatre'); if (location) onSelectBuilding({ buildingId: null, matchMethod: 'unmatched', location }) }, [twin, onSelectBuilding])
  const windowBuildings = useMemo(() => twin?.buildings.filter(building => building.id !== administration?.buildingId && !facades.has(building.id) && !(view === 'walk' && hostelFloor !== null && activeInterior?.buildingId === building.id)) ?? [], [twin, administration, facades, view, hostelFloor, activeInterior])
  return <GraphicsContext.Provider value={profile}><Canvas shadows={{ type: PCFShadowMap }} dpr={[.65, profile.dpr]}
    onPointerMissed={(event) => { if (event.button === 0) onClearSelection() }}
    camera={{ position: sceneConfig.cameraPosition, fov: 45, near: 1, far: 10000 }}
    gl={{ antialias: !compact, toneMapping: ACESFilmicToneMapping }}
    fallback={<p className="webgl-fallback">Your browser needs WebGL to display the campus scene.</p>}>
    <color attach="background" args={[background]} />
    <fog attach="fog" args={[background, size * 1.1, size * 3]} />
    {night ? <Stars radius={3000} depth={150} count={1100} factor={2.2} saturation={0} fade speed={0} />
      : <Sky distance={450000} sunPosition={sceneConfig.sunPosition} turbidity={2.4} rayleigh={1.1} mieCoefficient={0.004} mieDirectionalG={0.8} />}
    <ScenePerformance dynamicShadows={dynamicShadows} revision={shadowRevision} />
    <Lighting groundSize={size} night={night} />
    <Terrain model={twin?.terrain ?? loadingTerrain} patches={twin?.terrainPatches} onReady={twin ? onTerrainReady : noop} />
    {showContours && twin && <TerrainContours model={twin.terrain} night={night} />}
    {showGrid && <gridHelper args={[size, Math.round(size / sceneConfig.gridSpacing), '#7d8970', '#9ba584']} position={[0, 0.025, 0]} />}
    {twin && <>
      <CampusBoundary terrain={twin.hasRelief ? twin.terrain : undefined} points={twin.boundary} entrance={twin.locations.find((location) => location.id === 'main-entrance')!.coordinates} />
      <OSMRoads night={night} roads={twin.roads} terrain={twin.hasRelief ? twin.terrain : undefined} />
      {twin.canal && <EntranceCanal canal={twin.canal} terrain={twin.terrain} night={night} />}
      <OSMBuildings administration={administration} facades={facades} night={night} insideBuildingId={view==='walk' && hostelFloor!==null?interiorBuildingId:null} buildings={twin.buildings} assignments={twin.selections} onRenderedCount={onRenderedCount} selectedBuildingId={selectedBuildingId} onSelectBuilding={onSelectBuilding} />
      <BuildingWindows doorway={view === 'walk' ? hostelPlan : null} buildings={windowBuildings} night={night} />
      {hostelPlan && <HostelCourtyards building={hostelPlan.building} />}
      <CampusStreetlights lamps={twin.lamps} terrain={twin.terrain} night={night} indoors={view==='walk' && hostelFloor!==null} />
      {twin.flag && <CampusNationalFlag flag={twin.flag} night={night} />}
      {twin.vegetationReady && <Vegetation trees={twin.trees} onReady={onVegetationReady} />}
      {twin.vegetationReady && <CampusGardens gardens={twin.gardens} terrain={twin.terrain} />}
      {twin.meadow && <CampusMeadow chunks={twin.meadow} />}
      {twin.boundary.length > 0 && <POIObjects locations={twin.locations} roads={twin.roads} terrain={twin.hasRelief ? twin.terrain : undefined} />}
      {twin.boundary.length > 0 && <OpenAirTheatre theatre={twin.theatre} terrain={twin.terrain} night={night}
        selected={selectedLocationId === 'open-air-theatre'} onSelect={selectTheatre} />}
      {twin.boundary.length > 0 && <OatConcertScene theatre={twin.theatre} concert={oatConcert} people={campusPeople} session={campusSession} />}
      {view === 'walk' && hostelPlan && <BuildingInterior night={night} plan={hostelPlan} floor={interiorBuildingId===hostelPlan.buildingId?hostelFloor:null} stairLowFloor={interiorBuildingId===hostelPlan.buildingId?stairLowFloor:null} onSelect={selectHostel} />}
      {view==='walk' && gyanPlan && <BuildingInterior night={night} plan={gyanPlan} floor={interiorBuildingId===gyanPlan.buildingId?hostelFloor:null} stairLowFloor={interiorBuildingId===gyanPlan.buildingId?stairLowFloor:null} onSelect={selectGyan} />}
      {footballPitch && <FootballScene campusSession={campusSession} pitch={footballPitch} session={footballSession} players={footballPlayers} controls={footballInput} live={footballLive} onStatus={onFootballStatus} />}
      <CampusPeopleScene people={campusPeople} session={campusSession} messages={campusMessages} excludedIds={[...(footballLive ? footballPlayers.map(p => p.id) : []), ...(oatConcert?.participants.map(p => p.id) ?? [])]} space={hostelFloor !== null ? `${activeInterior?.kind==='classroom'?'gyan':'hostel'}:${stairLowFloor ?? hostelFloor}` : 'outdoors'} walking={view === 'walk'} />
      {!(view==='walk'&&hostelFloor!==null)&&<LocationLabels locations={labelLocations} heights={heights} />}
    </>}
    {view === 'overview' && twin && presentation && <><RouteOverlay presentation={presentation} terrain={twin.terrain} night={night} /><RouteTraveler presentation={presentation} terrain={twin.terrain} playback={playback} position={travelerPosition} onComplete={onWalkComplete} /></>}
    {slopePreview && twin && <SlopePreview points={slopePreview} terrain={twin.terrain} />}
    <LocationPicker active={pickingPosition} preview={pickedPosition} terrain={twin?.terrain ?? loadingTerrain} onPick={onPickPosition} />
    {view === 'overview' ? <Navigation twin={twin} request={cameraRequest} facades={facades} /> : twin && twin.boundary.length >= 3 && <AvatarExplorer onSocialStop={onSocialStop} onBuggyRide={onBuggyRide} campusSession={campusSession} campusPose={campusPose} avatarAccent={footballJoined ? avatarColor : undefined} footballJersey={footballJoined ? footballPlayers.find(player => player.id === footballSession.current.id)?.team === 'gold' ? '#d2a345' : '#388fc1' : avatarColor} footballPitch={footballJoined ? footballPitch : null} footballControls={footballInput} footballLive={footballLive} hostelPlan={hostelPlan} gyanPlan={gyanPlan} interiorPose={interiorPose} processedSpawn={processedWalkSpawn} twin={twin} paused={walkPaused} input={walkInput} position={avatarPosition} spawn={walkSpawn} onStatus={onWalkStatus} onInspect={onWalkInspect} />}
    <RuntimeMetrics onMetrics={reportMetrics} />
  </Canvas></GraphicsContext.Provider>
}

export default memo(CampusScene)
