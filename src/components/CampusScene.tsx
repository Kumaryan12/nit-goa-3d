import { useEffect, useMemo } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { Bounds, OrbitControls, Sky, useBounds } from '@react-three/drei'
import { ACESFilmicToneMapping } from 'three'
import { sceneConfig } from '../lib/sceneConfig'
import Ground from './Ground'
import Lighting from './Lighting'
import OSMBuildings from './OSMBuildings'
import { groundSizeForCoordinates } from '../lib/geo'
import type { CampusMapData } from '../types/osm'

interface CampusSceneProps {
  showGrid?: boolean
  mapData: CampusMapData | null
  onRenderedCount: (count: number) => void
}

function CampusFraming() {
  const bounds = useBounds()
  const { width, height } = useThree((state) => state.size)
  useEffect(() => {
    bounds.refresh()
    const { center, distance } = bounds.getSize()
    const offset = distance / Math.sqrt(3)
    bounds.moveTo([center.x + offset, center.y + offset, center.z + offset])
      .lookAt({ target: [center.x, center.y, center.z] })
  }, [bounds, width, height])
  return null
}

export default function CampusScene({ showGrid = true, mapData, onRenderedCount }: CampusSceneProps) {
  const groundSize = useMemo(() => mapData
    ? groundSizeForCoordinates([
      ...(mapData.boundary ?? []),
      ...mapData.buildings.flatMap((building) => building.outer),
    ])
    : sceneConfig.groundSize, [mapData])

  // Keep this element stable when the grid or debug count changes, so toggling
  // the grid doesn't reset the user's camera. Bounds fits the real data once
  // loaded and adapts the framing to viewport resizes.
  const buildingLayer = useMemo(() => mapData && (
    <Bounds margin={1.3} maxDuration={0.8}>
      <CampusFraming />
      <OSMBuildings buildings={mapData.buildings} onRenderedCount={onRenderedCount} />
    </Bounds>
  ), [mapData, onRenderedCount])

  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{
        position: sceneConfig.cameraPosition,
        fov: 45,
        near: 0.1,
        far: 10000,
      }}
      gl={{ antialias: true, toneMapping: ACESFilmicToneMapping }}
      fallback={<p className="webgl-fallback">Your browser needs WebGL to display the campus scene.</p>}
    >
      <color attach="background" args={[sceneConfig.backgroundColor]} />
      <fog attach="fog" args={[sceneConfig.backgroundColor, groundSize, groundSize * 3]} />
      <Sky
        distance={450000}
        sunPosition={sceneConfig.sunPosition}
        turbidity={4}
        rayleigh={0.6}
        mieCoefficient={0.005}
        mieDirectionalG={0.8}
      />
      <Lighting groundSize={groundSize} />
      <Ground showGrid={showGrid} size={groundSize} />
      {buildingLayer}
      <OrbitControls
        makeDefault
        target={sceneConfig.cameraTarget}
        enableDamping
        dampingFactor={0.08}
        minDistance={10}
        maxDistance={Math.max(600, groundSize * 3)}
        maxPolarAngle={Math.PI / 2 - 0.02}
      />
    </Canvas>
  )
}
