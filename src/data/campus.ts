import type { CampusLocation } from '../types/campus.ts'

// These anchors are editable estimates in local meters, not surveyed positions.
// Talpona/Terekhol are named in both OSM and NIT Goa's hostel facilities page:
// https://nitgoa.ac.in/hostels/facilities.html
// The institute's admission brochure describes its academic, administrative,
// canteen, sports, and entrance facilities:
// https://www.nitgoa.ac.in/uploads/Admissionbrochure30may2024.pdf
// Only the hostel identities are confirmed by named OSM geometry. Other
// building identities are provisional proximity matches approved for Phase 3.
export const campusLocations: CampusLocation[] = [
  {
    id: 'academic-block',
    name: 'Academic Block',
    category: 'academic',
    description: 'An academic location for teaching and learning at NIT Goa, with classrooms and departmental facilities.',
    keywords: ['academic block', 'academics', 'classrooms', 'departments', 'labs', 'CV Raman'],
    coordinates: { x: -216, z: -205 },
  },
  {
    id: 'administration-block',
    name: 'Administration Block',
    category: 'administration',
    description: 'The campus administration location for institute offices and administrative services.',
    keywords: ['administration block', 'administrative block', 'admin', 'office', 'registrar'],
    coordinates: { x: -423, z: -128 },
  },
  {
    id: 'boys-hostel',
    name: 'Boys Hostel',
    category: 'hostel',
    description: 'Talpona, the boys’ hostel at NIT Goa, provides campus accommodation for male students.',
    keywords: ['boys hostel', 'Talpona', 'hostel Talpona', 'boys', 'residence', 'accommodation'],
    coordinates: { x: 14, z: -368 },
  },
  {
    id: 'girls-hostel',
    name: 'Girls Hostel',
    category: 'hostel',
    description: 'Terekhol, the girls’ hostel at NIT Goa, provides campus accommodation for female students.',
    keywords: ['girls hostel', 'Terekhol', 'hostel Terekhol', 'girls', 'residence', 'accommodation'],
    coordinates: { x: -369, z: -260 },
  },
  {
    id: 'canteen',
    name: 'Canteen',
    category: 'food',
    description: 'A campus dining location for snacks, refreshments, and meals between classes.',
    keywords: ['canteen', 'Upahar Ghar', 'food', 'dining', 'snacks', 'refreshments'],
    coordinates: { x: -134, z: -259 },
  },
  {
    id: 'sports-ground',
    name: 'Sports Ground',
    category: 'sports',
    description: 'An outdoor campus location for sports, recreation, and student activities.',
    keywords: ['sports ground', 'sports', 'ground', 'football', 'cricket', 'recreation'],
    coordinates: { x: -50, z: -180 },
  },
  {
    id: 'main-entrance',
    name: 'Main Entrance',
    category: 'entrance',
    description: 'The approximate campus arrival point for visitors and students entering NIT Goa.',
    keywords: ['main entrance', 'entrance', 'main gate', 'gate', 'arrival'],
    coordinates: { x: -470, z: -100 },
  },
]
