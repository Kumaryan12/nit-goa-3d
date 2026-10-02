import { applyLocationOverride } from './locationOverrides.ts'
import type { CampusOverrides } from './locationOverrides.ts'
import { campusLocations } from '../data/campus.ts'
import { assignCampusLocations, buildingCenter } from './campus.ts'
import { buildingHeight } from './buildings.ts'
import { gpsToLocal, groundSizeForCoordinates } from './geo.ts'
import { campusTopography } from '../data/topography.ts'
import { footprintRect, terrainHeightAt } from './terrain.ts'
import { generateTerrain } from './terrain.ts'
import type { GroundRect } from './terrain.ts'
import { generateTrees } from './vegetation.ts'
import type { CampusMapData, CampusRoadData } from '../types/osm.ts'

export function createDigitalTwin(map: CampusMapData | null, roads: CampusRoadData | null, vegetationReady = true, overrides: CampusOverrides = {}) {
  const boundary = (map?.boundary ?? roads?.boundary ?? []).map(gpsToLocal)
  const metadata = campusLocations.map((location) => applyLocationOverride(location, overrides[location.id]))
  const selections = assignCampusLocations(map?.buildings ?? [], metadata).map((selection) => ({ ...selection, location: applyLocationOverride(selection.location, overrides[selection.location.id]) }))
  const buildings = (map?.buildings ?? []).map((building, i) => ({ ...building, height: buildingHeight(building.tags, selections[i].location.id) }))
  const locations = metadata.map((location) => {
    const index = selections.findIndex((selection) => selection.location.id === location.id)
    return index < 0 ? { ...location } : { ...location, coordinates: buildingCenter(buildings[index]), height: buildings[index].height }
  })
  selections.forEach((selection, i) => { selection.location = locations.find((location) => location.id === selection.location.id) ?? { ...selection.location, coordinates: buildingCenter(buildings[i]) } })
  const sports = locations.find((location) => location.id === campusTopography.lowerLocationId)!
  const entrance = locations.find((location) => location.id === 'main-entrance')!
  const clearings: GroundRect[] = [
    { ...sports.coordinates, halfX: 47 * Math.abs(Math.cos((sports.rotationDegrees ?? 0) * Math.PI / 180)) + 28 * Math.abs(Math.sin((sports.rotationDegrees ?? 0) * Math.PI / 180)), halfZ: 47 * Math.abs(Math.sin((sports.rotationDegrees ?? 0) * Math.PI / 180)) + 28 * Math.abs(Math.cos((sports.rotationDegrees ?? 0) * Math.PI / 180)) },
    { ...entrance.coordinates, halfX: 14, halfZ: 16 },
  ]
  const size = groundSizeForCoordinates([...(map?.boundary ?? roads?.boundary ?? []), ...buildings.flatMap((building) => building.outer)]) + 160
  const upperIndex = selections.findIndex((selection) => selection.location.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '') === campusTopography.upperLocationName.toLowerCase())
  const slope = upperIndex < 0 ? undefined : { lower: clearings[0], upper: footprintRect(buildings[upperIndex]), rise: campusTopography.riseMeters }
  const terrain = generateTerrain(size, { boundary, buildings, roads: roads?.roads ?? [], clearings, slope })
  if (slope) {
    buildings.forEach((building) => { const point = buildingCenter(building); building.baseElevation = terrainHeightAt(terrain, point.x, point.z) })
    for (const location of [...locations, ...selections.map((selection) => selection.location)]) location.elevation = terrainHeightAt(terrain, location.coordinates.x, location.coordinates.z)
  }
  // Wait for both independent requests to settle before populating this model
  // in the scene, so late roads never run through previously generated trees.
  const trees = vegetationReady ? generateTrees(boundary, buildings, roads?.roads ?? [], clearings, terrain) : []
  return { upperLocation: upperIndex < 0 ? null : selections[upperIndex].location, slope, boundary, selections, buildings, locations, clearings, size, terrain, trees, vegetationReady, roads: roads?.roads ?? [] }
}
export type DigitalTwin = ReturnType<typeof createDigitalTwin>
