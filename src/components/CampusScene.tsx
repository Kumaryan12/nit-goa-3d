import { memo, useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { CameraControls, Sky, Stars } from '@react-three/drei'
import { ACESFilmicToneMapping, PCFShadowMap } from 'three'
import { sceneConfig } from '../lib/sceneConfig'
import { campusCameraView, flyToLocation, routeCameraView } from '../lib/camera'
import type { CameraRequest } from '../lib/camera'
import { gpsToLocal } from '../lib/geo'
import { generateTerrain } from '../lib/terrain'
import type { DigitalTwin } from '../lib/digitalTwin'
import type { BuildingSelection } from '../types/campus'
import Lighting from './Lighting'
import LocationPicker from './LocationPicker'
import Terrain from './Terrain'
import CampusBoundary from './CampusBoundary'
import Vegetation from './Vegetation'
import POIObjects from './POIObjects'
import LocationLabels from './LocationLabels'
import OSMBuildings from './OSMBuildings'
import OSMRoads from './OSMRoads'
import BuildingWindows from './BuildingWindows'
import RouteOverlay from './RouteOverlay'
import RouteTraveler from './RouteTraveler'
import type { Playback, RoutePresentation } from '../lib/traversal'
import type { LocalCoordinate } from '../lib/geo'

export interface SceneMetrics { fps: number; calls: number; triangles: number }
interface CampusSceneProps {
  pickingPosition: boolean
  pickedPosition: LocalCoordinate | null
  onPickPosition: (point: LocalCoordinate) => void
  presentation: RoutePresentation | null
  playback: Playback
  travelerPosition: React.RefObject<LocalCoordinate | null>
  onWalkComplete: () => void
  showGrid: boolean
  night: boolean
  twin: DigitalTwin | null
  cameraRequest: CameraRequest
  onRenderedCount: (count: number) => void
  onTerrainReady: () => void
  onVegetationReady: (count: number) => void
  onMetrics: (metrics: SceneMetrics) => void
  selectedBuildingId: string | null
  onSelectBuilding: (selection: BuildingSelection) => void
  onClearSelection: () => void
}

const loadingTerrain = generateTerrain(650, { boundary: [], buildings: [], roads: [], clearings: [] }, 48)
const noop = () => {}

function Navigation({ twin, request }: { twin: DigitalTwin | null; request: CameraRequest }) {
  const controls = useRef<CameraControls>(null)
  const { width, height } = useThree((state) => state.size)
  // Road arrival, selection, grid and lighting changes never reframe the camera.
  const points = useMemo(() => twin?.buildings.flatMap((building) => building.outer.map(gpsToLocal)) ?? [], [twin])
  const framingKey = points.map((point) => `${point.x},${point.z}`).join(';')
  const home = useMemo(() => campusCameraView(points, width / height), [framingKey, width, height])
  useEffect(() => {
    const destination = request.routePoints ? routeCameraView(request.routePoints, width / height) : request.locationId ? flyToLocation(request.locationId, twin?.locations,
      twin?.locations.find((location) => location.id === request.locationId)?.height) : home
    if (destination) void controls.current?.setLookAt(...destination.position, ...destination.target, !window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  }, [home])
  useEffect(() => {
    const building = twin?.selections.findIndex((selection) => selection.location.id === request.locationId) ?? -1
    const destination = request.routePoints ? routeCameraView(request.routePoints, width / height) : request.locationId
      ? flyToLocation(request.locationId, twin ? [...twin.locations, ...twin.selections.filter((item) => item.matchMethod === 'unmatched').map((item) => item.location)] : undefined, twin?.buildings[building]?.height)
      : home
    if (destination) void controls.current?.setLookAt(...destination.position, ...destination.target, !window.matchMedia('(prefers-reduced-motion: reduce)').matches)
    // Requests have a monotonic sequence so repeated clicks on the same place work.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request])
  return <CameraControls ref={controls} makeDefault smoothTime={0.35} draggingSmoothTime={0.12} dollySpeed={0.7}
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

function CampusScene({ pickingPosition, pickedPosition, onPickPosition, presentation, playback, travelerPosition, onWalkComplete, showGrid, night, twin, cameraRequest, onRenderedCount, onTerrainReady, onVegetationReady, onMetrics, selectedBuildingId, onSelectBuilding, onClearSelection }: CampusSceneProps) {
  const size = twin?.size ?? 650
  const background = night ? '#111c2d' : '#d9e7ec'
  const heights = useMemo(() => Object.fromEntries(twin?.selections.map((selection, i) => [selection.location.id, twin.buildings[i].height]) ?? []), [twin])
  return <Canvas shadows={{ type: PCFShadowMap }} dpr={[1, 1.5]}
    onPointerMissed={(event) => { if (event.button === 0) onClearSelection() }}
    camera={{ position: sceneConfig.cameraPosition, fov: 45, near: 1, far: 10000 }}
    gl={{ antialias: true, toneMapping: ACESFilmicToneMapping }}
    fallback={<p className="webgl-fallback">Your browser needs WebGL to display the campus scene.</p>}>
    <color attach="background" args={[background]} />
    <fog attach="fog" args={[background, size * 1.1, size * 3]} />
    {night ? <Stars radius={3000} depth={150} count={800} factor={3} saturation={0} fade speed={0} />
      : <Sky distance={450000} sunPosition={sceneConfig.sunPosition} turbidity={3} rayleigh={0.7} mieCoefficient={0.005} mieDirectionalG={0.8} />}
    <Lighting groundSize={size} night={night} />
    <Terrain model={twin?.terrain ?? loadingTerrain} onReady={twin ? onTerrainReady : noop} />
    {showGrid && <gridHelper args={[size, Math.round(size / sceneConfig.gridSpacing), '#7d8970', '#9ba584']} position={[0, 0.025, 0]} />}
    {twin && <>
      <CampusBoundary points={twin.boundary} entrance={twin.locations.find((location) => location.id === 'main-entrance')!.coordinates} />
      <OSMRoads roads={twin.roads} />
      <OSMBuildings buildings={twin.buildings} assignments={twin.selections} onRenderedCount={onRenderedCount} selectedBuildingId={selectedBuildingId} onSelectBuilding={onSelectBuilding} />
      <BuildingWindows buildings={twin.buildings} night={night} />
      {twin.vegetationReady && <Vegetation trees={twin.trees} onReady={onVegetationReady} />}
      {twin.boundary.length > 0 && <POIObjects locations={twin.locations} roads={twin.roads} />}
      <LocationLabels locations={twin.locations} heights={heights} />
    </>}
    {twin && presentation && <><RouteOverlay presentation={presentation} terrain={twin.terrain} night={night} /><RouteTraveler presentation={presentation} terrain={twin.terrain} playback={playback} position={travelerPosition} onComplete={onWalkComplete} /></>}
    <LocationPicker active={pickingPosition} preview={pickedPosition} terrain={twin?.terrain ?? loadingTerrain} onPick={onPickPosition} />
    <Navigation twin={twin} request={cameraRequest} />
    <RuntimeMetrics onMetrics={onMetrics} />
  </Canvas>
}

export default memo(CampusScene)
