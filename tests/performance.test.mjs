import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { once } from 'node:events'
import { Worker } from 'node:worker_threads'
import { test } from 'node:test'
import { Frustum, Matrix4, Mesh, MeshBasicMaterial, PerspectiveCamera, Raycaster, Vector3 } from 'three'
import { createTerrainGeometry, generateTerrain } from '../src/lib/terrain.ts'
import { createTerrainPatches, terrainPatchGeometry } from '../src/lib/terrainPatches.ts'
import { adaptGraphics, detailVisible, graphicsProfile, initialGraphics, validGraphicsMode } from '../src/lib/graphics.ts'
import { defaultTerrainSettings } from '../src/data/topography.ts'
import { savedCampusOverrides } from '../src/data/campusOverrides.ts'
import { extractBuildingFootprints } from '../src/lib/buildings.ts'
import { extractCampusRoads } from '../src/lib/roads.ts'

const canal = { center: { x: 0, z: 0 }, along: { x: 0, z: 1 }, across: { x: 1, z: 0 }, length: 150, width: 3, bankWidth: .5, depth: 1.2, bridge: { length: 7, width: 10, roadIds: [] } }
const model = generateTerrain(320, { boundary: [], roads: [], buildings: [], clearings: [], canal }, 128)
const source = createTerrainGeometry(model), patches = createTerrainPatches(model, 32)
const vertex = (g, i) => ['position', 'normal', 'color'].flatMap(name => Array.from(g.getAttribute(name).array.slice(i * 3, i * 3 + 3))).join(',')
const triangles = geometries => {
  const result = new Map()
  for (const g of geometries) for (let i = 0; i < g.index.count; i += 3) {
    const key = [0, 1, 2].map(j => vertex(g, g.index.getX(i + j))).join('|')
    result.set(key, (result.get(key) ?? 0) + 1)
  }
  return result
}

test('terrain patches preserve every original triangle, canal cut, normal and colour', () => {
  const geometries = patches.map(terrainPatchGeometry)
  try {
    assert.equal(patches.length, 16)
    assert.deepEqual(triangles(geometries), triangles([source]))
    assert.ok(geometries.every(g => g.index.array instanceof Uint16Array))
    const material = new MeshBasicMaterial(), whole = new Mesh(source, material), split = geometries.map(g => new Mesh(g, material))
    const ray = new Raycaster()
    for (const [x, z] of [[-80, -80], [80, 80], [0, 0], [-.5, 15], [4, 15], [79.9, -80.1], [80.1, -79.9]]) {
      ray.set(new Vector3(x, 100, z), new Vector3(0, -1, 0))
      const a = ray.intersectObject(whole), b = ray.intersectObjects(split)
      assert.equal(a.length > 0, b.length > 0)
      if (a.length) assert.ok(Math.abs(a[0].point.y - b[0].point.y) < 1e-6)
    }
    ray.set(new Vector3(0, 100, 0), new Vector3(0, -1, 0))
    assert.equal(ray.intersectObjects(split).length, 0, 'the canal remains an open channel')
    material.dispose()
  } finally { geometries.forEach(g => g.dispose()) }
})

test('patch bounds allow a nearby camera to skip most terrain triangles', () => {
  const camera = new PerspectiveCamera(50, 1.5, .1, 120)
  camera.position.set(-120, 12, -120); camera.lookAt(-110, 0, -90); camera.updateMatrixWorld()
  const frustum = new Frustum().setFromProjectionMatrix(new Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse))
  const geometries = patches.map(terrainPatchGeometry)
  try {
    let visible = 0
    for (const geometry of geometries) {
      const mesh = new Mesh(geometry); mesh.updateMatrixWorld()
      if (frustum.intersectsObject(mesh)) visible += geometry.index.count
      for (let i = 0; i < geometry.getAttribute('position').count; i++) assert.ok(geometry.boundingBox.containsPoint(new Vector3().fromBufferAttribute(geometry.getAttribute('position'), i)))
    }
    assert.ok(visible > 0 && visible < source.index.count * .5, `${visible / source.index.count * 100}% of terrain submitted`)
  } finally { geometries.forEach(g => g.dispose()) }
})

