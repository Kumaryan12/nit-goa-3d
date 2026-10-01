import { useEffect, useMemo, useState } from 'react'
import { useCursor } from '@react-three/drei'
import { buildingShape } from '../lib/buildingGeometry'
import type { BuildingFootprint } from '../types/osm'

interface OSMBuildingsProps {
  buildings: BuildingFootprint[]
  onRenderedCount: (count: number) => void
}

function OSMBuilding({ building }: { building: BuildingFootprint }) {
  const [hovered, setHovered] = useState(false)
  const shape = useMemo(() => buildingShape(building), [building])
  const extrusion = useMemo(() => ({ depth: building.height, bevelEnabled: false, steps: 1 }), [building.height])
  useCursor(hovered)

  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      castShadow
      receiveShadow
      onPointerOver={(event) => { event.stopPropagation(); setHovered(true) }}
      onPointerOut={() => setHovered(false)}
    >
      <extrudeGeometry args={[shape, extrusion]} />
      <meshStandardMaterial color={hovered ? '#f8efd5' : '#e8ddc6'} roughness={1} metalness={0} />
    </mesh>
  )
}

export default function OSMBuildings({ buildings, onRenderedCount }: OSMBuildingsProps) {
  useEffect(() => { onRenderedCount(buildings.length) }, [buildings, onRenderedCount])

  return (
    <group>
      {buildings.map((building) => <OSMBuilding key={building.id} building={building} />)}
    </group>
  )
}
