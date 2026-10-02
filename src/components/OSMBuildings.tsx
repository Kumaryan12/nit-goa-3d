import { useEffect, useMemo, useState } from 'react'
import { useCursor } from '@react-three/drei'
import { buildingShape, roofShape } from '../lib/buildingGeometry'
import { applyRoofTiles } from '../lib/roofMaterial'
import { assignCampusLocations } from '../lib/campus'
import type { BuildingSelection } from '../types/campus'
import type { BuildingFootprint } from '../types/osm'

interface OSMBuildingsProps {
  buildings: BuildingFootprint[]
  assignments?: BuildingSelection[]
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
  const roof = useMemo(() => roofShape(building), [building])
  const roofExtrusion = useMemo(() => ({ depth: 0.32, bevelEnabled: false, steps: 1 }), [])
  const extrusion = useMemo(() => ({ depth: building.height, bevelEnabled: false, steps: 1 }), [building.height])
  const concrete = ['#e8d7b5', '#dfcdb0', '#eee0c3', '#dec9a6'][building.osmId % 4]
  useCursor(hovered)

  return (
    <group
      name={selection.location.id}
      userData={{ osmId: building.id, locationId: selection.location.id }}
      onPointerOver={(event) => { event.stopPropagation(); setHovered(true) }}
      onPointerOut={() => setHovered(false)}
      onClick={(event) => {
        event.stopPropagation()
        // Orbit drags can end on a mesh; only a stationary click selects it.
        if (event.delta <= 2) onSelect(selection)
      }}
    >
      <mesh rotation={[-Math.PI / 2, 0, 0]} castShadow receiveShadow>
        <extrudeGeometry args={[shape, extrusion]} />
        <meshStandardMaterial color={selected ? '#f0c97c' : hovered ? '#f8efd5' : concrete} roughness={0.94} metalness={0} />
      </mesh>
      <mesh position={[0, building.height + 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]} castShadow receiveShadow>
        <extrudeGeometry args={[roof, roofExtrusion]} />
        <meshStandardMaterial color={selected ? '#d8954a' : '#b86640'} roughness={0.92} onBeforeCompile={applyRoofTiles} />
      </mesh>
    </group>
  )
}

export default function OSMBuildings({ buildings, assignments, onRenderedCount, selectedBuildingId, onSelectBuilding }: OSMBuildingsProps) {
  const selections = useMemo(() => assignments ?? assignCampusLocations(buildings), [buildings, assignments])
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
