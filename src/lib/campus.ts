import { campusLocations } from '../data/campus.ts'
import { gpsToLocal } from './geo.ts'
import type { BuildingSelection, CampusLocation } from '../types/campus.ts'
import type { BuildingFootprint } from '../types/osm.ts'

export const BUILDING_MATCH_RADIUS_METERS = 40

// Open places have metadata, but aren't assigned to unrelated building meshes.
const buildingCategories = new Set(['academic', 'administration', 'hostel', 'food', 'amenity', 'other'])

function normalizedName(name: string): string {
  return name.toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
}

export function buildingCenter(building: BuildingFootprint): CampusLocation['coordinates'] {
  const points = building.outer.map(gpsToLocal)
  return {
    x: (Math.min(...points.map((point) => point.x)) + Math.max(...points.map((point) => point.x))) / 2,
    z: (Math.min(...points.map((point) => point.z)) + Math.max(...points.map((point) => point.z))) / 2,
  }
}

function unnamedBuilding(building: BuildingFootprint, coordinates: CampusLocation['coordinates']): CampusLocation {
  const isHostel = building.tags.building === 'dormitory'
  const isAcademic = ['university', 'school', 'college'].includes(building.tags.building)
  return {
    id: building.id,
    name: building.tags.name || 'Unnamed campus building',
    category: isHostel ? 'hostel' : isAcademic ? 'academic' : 'other',
    description: 'A real OpenStreetMap building footprint. Campus details have not yet been assigned to this building.',
    keywords: building.tags.name ? [building.tags.name] : [],
    coordinates,
    height: building.height,
    icon: isHostel ? '🏠' : isAcademic ? '🏢' : '🏛',
    images: [],
    facilities: [],
  }
}

// Stable location IDs supplement the OSM footprint ID; they never replace it.
// Exact OSM name/keyword matches take precedence. Remaining unnamed buildings
// use a bounded, one-to-one nearest-anchor match, independent of query order.
export function assignCampusLocations(
  buildings: BuildingFootprint[],
  locations: CampusLocation[] = campusLocations,
  radius = BUILDING_MATCH_RADIUS_METERS,
): BuildingSelection[] {
  const centers = buildings.map(buildingCenter)
  const assignments = new Map<number, BuildingSelection>()
  const usedLocations = new Set<string>()
  const candidates: { buildingIndex: number; location: CampusLocation; distance: number; named: boolean }[] = []

  buildings.forEach((building, buildingIndex) => {
    const center = centers[buildingIndex]
    if (!Number.isFinite(center.x) || !Number.isFinite(center.z)) return
    const name = normalizedName(building.tags.name ?? '')
    for (const location of locations) {
      if (!buildingCategories.has(location.category)) continue
      const distance = Math.hypot(center.x - location.coordinates.x, center.z - location.coordinates.z)
      if (!Number.isFinite(distance)) continue
      const named = Boolean(name) && [location.name, ...location.keywords].some((keyword) => normalizedName(keyword) === name)
      // Preserve named OSM features when no metadata alias matches their name.
      if (named || (!name && distance <= radius)) candidates.push({ buildingIndex, location, distance, named })
    }
  })

  candidates.sort((a, b) => Number(b.named) - Number(a.named) || a.distance - b.distance
    || a.location.id.localeCompare(b.location.id)
    || buildings[a.buildingIndex].id.localeCompare(buildings[b.buildingIndex].id))

  for (const candidate of candidates) {
    const { buildingIndex, location, named } = candidate
    if (assignments.has(buildingIndex) || usedLocations.has(location.id)) continue
    assignments.set(buildingIndex, {
      buildingId: buildings[buildingIndex].id,
      location,
      matchMethod: named ? 'osm-name' : 'proximity',
    })
    usedLocations.add(location.id)
  }

  return buildings.map((building, index) => assignments.get(index) ?? {
    buildingId: building.id,
    location: unnamedBuilding(building, centers[index]),
    matchMethod: 'unmatched',
  })
}
