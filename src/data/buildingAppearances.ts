export type BuildingStyle = 'department' | 'tutorial' | 'hostel' | 'seminar' | 'health' | 'bank'
export interface BuildingAppearance {
  style: BuildingStyle
  floors: number
  wall: string
  page: number
}
export const buildingReference = 'https://nitgoa.ac.in/uploads/Admissionbrochure2025.pdf'
// Photo labels establish architecture; owner-corrected location IDs establish
// placement. Never match on display text or silently rename another building.
// The brochure reuses some departmental photographs, so these are stylized
// reconstructions of the observed design family, not surveyed replicas.
export const buildingAppearances: Record<string, BuildingAppearance> = {
  'relation/19505814/0': { style: 'department', floors: 3, wall: '#d8c194', page: 7 },
  'relation/19505815/0': { style: 'department', floors: 3, wall: '#d9c49d', page: 7 },
  'relation/19505810/0': { style: 'department', floors: 3, wall: '#d8c194', page: 8 },
  'academic-block': { style: 'department', floors: 3, wall: '#d9c099', page: 9 },
  'relation/19505813/0': { style: 'tutorial', floors: 3, wall: '#dac69f', page: 13 },
  'way/1423803680': { style: 'seminar', floors: 2, wall: '#d4b387', page: 13 },
  'boys-hostel': { style: 'hostel', floors: 5, wall: '#ecdbb2', page: 13 },
  'girls-hostel': { style: 'hostel', floors: 3, wall: '#e4d1a6', page: 14 },
  'way/1423803660': { style: 'health', floors: 1, wall: '#d9bf93', page: 16 },
  'way/1423803662': { style: 'bank', floors: 1, wall: '#d8be8f', page: 14 },
}
