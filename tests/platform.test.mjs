import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { campusLocations } from '../src/data/campus.ts'
import { boysHostelDetails } from '../src/data/buildingDetails.ts'
import { galleryPhotos } from '../src/data/gallery.ts'
import { galleryForLocation, demoGalleryRepository } from '../src/lib/gallery.ts'
import { calculateCampusStats } from '../src/lib/stats.ts'
import { selectionForLocation, campusCenter, nearbyLocations } from '../src/lib/locations.ts'
import { miniMapData } from '../src/lib/minimap.ts'
import { createDigitalTwin } from '../src/lib/digitalTwin.ts'
import { extractBuildingFootprints } from '../src/lib/buildings.ts'
import { extractCampusRoads } from '../src/lib/roads.ts'

const campus = JSON.parse(await readFile(new URL('./fixtures/nit-goa-campus.json', import.meta.url), 'utf8'))
const roadResponse = JSON.parse(await readFile(new URL('./fixtures/nit-goa-roads.json', import.meta.url), 'utf8'))
const boundary = roadResponse.elements.find((element) => element.id === 1259742369).geometry
const map = { buildings: extractBuildingFootprints(campus.elements), boundary, source: 'campus-area', returnedBuildingCount: 22 }
const roadData = { roads: extractCampusRoads(roadResponse.elements, boundary), boundary, source: 'campus-area', returnedRoadCount: 20 }
const twin = createDigitalTwin(map, roadData)

test('location schema prepares every landmark for icons, height, facilities and future photo URLs', () => {
  assert.equal(new Set(campusLocations.map((item) => item.id)).size, 8)
  for (const location of campusLocations) {
    assert.ok(location.icon && Number.isFinite(location.height) && location.height >= 0)
    assert.ok(Array.isArray(location.images) && Array.isArray(location.facilities))
    assert.ok(location.facilities.length > 0)
  }
  const selection = selectionForLocation('boys-hostel', twin.locations, twin.selections)
  const building = twin.buildings.find((item) => item.id === selection.buildingId)
  assert.equal(selection.location.height, building.height)
  assert.deepEqual(boysHostelDetails.floors.map(floor => floor.level), [0, 1, 2, 3, 4])
  assert.equal(building.height, boysHostelDetails.floors.length * boysHostelDetails.floorHeightMeters)
  assert.equal(boysHostelDetails.interiorStatus, 'approximate')
  assert.ok(boysHostelDetails.floors.every(floor => floor.rooms.length === 0), 'unmapped real room numbers are not fabricated')
  assert.equal(selection.matchMethod, 'osm-name')
  assert.equal(selectionForLocation('main-entrance').buildingId, null)
  assert.equal(selectionForLocation('unknown'), null)
})

test('gallery cards link only to valid location IDs and the future repository isolates results', async () => {
  assert.equal(new Set(galleryPhotos.map((photo) => photo.id)).size, galleryPhotos.length)
  for (const photo of galleryPhotos) {
    assert.ok(campusLocations.some((item) => item.id === photo.locationId))
    assert.ok(photo.placeholder && photo.caption && photo.author)
    const image = await readFile(new URL(`../public${photo.image}`, import.meta.url), 'utf8')
    assert.ok(image.startsWith('<svg'))
  }
  for (const location of campusLocations) {
    const linked = galleryForLocation(location.id)
    if (location.id === 'open-air-theatre') assert.deepEqual(linked, [], 'new theatre has no verified or demo photos yet')
    else assert.ok(linked.length > 0)
    assert.ok(linked.every((photo) => photo.locationId === location.id))
    assert.deepEqual(await demoGalleryRepository.getByLocation(location.id), linked)
  }
  assert.deepEqual(galleryForLocation('missing'), [])
  assert.deepEqual(galleryForLocation('academic-block', []), [])
})

test('statistics calculate actual buildings, roadway objects, centerline segments and generated trees', () => {
  assert.deepEqual(calculateCampusStats(null), { buildings: 0, roads: 0, roadSegments: 0, footpaths: 0, trees: 0 })
  assert.deepEqual(calculateCampusStats(twin), { buildings: 22, roads: 20, roadSegments: 193, footpaths: 0, trees: 640 })
  const changed = { ...twin, buildings: twin.buildings.slice(0, 3), roads: [{ ...twin.roads[0], kind: 'footpath', paths: [[{ x: 0, z: 0 }, { x: 1, z: 0 }, { x: 2, z: 0 }], [{ x: 3, z: 0 }, { x: 4, z: 0 }]] }], trees: twin.trees.slice(0, 7) }
  assert.deepEqual(calculateCampusStats(changed), { buildings: 3, roads: 1, roadSegments: 3, footpaths: 1, trees: 7 })
  assert.equal(calculateCampusStats({ ...changed, vegetationReady: false }).trees, 0)
})

test('campus center is an area centroid and nearby locations exclude self and rank by distance', () => {
  assert.deepEqual(campusCenter([{ x: 0, z: 0 }, { x: 12, z: 0 }, { x: 12, z: 8 }, { x: 0, z: 8 }]), { x: 6, z: 4 })
  assert.deepEqual(campusCenter([{ x: 0, z: 0 }, { x: 12, z: 0 }, { x: 0, z: 9 }]), { x: 4, z: 3 })
  assert.deepEqual(campusCenter([]), { x: 0, z: 0 })
  const nearby = nearbyLocations(twin.locations[0], twin.locations)
  assert.equal(nearby.length, 3)
  assert.ok(nearby.every((item) => item.location.id !== twin.locations[0].id))
  assert.ok(nearby.every((item, i) => i === 0 || item.distance >= nearby[i - 1].distance))
})

test('minimap preserves all real footprints including holes, roads and selectable identities', () => {
  const overview = miniMapData(twin)
  assert.equal(overview.buildings.length, 22)
  assert.equal(overview.roads.length, 20)
  const courtyard = twin.buildings.find((building) => building.holes.length > 0)
  assert.equal((overview.buildings.find((building) => building.id === courtyard.id).path.match(/M/g) ?? []).length, courtyard.holes.length + 1)
  assert.ok(overview.buildings.every((building) => selectionForLocation(building.locationId, [...twin.locations, ...twin.selections.map((item) => item.location)], twin.selections)))
  const bounds = overview.viewBox.split(' ').map(Number)
  assert.ok(bounds.every(Number.isFinite) && bounds[2] > 0 && bounds[3] > 0)
  assert.deepEqual(miniMapData(null).buildings, [])
})
