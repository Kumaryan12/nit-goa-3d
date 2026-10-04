import assert from 'node:assert/strict'
import { test } from 'node:test'
import { defaultTerrainSettings } from '../src/data/topography.ts'
import { validateCampusSlope, readCampusSlopes } from '../src/lib/slopeEdits.ts'
import { readTerrainSettings, saveTerrainSettings } from '../src/lib/terrainSettings.ts'
import { resolveSlopePatches, slopeElevationAt } from '../src/lib/topography.ts'
import { generateTerrain, terrainHeightAt } from '../src/lib/terrain.ts'
import { createRoadGeometry, ROAD_ELEVATION } from '../src/lib/roadGeometry.ts'

const slope = { id: 'test-slope', name: ' Test road ', lower: { x: 0, z: 0 }, upper: { x: 100, z: 0 }, riseMeters: 6, widthMeters: 40 }
const close = (a, b, tolerance = 1e-5) => assert.ok(Math.abs(a-b) <= tolerance, `${a} ≈ ${b}`)

test('marked slopes reject invalid endpoints, heights and duplicate/corrupt saves without mutating valid entries', () => {
  const normalized = validateCampusSlope(slope)
  assert.equal(normalized.name, 'Test road')
  for (const invalid of [{lower:null}, {upper:{x:1,z:1}}, {upper:{x:NaN,z:0}}, {riseMeters:0}, {widthMeters:500}, {name:''}]) assert.throws(() => validateCampusSlope({...slope,...invalid}))
  assert.deepEqual(readCampusSlopes([null, slope, slope, {...slope,id:'other',riseMeters:Infinity}]), [normalized])
  normalized.lower.x = 90
  assert.equal(slope.lower.x, 0)
  let saved
  const storage = { getItem: () => saved ?? null, setItem: (_key, value) => { saved = value } }
  saveTerrainSettings(storage, {...defaultTerrainSettings,customSlopes:[slope]})
  assert.deepEqual(readTerrainSettings(storage).customSlopes, [validateCampusSlope(slope)])
  const first = readTerrainSettings(storage); first.customSlopes[0].upper.x = 12
  assert.equal(readTerrainSettings(storage).customSlopes[0].upper.x, 100)
})

test('custom slopes achieve a relative rise over existing relief and leave ground outside their corridor alone', () => {
  const base = { lower:{x:0,z:0,halfX:8,halfZ:8}, upper:{x:100,z:0,halfX:8,halfZ:8},rise:3 }
  const patches = resolveSlopePatches([slope],base)
  close(slopeElevationAt(slope.upper,base,patches)-slopeElevationAt(slope.lower,base,patches),6)
  close(slopeElevationAt({x:50,z:100},base,patches),slopeElevationAt({x:50,z:100},base))
  close(slopeElevationAt({x:-30,z:0},base,patches),slopeElevationAt({x:-30,z:0},base))
  let previous = 0
  for(let x=0;x<=100;x++){const height=slopeElevationAt({x,z:0},base,patches);assert.ok(height>=previous);previous=height}
})

test('a marked slope works without Nescafe and keeps the actual road surface attached to its terrain', () => {
  const patches = resolveSlopePatches([slope])
  const road = {width:5,paths:[[slope.lower,slope.upper]]}
  const terrain = generateTerrain(300,{boundary:[],buildings:[],roads:[road],clearings:[],slopePatches:patches},150)
  close(terrainHeightAt(terrain,0,0),0)
  close(terrainHeightAt(terrain,100,0),6)
  const geometry = createRoadGeometry(road.paths,road.width,ROAD_ELEVATION,terrain)
  try{const p=geometry.getAttribute('position');for(let i=0;i<p.count;i++)close(p.getY(i),terrainHeightAt(terrain,p.getX(i),p.getZ(i))+ROAD_ELEVATION,1e-4)}finally{geometry.dispose()}
})

test('marked slopes join an upper bench before gradually blending back into surrounding terrain', () => {
  const patches = resolveSlopePatches([slope])
  const height = x => slopeElevationAt({ x, z: 0 }, undefined, patches)
  close(height(100), 6)
  close(height(120), 6)
  assert.ok(height(125) > 5.9, 'no sudden dip beyond the crest')
  close(height(220), 0)
  for (let x = 120; x < 220; x++) assert.ok(Math.abs(height(x + 1) - height(x)) < .1, 'return to surrounding grade is gentle')
})

