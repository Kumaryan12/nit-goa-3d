import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { MeshStandardMaterial, ShaderLib, Vector3 } from 'three'
import { savedCampusOverrides } from '../src/data/campusOverrides.ts'
import { defaultTerrainSettings } from '../src/data/topography.ts'
import { extractBuildingFootprints } from '../src/lib/buildings.ts'
import { createDigitalTwin } from '../src/lib/digitalTwin.ts'
import { extractCampusRoads, pointInCampus } from '../src/lib/roads.ts'
import { generateCampusMeadow, MEADOW_LIMIT, nearbyMeadowChunks } from '../src/lib/campusMeadow.ts'
import { createMeadowTuft } from '../src/lib/meadowGeometry.ts'
import { createFoliageMaterial } from '../src/lib/foliageWind.ts'
import { distanceToRect, distanceToSegment, footprintRect, terrainHeightAt } from '../src/lib/terrain.ts'
import { inCanalOpening } from '../src/lib/canal.ts'
import { flagBlocksWalking } from '../src/lib/campusFlag.ts'

const source = JSON.parse(readFileSync(new URL('./fixtures/nit-goa-campus.json', import.meta.url)))
const roadSource = JSON.parse(readFileSync(new URL('./fixtures/nit-goa-roads.json', import.meta.url)))
const boundary = roadSource.elements.find(e => e.id === 1259742369).geometry
const twin = createDigitalTwin({ buildings: extractBuildingFootprints(source.elements), boundary, source: 'campus-area', returnedBuildingCount: 22 },
  { roads: extractCampusRoads(roadSource.elements, boundary), boundary, source: 'campus-area', returnedRoadCount: 20 }, true, savedCampusOverrides, defaultTerrainSettings)
const chunks = generateCampusMeadow(twin), tufts = chunks.flatMap(c => c.tufts)

test('meadow covers the campus deterministically with bounded, terrain-attached planting', () => {
  assert.ok(tufts.length > 3000 && tufts.length <= MEADOW_LIMIT)
  assert.ok(chunks.length > 20)
  assert.deepEqual(generateCampusMeadow(twin), chunks)
  assert.deepEqual(generateCampusMeadow({ ...twin, boundary: [] }), [])
  assert.equal(twin.trees.length, 640)
  const quadrants = new Set(tufts.map(t => `${Math.sign(t.x)}/${Math.sign(t.z)}`))
  assert.equal(quadrants.size, 4, 'the cap does not concentrate grass at one end of campus')
  for (const c of chunks) for (const t of c.tufts) {
    assert.ok(pointInCampus(t, twin.boundary))
    assert.ok(Math.abs(t.y - terrainHeightAt(twin.terrain, t.x, t.z) - .012) < 1e-7)
    assert.ok(t.height <= .36 && t.width <= .5)
    assert.ok(Math.hypot(t.x - c.center[0], t.y + t.height - c.center[1], t.z - c.center[2]) + .4 <= c.radius)
  }
})

test('grass keeps roads, foundations, courts, OAT access, canal and flag approaches clear', () => {
  const rects = twin.buildings.map(footprintRect)
  const lines = twin.roads.flatMap(r => r.paths.flatMap(p => p.slice(1).map((b, i) => ({ a: p[i], b, width: r.width }))))
  for (const t of tufts) {
    assert.ok(rects.every(r => distanceToRect(t, r) >= 6.5))
    assert.ok(lines.every(l => distanceToSegment(t, l.a, l.b) >= l.width / 2 + 6.5))
    assert.ok(twin.vegetationClearings.every(r => distanceToRect(t, r) >= 6.5))
    assert.ok(!inCanalOpening(t, twin.canal, 1.5))
    assert.ok(!flagBlocksWalking(t, twin.flag, 2.5))
    assert.ok(twin.lawns.every(l => l.hardscape.every(r => !pointInCampus(t, r))))
  }
})

test('grass draw budgets remain finite on every quality level and omit aerial/distant detail', () => {
  const camera = { x: tufts[0].x, y: tufts[0].y + 2, z: tufts[0].z }
  for (const [level, limit] of [6, 9, 12].entries()) {
    const visible = nearbyMeadowChunks(chunks, camera, level)
    assert.ok(visible.size > 0 && visible.size <= limit)
    assert.equal(nearbyMeadowChunks(chunks, { ...camera, y: 1200 }, level).size, 0)
    assert.equal(nearbyMeadowChunks(chunks, { x: 10000, y: 2, z: 10000 }, level).size, 0)
  }
})

test('shared grass geometry uses 25 finite, nondegenerate triangles with fixed roots', () => {
  const geometry = createMeadowTuft(), p = geometry.getAttribute('position'), index = geometry.index
  try {
    assert.equal(index.count / 3, 25)
    assert.ok([...p.array, ...geometry.getAttribute('normal').array].every(Number.isFinite))
    assert.ok(Array.from({ length: p.count }, (_, i) => p.getY(i)).every(y => y >= 0 && y <= 1))
    for (let i = 0; i < index.count; i += 3) {
      const a = new Vector3().fromBufferAttribute(p, index.getX(i)), b = new Vector3().fromBufferAttribute(p, index.getX(i + 1)), c = new Vector3().fromBufferAttribute(p, index.getX(i + 2))
      assert.ok(b.sub(a).cross(c.sub(a)).lengthSq() > 1e-9)
    }
  } finally { geometry.dispose() }
})

test('wind augments the standard lit shader after instancing and exposes shared motion uniforms', () => {
  const wind = { time: { value: 0 }, amount: { value: .09 } }, keys = new Set()
  for (const flex of ['canopy', 'palm', 'grass']) {
    const material = createFoliageMaterial({ color: 'white' }, flex, wind)
    assert.ok(material instanceof MeshStandardMaterial)
    const shader = { uniforms: {}, vertexShader: ShaderLib.standard.vertexShader, fragmentShader: ShaderLib.standard.fragmentShader }
    material.onBeforeCompile(shader, {})
    assert.equal(shader.uniforms.campusWindTime, wind.time)
    assert.equal(shader.uniforms.campusWindAmount, wind.amount)
    assert.ok(shader.vertexShader.indexOf('instanceMatrix * mvPosition') < shader.vertexShader.indexOf('float campusBreeze'))
    assert.ok(shader.vertexShader.indexOf('float campusBreeze') < shader.vertexShader.indexOf('mvPosition = modelViewMatrix * mvPosition'))
    assert.ok(shader.vertexShader.includes('#include <normal_vertex>'))
    assert.equal(shader.fragmentShader, ShaderLib.standard.fragmentShader, 'preserves standard lighting, fog and shadow reception')
    wind.amount.value = 0
    assert.equal(shader.uniforms.campusWindAmount.value, 0, 'motion can stop without re-uploading instances or recompiling')
    keys.add(material.customProgramCacheKey()); material.dispose()
  }
  assert.equal(keys.size, 3, 'different flex shaders do not collide in the program cache')
})