test('automatic graphics use sustained frame rates, cooldowns and a compact-device ceiling', () => {
  let state = initialGraphics(false)
  state = adaptGraphics(state, 30, 1, false)
  assert.equal(state.level, 1, 'one slow loading frame does not lower quality')
  for (let i = 0; i < 3; i++) state = adaptGraphics(state, 30, 1, false)
  assert.equal(state.level, 0)
  for (let i = 0; i < 16; i++) state = adaptGraphics(state, 60, 1, false)
  assert.equal(state.level, 0, 'cooldown prevents immediate oscillation')
  for (let i = 0; i < 12; i++) state = adaptGraphics(state, 60, 1, false)
  assert.equal(state.level, 1)
  assert.equal(adaptGraphics(state, 1, 20, false), state, 'background/resume gaps are ignored')
  state = initialGraphics(true)
  for (let i = 0; i < 100; i++) state = adaptGraphics(state, 60, 1, true)
  assert.equal(state.level, 0, 'phones retain the battery-conscious ceiling')
  for (let i = 0; i < 4; i++) state = adaptGraphics(state, 25, 1, true)
  assert.equal(state.level, -1, 'slow phones can fall below the normal smooth preset')
  assert.equal(graphicsProfile('auto', state.level).dpr, .65)
  assert.equal(graphicsProfile('auto', state.level).shadowSize, 512)
  assert.equal(graphicsProfile('smooth', 2).shadowSize, 1024)
  assert.equal(graphicsProfile('detailed', 0).detailDistance, Infinity)
  assert.equal(validGraphicsMode('unexpected'), 'auto')
})

test('facade detail uses hysteresis and always retains the selected building', () => {
  const center = [0, 0, 0]
  assert.equal(detailVisible({ x: 121, y: 0, z: 0 }, center, 10, 100, false), false)
  assert.equal(detailVisible({ x: 121, y: 0, z: 0 }, center, 10, 100, true), true)
  assert.equal(detailVisible({ x: 131, y: 0, z: 0 }, center, 10, 100, true), false)
  assert.equal(detailVisible({ x: 900, y: 0, z: 0 }, center, 10, 100, false, true), true)
})

const campus = JSON.parse(readFileSync(new URL('./fixtures/nit-goa-campus.json', import.meta.url)))
const roadResponse = JSON.parse(readFileSync(new URL('./fixtures/nit-goa-roads.json', import.meta.url)))
const boundary = roadResponse.elements.find(e => e.id === 1259742369).geometry
const request = { id: 19, map: { buildings: extractBuildingFootprints(campus.elements), boundary, source: 'campus-area', returnedBuildingCount: 22 }, roads: { roads: extractCampusRoads(roadResponse.elements, boundary), boundary, source: 'campus-area', returnedRoadCount: 20 }, settled: true, overrides: savedCampusOverrides, terrainSettings: defaultTerrainSettings }

test('the real campus worker transfers terrain and interior plans while the parent stays responsive', async () => {
  const worker = new Worker(new URL('./fixtures/twin-worker.mjs', import.meta.url), { execArgv: ['--experimental-strip-types'] })
  let ticks = 0
  const ticker = setInterval(() => ticks++, 10)
  try {
    assert.deepEqual((await once(worker, 'message'))[0], { ready: true })
    worker.postMessage(request)
    const [result] = await once(worker, 'message')
    assert.equal(result.id, request.id)
    assert.ok(result.twin, result.error)
    assert.equal(result.twin.terrainPatches.length, 64)
    assert.equal(result.twin.terrainPatches.reduce((n, p) => n + p.indices.length / 3, 0), 524356)
    assert.ok(result.twin.terrain.heights instanceof Float32Array)
    assert.ok(result.twin.terrainPatches.every(p => p.positions instanceof Float32Array && p.positions.every(Number.isFinite)))
    assert.deepEqual(result.twin.interiors.gyan.floors.map(f => f.rooms.length), [15, 30, 30])
    assert.ok(result.twin.interiors.hostel.rooms.length > 0)
    assert.equal(result.twin.trees.length, 644)
    assert.ok(result.twin.meadow.length > 20)
    assert.ok(result.twin.meadow.reduce((n, c) => n + c.tufts.length, 0) <= 10000)
    assert.ok(ticks > 5, 'campus construction runs outside the parent event loop')
  } finally { clearInterval(ticker); await worker.terminate() }
})

test('terminating obsolete generation prevents its result from being published', async () => {
  const worker = new Worker(new URL('./fixtures/twin-worker.mjs', import.meta.url), { execArgv: ['--experimental-strip-types'] })
  await once(worker, 'message')
  let published = false
  worker.on('message', () => { published = true })
  worker.postMessage(request)
  await worker.terminate()
  assert.equal(published, false)
})
