import { correctGyanCourtyards } from './gyanGeometry.ts'
import { correctBoysHostelCourtyards } from './boysHostelGeometry.ts'
import { applyLocationOverride } from './locationOverrides.ts'
import type { CampusOverrides } from './locationOverrides.ts'
import { campusLocations } from '../data/campus.ts'
import { assignCampusLocations, buildingCenter } from './campus.ts'
import { buildingHeight } from './buildings.ts'
import { gpsToLocal, groundSizeForCoordinates } from './geo.ts'
import { campusTopography, defaultTerrainSettings } from '../data/topography.ts'
import type { TerrainSettings } from '../data/topography.ts'
import { validateTerrainSettings } from './terrainSettings.ts'
import type { TerrainSlope } from './topography.ts'
import { resolveSlopePatches } from './topography.ts'
import { distanceToRect, footprintRect, terrainHeightAt } from './terrain.ts'
import { generateTerrain } from './terrain.ts'
import type { GroundRect } from './terrain.ts'
import { generateCampusLamps } from './nightLighting.ts'
import { generateTrees } from './vegetation.ts'
import type { CampusMapData, CampusRoadData } from '../types/osm.ts'
import { createEntranceCanal } from './canal.ts'
import { createTheatreLayout } from './theatre.ts'
import { createCampusLawns } from './landscaping.ts'
import { createCampusFlag } from './campusFlag.ts'

export function createDigitalTwin(map: CampusMapData | null, roads: CampusRoadData | null, vegetationReady = true, overrides: CampusOverrides = {}, terrainSettings: TerrainSettings = defaultTerrainSettings) {
  const relief = validateTerrainSettings(terrainSettings)
  const boundary = (map?.boundary ?? roads?.boundary ?? []).map(gpsToLocal)
  const metadata = campusLocations.map((location) => applyLocationOverride(location, overrides[location.id]))
  const selections = assignCampusLocations(map?.buildings ?? [], metadata).map((selection) => ({ ...selection, location: applyLocationOverride(selection.location, overrides[selection.location.id]) }))
  const buildings = (map?.buildings ?? []).map((building, i) => ({ ...correctBoysHostelCourtyards(correctGyanCourtyards(building)), height: buildingHeight(building.tags, selections[i].location.id) }))
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
  const theatreLocation = locations.find(location => location.id === 'open-air-theatre')!
  const theatre = createTheatreLayout(theatreLocation, roads?.roads ?? [])
  // Share the nearest resolved building bench. The large academic plaza shares
  // Academic Block's level, while owner edits can move it to another site.
  const nearbyBench = buildings.map(building => ({ building, distance: distanceToRect(theatre.clearing, footprintRect(building)) }))
    .filter(item => item.distance < 25).sort((a, b) => a.distance - b.distance)[0]
  theatre.clearing.benchBuildingId = nearbyBench?.building.id
  clearings.push(theatre.clearing)
  const size = groundSizeForCoordinates([...(map?.boundary ?? roads?.boundary ?? []), ...buildings.flatMap((building) => building.outer)]) + 160
  const upperIndex = selections.findIndex((selection) => selection.location.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '') === campusTopography.upperLocationName.toLowerCase())
  const girlsIndex = selections.findIndex(selection => selection.location.id === 'girls-hostel')
  const adminIndex = selections.findIndex(selection => selection.location.id === 'administration-block')
  const facultyIndex = selections.findIndex(selection => selection.location.name.toLowerCase() === 'faculty quarters')
  const slope: TerrainSlope | undefined = upperIndex < 0 ? undefined : {
    lower: clearings[0], upper: footprintRect(buildings[upperIndex]), rise: relief.nescafeRiseMeters,
    gateApproach: adminIndex < 0 ? undefined : { lower: entrance.coordinates, upper: buildingCenter(buildings[adminIndex]), drop: relief.gateRiseMeters, width: 95, stages: 2 },
    girlsTerrace: girlsIndex < 0 ? undefined : { rect: footprintRect(buildings[girlsIndex]), drop: relief.girlsRoadRiseMeters, transition: 26 },
    facultyApproach: girlsIndex < 0 || facultyIndex < 0 ? undefined : { lower: buildingCenter(buildings[girlsIndex]), upper: buildingCenter(buildings[facultyIndex]), width: 72 },
  }
  const canal = boundary.length ? createEntranceCanal(roads?.roads ?? [], entrance.coordinates) : undefined
  const slopePatches = resolveSlopePatches(relief.customSlopes, slope)
  const hasRelief = !!slope || slopePatches.length > 0
  const lawns = createCampusLawns(buildings)
  const terrain = generateTerrain(size, { boundary, buildings, roads: roads?.roads ?? [], clearings, slope, slopePatches, canal, lawns })
  if (hasRelief) {
    buildings.forEach((building) => { const point = buildingCenter(building); building.baseElevation = terrainHeightAt(terrain, point.x, point.z) })
    for (const location of [...locations, ...selections.map((selection) => selection.location)]) location.elevation = terrainHeightAt(terrain, location.coordinates.x, location.coordinates.z)
  }
  theatre.elevation = terrainHeightAt(terrain, theatre.center.x, theatre.center.z)
  theatreLocation.elevation = theatre.elevation
  terrain.theatre = theatre
  const flag = createCampusFlag(buildings, lawns, boundary, roads?.roads ?? [], terrain)
  if (flag) terrain.flag = flag
  // Wait for both independent requests to settle before populating this model
  // in the scene, so late roads never run through previously generated trees.
  const access = theatre.access
  const vegetationClearings = access.length ? [...clearings, { x: (access[0].x + access[1].x) / 2, z: (access[0].z + access[1].z) / 2, halfX: Math.abs(access[1].x - access[0].x) / 2 + 1.2, halfZ: Math.abs(access[1].z - access[0].z) / 2 + 1.2 }] : clearings
  const trees = vegetationReady ? generateTrees(boundary, buildings, roads?.roads ?? [], vegetationClearings, terrain) : []
  const lamps = generateCampusLamps({ roads: roads?.roads ?? [], buildings, boundary, terrain, trees, locations })
  return { lamps, lawns, flag, upperLocation: upperIndex < 0 ? null : selections[upperIndex].location, slope, hasRelief, canal, theatre, boundary, selections, buildings, locations, clearings, vegetationClearings, size, terrain, trees, vegetationReady, roads: roads?.roads ?? [] }
}
export type DigitalTwin = ReturnType<typeof createDigitalTwin>
