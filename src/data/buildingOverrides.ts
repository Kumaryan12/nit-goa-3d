export interface BuildingOverride {
  id: string
  height: number
  floors: number
}

// Editable visual estimates, not surveyed heights. OSM tags always win.
export const buildingOverrides: BuildingOverride[] = [
  { id: 'academic-block', height: 14, floors: 4 },
  { id: 'administration-block', height: 10.5, floors: 3 },
  { id: 'boys-hostel', height: 18, floors: 5 },
  { id: 'girls-hostel', height: 14.5, floors: 4 },
  { id: 'canteen', height: 4.5, floors: 1 },
]
