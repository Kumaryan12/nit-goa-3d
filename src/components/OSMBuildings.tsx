import { useEffect, useMemo, useState } from 'react'
import { useCursor } from '@react-three/drei'
import { buildingShape } from '../lib/buildingGeometry'
import { assignCampusLocations } from '../lib/campus'
import type { BuildingSelection } from '../types/campus'
import type { BuildingFootprint } from '../types/osm'

interface OSMBuildingsProps {
  buildings: BuildingFootprint[]
  onRenderedCount: (count: number) => void
  selectedBuildingId: string | null
  onSelectBuilding: (selection: BuildingSelection) => void
}

function OSMBuilding({ building, selection, selected, onSelect }: {
  building: BuildingFootprint
  selection: BuildingSelection
  selected: boolean
  onSelect: (selection: BuildingSelection) => void
}) {
  const [hovered, setHovered] = useState(false)
  const shape = useMemo(() => buildingShape(building), [building])
  const extrusion = useMemo(() => ({ depth: building.height, bevelEnabled: false, steps: 1 }), [building.height])
  useCursor(hovered)

  return (
    <mesh
      name={selection.location.id}
      userData={{ osmId: building.id, locationId: selection.location.id }}
      rotation={[-Math.PI / 2, 0, 0]}
      castShadow
      receiveShadow
      onPointerOver={(event) => { event.stopPropagation(); setHovered(true) }}
      onPointerOut={() => setHovered(false)}
      onClick={(event) => {
        event.stopPropagation()
        // Orbit drags can end on a mesh; only a stationary click selects it.
        if (event.delta <= 2) onSelect(selection)
      }}
    >
      <extrudeGeometry args={[shape, extrusion]} />
      <meshStandardMaterial color={selected ? '#dcc494' : hovered ? '#f8efd5' : '#e8ddc6'} roughness={1} metalness={0} />
    </mesh>
  )
}

export default function OSMBuildings({ buildings, onRenderedCount, selectedBuildingId, onSelectBuilding }: OSMBuildingsProps) {
  const selections = useMemo(() => assignCampusLocations(buildings), [buildings])
  useEffect(() => { onRenderedCount(buildings.length) }, [buildings, onRenderedCount])

  return (
    <group>
      {buildings.map((building, index) => (
        <OSMBuilding
          key={building.id}
          building={building}
          selection={selections[index]}
          selected={selectedBuildingId === building.id}
          onSelect={onSelectBuilding}
        />
      ))}
    </group>
  )
}
