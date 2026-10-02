export interface BuildingRoom {
  // Display the real room identifier; no occupant information is stored here.
  number: string
  description?: string
}

export interface BuildingFloor {
  id: string
  level: number
  label: string
  rooms: BuildingRoom[]
}

export interface BuildingDetails {
  locationId: string
  floors: BuildingFloor[]
  // Visual estimate only; a confirmed floor count is not a surveyed height.
  floorHeightMeters: number
  interiorStatus: 'not-modeled' | 'approximate' | 'verified'
}
