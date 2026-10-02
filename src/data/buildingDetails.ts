import type { BuildingDetails } from '../types/buildingDetails.ts'

// Ground + four upper floors confirmed by the campus owner.
// Verified room numbers remain empty. Generated DEMO labels belong only to
// the approximate interior; they do not represent real room assignments.
export const boysHostelDetails: BuildingDetails = {
  locationId: 'boys-hostel',
  floorHeightMeters: 3.2,
  interiorStatus: 'approximate',
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
