import { useEffect, useMemo, useState } from 'react'
import { useCursor } from '@react-three/drei'
import { buildingShape, roofShape } from '../lib/buildingGeometry'
import { applyRoofTiles } from '../lib/roofMaterial'
import { assignCampusLocations } from '../lib/campus'
import type { BuildingSelection } from '../types/campus'
import type { BuildingFootprint } from '../types/osm'
import type { HostelPlan } from '../lib/hostelInterior'
import type { AdministrationFacadePlan } from '../lib/administrationFacade'
import AdministrationBlock from './AdministrationBlock'
import CampusBuildingFacade from './CampusBuildingFacade'
import type { CampusFacadePlan } from '../lib/campusFacade'

interface OSMBuildingsProps {
  facades?: Map<string, CampusFacadePlan>
  administration?: AdministrationFacadePlan | null
  night?: boolean
  hostelPlan?: HostelPlan | null
  insideHostel?: boolean
  buildings: BuildingFootprint[]
  assignments?: BuildingSelection[]
  onRenderedCount: (count: number) => void
  selectedBuildingId: string | null
  onSelectBuilding: (selection: BuildingSelection) => void
}

function OSMBuilding({ building, selection, selected, onSelect, groundShellHeight = 0, hidden = false, administration, facade, night = false }: {
  facade?: CampusFacadePlan
  administration?: AdministrationFacadePlan | null
  night?: boolean
  groundShellHeight?: number
  hidden?: boolean
  building: BuildingFootprint
  selection: BuildingSelection
  selected: boolean
  onSelect: (selection: BuildingSelection) => void
}) {
  const [hovered, setHovered] = useState(false)
  const shape = useMemo(() => buildingShape(building), [building])
  const roof = useMemo(() => roofShape(building), [building])
  const roofExtrusion = useMemo(() => ({ depth: 0.32, bevelEnabled: false, steps: 1 }), [])
  const extrusion = useMemo(() => ({ depth: Math.max(.1, building.height - groundShellHeight), bevelEnabled: false, steps: 1 }), [building.height, groundShellHeight])
  const concrete = ['#e8d7b5', '#dfcdb0', '#eee0c3', '#dec9a6'][building.osmId % 4]
  useCursor(hovered)

  if (hidden) return null
  return (
    <group
      position={[0, building.baseElevation ?? 0, 0]}
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
      <mesh position={[0, groundShellHeight, 0]} rotation={[-Math.PI / 2, 0, 0]} castShadow receiveShadow>
        <extrudeGeometry args={[shape, extrusion]} />
        <meshStandardMaterial color={selected ? '#f0c97c' : hovered ? '#f8efd5' : administration ? '#f0deaf' : facade?.appearance.wall ?? concrete} roughness={0.94} metalness={0} />
      </mesh>
      {!administration?.pitchedRoof && <mesh position={[0, building.height + 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]} castShadow receiveShadow>
        <extrudeGeometry args={[roof, roofExtrusion]} />
        <meshStandardMaterial color={selected ? '#d8954a' : '#b86640'} roughness={0.92} onBeforeCompile={applyRoofTiles} />
      </mesh>}
      {administration && <AdministrationBlock plan={administration} night={night} />}
      {facade && <CampusBuildingFacade plan={facade} night={night} />}
    </group>
  )
}

export default function OSMBuildings({ administration, facades, night = false, hostelPlan, insideHostel = false, buildings, assignments, onRenderedCount, selectedBuildingId, onSelectBuilding }: OSMBuildingsProps) {
  const selections = useMemo(() => assignments ?? assignCampusLocations(buildings), [buildings, assignments])
  useEffect(() => { onRenderedCount(buildings.length) }, [buildings, onRenderedCount])

  return (
    <group>
      {buildings.map((building, index) => (
        <OSMBuilding
          facade={facades?.get(building.id)}
          administration={administration?.buildingId === building.id ? administration : null}
          night={night}
          groundShellHeight={hostelPlan?.buildingId === building.id ? hostelPlan.floorHeight : 0}
          hidden={insideHostel && hostelPlan?.buildingId === building.id}
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
