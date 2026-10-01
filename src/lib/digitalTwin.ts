import { campusLocations } from '../data/campus.ts'
import { assignCampusLocations, buildingCenter } from './campus.ts'
import { buildingHeight } from './buildings.ts'
import { gpsToLocal, groundSizeForCoordinates } from './geo.ts'
import { generateTerrain } from './terrain.ts'
import type { GroundRect } from './terrain.ts'
import { generateTrees } from './vegetation.ts'
import type { CampusMapData, CampusRoadData } from '../types/osm.ts'

export function createDigitalTwin(map: CampusMapData | null, roads: CampusRoadData | null, vegetationReady = true) {
  const boundary = (map?.boundary ?? roads?.boundary ?? []).map(gpsToLocal)
  const selections = assignCampusLocations(map?.buildings ?? [])
  const buildings = (map?.buildings ?? []).map((building, i) => ({ ...building, height: buildingHeight(building.tags, selections[i].location.id) }))
  const locations = campusLocations.map((location) => {
    const index = selections.findIndex((selection) => selection.location.id === location.id)
    return index < 0 ? location : { ...location, coordinates: buildingCenter(buildings[index]) }
  })
  const sports = locations.find((location) => location.id === 'sports-ground')!
  const entrance = locations.find((location) => location.id === 'main-entrance')!
  const clearings: GroundRect[] = [
    { ...sports.coordinates, halfX: 47, halfZ: 28 },
    { ...entrance.coordinates, halfX: 14, halfZ: 16 },
  ]
  const size = groundSizeForCoordinates([...(map?.boundary ?? roads?.boundary ?? []), ...buildings.flatMap((building) => building.outer)]) + 160
  const terrain = generateTerrain(size, { boundary, buildings, roads: roads?.roads ?? [], clearings })
  // Wait for both independent requests to settle before populating this model
  // in the scene, so late roads never run through previously generated trees.
  const trees = vegetationReady ? generateTrees(boundary, buildings, roads?.roads ?? [], clearings, terrain) : []
  return { boundary, selections, buildings, locations, clearings, size, terrain, trees, vegetationReady, roads: roads?.roads ?? [] }
}
export type DigitalTwin = ReturnType<typeof createDigitalTwin>