test('gate to admin has two separate rises and a level middle section', () => {
  const base = {lower:{x:0,z:0,halfX:8,halfZ:8},upper:{x:0,z:100,halfX:8,halfZ:8},rise:8,gateApproach:{lower:{x:0,z:200},upper:{x:200,z:200},width:95,drop:6,stages:2}}
  const height=x=>slopeElevationAt({x,z:200},base)
  close(height(0),2);close(height(80),5);close(height(100),5);close(height(116),5);close(height(200),8)
  assert.ok(height(40)>height(0) && height(40)<height(80))
  assert.ok(height(160)>height(116) && height(160)<height(200))
})

test('published terrain matches the owner export and new visitors receive an independent copy', async () => {
  const { readFileSync } = await import('node:fs')
  const exported = JSON.parse(readFileSync(new URL('./fixtures/nit-goa-terrain.json', import.meta.url)))
  assert.deepEqual(defaultTerrainSettings, exported)
  const settings = readTerrainSettings({ getItem: () => null })
  assert.deepEqual(settings, exported)
  settings.customSlopes[0].upper.x = 0
  assert.deepEqual(readTerrainSettings({ getItem: () => null }), exported)
})

test('older browser saves inherit published slopes once, retain edits without duplicates, and respect later removals', () => {
  let value = JSON.stringify({ ...defaultTerrainSettings, gateRiseMeters: 7, customSlopes: [slope] })
  const storage = { getItem: () => value, setItem: (_key, next) => { value = next } }
  const migrated = readTerrainSettings(storage)
  assert.equal(migrated.gateRiseMeters, 7)
  assert.deepEqual(migrated.customSlopes.map(item => item.id), [slope.id, defaultTerrainSettings.customSlopes[0].id])
  assert.deepEqual(readTerrainSettings(storage), migrated)
  saveTerrainSettings(storage, { ...migrated, customSlopes: [] })
  assert.deepEqual(readTerrainSettings(storage).customSlopes, [], 'removed shared slope must not return on reload')
  const edited = { ...defaultTerrainSettings.customSlopes[0], riseMeters: 5 }
  value = JSON.stringify({ ...defaultTerrainSettings, customSlopes: [edited] })
  assert.deepEqual(readTerrainSettings(storage).customSlopes, [edited], 'matching local edits override published settings')
  assert.doesNotThrow(() => readTerrainSettings({ getItem: () => '{}', setItem: () => { throw new Error('quota') } }))
})

test('the shared campus renders the same slope as the saved export and raises the marked section while keeping foundations level', async () => {
  const { readFileSync } = await import('node:fs')
  const { extractBuildingFootprints } = await import('../src/lib/buildings.ts')
  const { extractCampusRoads } = await import('../src/lib/roads.ts')
  const { createDigitalTwin } = await import('../src/lib/digitalTwin.ts')
  const { savedCampusOverrides } = await import('../src/data/campusOverrides.ts')
  const { gpsToLocal } = await import('../src/lib/geo.ts')
  const elements = name => JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url))).elements
  const buildings = elements('nit-goa-campus'), roadElements = elements('nit-goa-roads')
  const boundary = roadElements.find(element => element.id === 1259742369).geometry
  const map = { buildings: extractBuildingFootprints(buildings), boundary }
  const roads = { roads: extractCampusRoads(roadElements, boundary), boundary }
  const published = createDigitalTwin(map, roads, false, savedCampusOverrides)
  const exported = JSON.parse(readFileSync(new URL('./fixtures/nit-goa-terrain.json', import.meta.url)))
  const local = createDigitalTwin(map, roads, false, savedCampusOverrides, exported)
  const previous = createDigitalTwin(map, roads, false, savedCampusOverrides, { ...defaultTerrainSettings, customSlopes: [] })
  assert.deepEqual(published.terrain, local.terrain)
  const marked = exported.customSlopes[0]
  const height = (model, point) => terrainHeightAt(model.terrain, point.x, point.z)
  assert.ok(height(published, marked.upper) - height(previous, marked.upper) > 2)
  let last = height(published, marked.lower)
  for (let t = 0; t <= 1; t += .05) {
    const point = { x: marked.lower.x + (marked.upper.x - marked.lower.x) * t, z: marked.lower.z + (marked.upper.z - marked.lower.z) * t }
    const current = height(published, point)
    assert.ok(current >= last - 1e-5)
    last = current
  }
  for (const building of published.buildings) for (const point of building.outer.map(gpsToLocal)) close(height(published, point), building.baseElevation)
})
