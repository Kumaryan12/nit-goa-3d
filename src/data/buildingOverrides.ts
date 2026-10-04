import { boysHostelDetails } from './buildingDetails.ts'

export interface BuildingOverride {
  id: string
  height: number
  floors: number
}

// Editable visual estimates, not surveyed heights. OSM tags always win.
export const buildingOverrides: BuildingOverride[] = [
  { id: 'academic-block', height: 14, floors: 4 },
  { id: 'administration-block', height: 10.5, floors: 3 },
  { id: 'boys-hostel', height: boysHostelDetails.floors.length * boysHostelDetails.floorHeightMeters, floors: boysHostelDetails.floors.length },
  { id: 'girls-hostel', height: 14.5, floors: 4 },
  { id: 'canteen', height: 4.5, floors: 1 },
  // Low service pavilions and the two-storey seminar hall in the 2025-26
  // official admission brochure, pp. 13-16. These remain visual estimates.
  { id: 'way/1423803660', height: 4.2, floors: 1 },
  { id: 'way/1423803662', height: 4.2, floors: 1 },
  { id: 'way/1423803680', height: 8, floors: 2 },
]
