import test from 'node:test'
import assert from 'node:assert/strict'
import { createTerrainContourGeometry, TERRAIN_CONTOUR_OFFSET } from '../src/lib/terrainContours.ts'
import { terrainHeightAt } from '../src/lib/terrain.ts'

const model = (heights, size = 2, segments = 1) => ({ size, segments, heights: Float32Array.from(heights), colors: new Float32Array(heights.length * 3) })
const close = (a, b, tolerance = 1e-5) => assert.ok(Math.abs(a - b) < tolerance, `${a} should be close to ${b}`)

test('contours trace constant elevations across a ramp, including the mesh diagonal', () => {
  const surface = model([0, 4, 0, 4])
  const geometry = createTerrainContourGeometry(surface)
  const positions = geometry.getAttribute('position')
  const middle = []
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i)
    close(y, terrainHeightAt(surface, x, z) + TERRAIN_CONTOUR_OFFSET)
    if (Math.abs(y - 2.08) < 1e-5) { close(x, 0); middle.push(z) }
  }
  assert.deepEqual(middle.sort(), [-1, 0, 0, 1])
  geometry.dispose()
})

test('saddle contours follow both exact triangles rather than bilinear interpolation', () => {
  const surface = model([0, 4, 4, 0])
  const geometry = createTerrainContourGeometry(surface)
  const positions = geometry.getAttribute('position')
  assert.ok(positions.count > 0)
  for (let i = 0; i < positions.count; i += 2) {
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      const x = positions.getX(i) * (1 - t) + positions.getX(i + 1) * t
      const z = positions.getZ(i) * (1 - t) + positions.getZ(i + 1) * t
      close(positions.getY(i), terrainHeightAt(surface, x, z) + TERRAIN_CONTOUR_OFFSET)
    }
  }
  // The on-level shared diagonal is emitted once, not once for each triangle.
  const topVertices = Array.from({ length: positions.count }, (_, i) => positions.getY(i)).filter((y) => Math.abs(y - 4.08) < 1e-5)
  assert.equal(topVertices.length, 2)
  geometry.dispose()
})

test('flat terraces produce no contours and invalid height samples produce no invalid vertices', () => {
  for (const surface of [model([2, 2, 2, 2]), model([0, NaN, 2, 4])]) {
    const geometry = createTerrainContourGeometry(surface)
    assert.equal(geometry.getAttribute('position').count, 0)
    geometry.dispose()
  }
  const geometry = createTerrainContourGeometry(model([-4, 0, -4, 0]))
  assert.ok(Array.from(geometry.getAttribute('position').array).every(Number.isFinite))
  geometry.dispose()
})

test('contours validate intervals, remain deterministic, and release their geometry', () => {
  const surface = model([0, 4, 0, 4])
  for (const interval of [0, -1, NaN, Infinity]) assert.throws(() => createTerrainContourGeometry(surface, interval), RangeError)
  const first = createTerrainContourGeometry(surface), second = createTerrainContourGeometry(surface)
  assert.deepEqual(first.getAttribute('position').array, second.getAttribute('position').array)
  let disposed = false
  first.addEventListener('dispose', () => { disposed = true })
  first.dispose(); second.dispose()
  assert.equal(disposed, true)
  assert.deepEqual(Array.from(surface.heights), [0, 4, 0, 4])
})

test('a tiny interval cannot allocate an unbounded set of contour segments', () => {
  const segments = 20
  const heights = Array.from({ length: (segments + 1) ** 2 }, (_, i) => i % (segments + 1) % 2 ? 100 : -100)
  const geometry = createTerrainContourGeometry(model(heights, 100, segments), 0.00001)
  const positions = geometry.getAttribute('position')
  assert.ok(positions.count <= 200_000)
  assert.ok(Array.from(positions.array).every(Number.isFinite))
  geometry.dispose()
})
