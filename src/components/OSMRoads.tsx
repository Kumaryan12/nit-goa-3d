import { useEffect, useMemo } from 'react'
import { createRoadGeometry, FOOTPATH_ELEVATION, ROAD_ELEVATION } from '../lib/roadGeometry'
import type { TerrainModel } from '../lib/terrain'
import type { RoadFootprint } from '../types/osm'

function OSMRoad({ road, terrain }: { road: RoadFootprint; terrain?: TerrainModel }) {
  const geometry = useMemo(() => createRoadGeometry(road.paths, road.width,
    road.kind === 'footpath' ? FOOTPATH_ELEVATION : ROAD_ELEVATION, terrain), [road, terrain])
  useEffect(() => () => geometry.dispose(), [geometry])
  return (
    <mesh name={`road/${road.osmId}`} geometry={geometry} receiveShadow>
      <meshStandardMaterial
        color={road.kind === 'footpath' ? '#b9b5a3' : '#434946'}
        roughness={1}
        metalness={0}
        // Keep the shallow layer stable against the ground at distant zooms.
        polygonOffset
        polygonOffsetFactor={-1}
        polygonOffsetUnits={-1}
      />
    </mesh>
  )
}

export default function OSMRoads({ roads, terrain }: { roads: RoadFootprint[]; terrain?: TerrainModel }) {
  // Roads have no pointer handlers, so they don't intercept building selection.
  return <group>{roads.map((road) => <OSMRoad key={road.id} road={road} terrain={terrain} />)}</group>
}
