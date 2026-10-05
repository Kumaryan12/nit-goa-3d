import type { GeoCoordinate } from '../types/osm.ts'

export interface LawnReference {
  id: string
  buildingId: string
  outer: GeoCoordinate[]
  hardscape: GeoCoordinate[][]
}

// Approximate lawn edges traced from north-up Esri World Imagery, level 18,
// rows 119894–119895, column 184965; checked against NIT Goa's aerial photo.
// Keep GPS anchors independent of display-name edits. See docs/seminar-lawns.md.
export const campusLawnReferences: LawnReference[] = [
  {
    id: 'seminar-north-lawn', buildingId: 'way/1423803680',
    outer: [
      { lat: 15.1698712, lon: 74.0113574 },
      { lat: 15.1698712, lon: 74.0118724 },
      { lat: 15.1697573, lon: 74.0118241 },
      { lat: 15.1696175, lon: 74.0117437 },
      { lat: 15.1693638, lon: 74.0117329 },
      { lat: 15.1691360, lon: 74.0116954 },
      { lat: 15.1691360, lon: 74.0113628 },
      { lat: 15.1693017, lon: 74.0113252 },
    ],
    hardscape: [[
      { lat: 15.1698505, lon: 74.0113574 },
      { lat: 15.1698505, lon: 74.0115076 },
      { lat: 15.1696227, lon: 74.0115076 },
      { lat: 15.1696227, lon: 74.0113574 },
    ]],
  },
  {
    id: 'seminar-south-lawn', buildingId: 'way/1423803680',
    outer: [
      { lat: 15.1686235, lon: 74.0113682 },
      { lat: 15.1686235, lon: 74.0117061 },
      { lat: 15.1685044, lon: 74.0117544 },
      { lat: 15.1681885, lon: 74.0117222 },
      { lat: 15.1680539, lon: 74.0114754 },
      { lat: 15.1681264, lon: 74.0113789 },
      { lat: 15.1684112, lon: 74.0113199 },
    ],
    hardscape: [[
      { lat: 15.1683439, lon: 74.0113842 },
      { lat: 15.1683439, lon: 74.0115666 },
      { lat: 15.1681368, lon: 74.0115666 },
      { lat: 15.1681368, lon: 74.0113842 },
    ]],
  },
]
