import type { CampusOverrides } from '../lib/locationOverrides.ts'

// Confirmed campus layout imported from the owner's exported map corrections.
// Browser edits can still override these project defaults. Stable IDs are preserved.
export const savedCampusOverrides: CampusOverrides = {
  "main-entrance": {
    "name": "Main Entrance",
    "coordinates": {
      "x": -545.5,
      "z": -22.49
    },
    "rotationDegrees": 0
  },
  "canteen": {
    "name": "Canteen",
    "buildingId": "way/1423803663"
  },
  "sports-ground": {
    "name": "Sports Ground",
    "coordinates": {
      "x": -120.84,
      "z": -380.6
    },
    "rotationDegrees": 90
  },
  "administration-block": {
    "name": "Administration Block",
    "buildingId": "way/1423803681"
  },
  "relation/19505813/0": {
    "name": "Gyan Mandir"
  },
  "way/1423803680": {
    "name": "Seminar Complex"
  },
  "way/1423803659": {
    "name": "Nescafe"
  },
  "relation/19505815/0": {
    "name": "Vikram Sarabhai (ECE)"
  }
}
