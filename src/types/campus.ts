export type CampusLocationCategory =
  | 'academic'
  | 'administration'
  | 'hostel'
  | 'food'
  | 'sports'
  | 'entrance'
  | 'amenity'
  | 'other'

export interface CampusLocation {
  id: string
  name: string
  category: CampusLocationCategory
  description: string
  keywords: string[]
  // Approximate meters from the same LAT0/LON0 origin used by the OSM scene.
  coordinates: { x: number; z: number }
  height: number
  icon: string
  // Image URLs can later come from a gallery API; empty means none verified.
  images: string[]
  facilities: string[]
}

export type BuildingMatchMethod = 'osm-name' | 'proximity' | 'unmatched'

export interface BuildingSelection {
  // Open places can be selected without inventing an OSM building ID.
  buildingId: string | null
  location: CampusLocation
  matchMethod: BuildingMatchMethod
}

export const categoryLabels: Record<CampusLocationCategory, string> = {
  academic: 'Academic',
  administration: 'Administration',
  hostel: 'Hostel',
  food: 'Food & dining',
  sports: 'Sports',
  entrance: 'Entrance',
  amenity: 'Amenity',
  other: 'Other',
}
