import type { BuildingDetails } from '../types/buildingDetails.ts'

// Ground + four upper floors confirmed by the campus owner.
// Room numbers and interior layouts await campus details.
export const boysHostelDetails: BuildingDetails = {
  locationId: 'boys-hostel',
  floorHeightMeters: 3.2,
  interiorStatus: 'not-modeled',
  floors: [
    { id: 'ground', level: 0, label: 'Ground floor', rooms: [] },
    { id: 'first', level: 1, label: 'First floor', rooms: [] },
    { id: 'second', level: 2, label: 'Second floor', rooms: [] },
    { id: 'third', level: 3, label: 'Third floor', rooms: [] },
    { id: 'fourth', level: 4, label: 'Fourth floor', rooms: [] },
  ],
}

export const buildingDetails: Record<string, BuildingDetails> = {
  'boys-hostel': boysHostelDetails,
}
