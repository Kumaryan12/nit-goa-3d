import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DoubleSide, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three'
import { createRoadGeometry } from '../src/lib/roadGeometry.ts'
import { createTerrainGeometry } from '../src/lib/terrain.ts'
import { createBridgeSlabGeometry } from '../src/lib/canalGeometry.ts'
import { createWalkWorld } from '../src/lib/walking.ts'
import { vehicleGroundPose, vehicleSurfaceHeightAt } from '../src/lib/vehicles.ts'

const terrain = (height = () => 0) => {
  const size = 40, segments = 40, heights = new Float32Array(41 ** 2)
  for (let row = 0; row <= segments; row++) for (let col = 0; col <= segments; col++) heights[row * 41 + col] = height(col - 20, row - 20)
  return { size, segments, heights, colors: new Float32Array(41 ** 2 * 3) }
}
const road = (paths, kind = 'road', width = 6) => ({ id: kind, kind, tags: {}, width, paths })
const tyreCentres = {
  bicycle: [[0, -.74, .37, .055], [0, .66, .37, .055]],
  buggy: [[-.81, -1.08, .33, .2], [-.81, 1.08, .33, .2], [.81, -1.08, .33, .2], [.81, 1.08, .33, .2]],
}
function checkTyres(point, yaw, kind, world, roads, steering = 0) {
  const pose = vehicleGroundPose(point, yaw, kind, world, roads, steering)
  const material = new MeshBasicMaterial({ side: DoubleSide })
  const geometries = [createTerrainGeometry(world.terrain), ...roads.map(r => createRoadGeometry(r.paths, r.width, r.kind === 'road' ? .06 : .08, world.terrain))]
  if (world.terrain.canal) geometries.push(createBridgeSlabGeometry(world.terrain.canal, world.terrain))
  const meshes = geometries.map(g => new Mesh(g, material))
  const ray = new Raycaster(), down = new Vector3(0, -1, 0)
  let nearest = Infinity
  for (const [x, z, radius, width] of tyreCentres[kind]) for (const side of [-1, 1]) for (let i = 0; i < 80; i++) {
    // Independently transform the model's tyre rim, then raycast the real meshes.
    const angle = i * Math.PI / 40, rim = new Vector3(side * width / 2, radius * Math.sin(angle), radius * Math.cos(angle))
    if (kind === 'bicycle' && z < 0) rim.applyAxisAngle(new Vector3(0, 1, 0), Math.max(-.38, Math.min(.38, steering)))
    rim.add(new Vector3(x, radius, z)).applyAxisAngle(new Vector3(1, 0, 0), pose.pitch).applyAxisAngle(new Vector3(0, 1, 0), yaw).add(new Vector3(point.x, pose.y, point.z))
    ray.set(new Vector3(rim.x, 100, rim.z), down)
    const hit = ray.intersectObjects(meshes)[0]
    assert.ok(hit); const clearance = rim.y - hit.point.y
    assert.ok(clearance >= .004, `${kind} tyre intersects displayed surface by ${-clearance}m`)
    nearest = Math.min(nearest, clearance)
  }
  assert.ok(nearest < .02, 'at least one tyre contacts the surface rather than floating')
  for (const mesh of meshes) mesh.geometry.dispose()
  material.dispose()
  return pose
}

test('bicycle and buggy tyres sit on elevated roads, footpaths and open ground', () => {
  const world = createWalkWorld([], [], terrain()), paths = [[{ x: 0, z: -18 }, { x: 0, z: 18 }]]
  for (const kind of ['bicycle', 'buggy']) {
    const ground = checkTyres({ x: 0, z: 0 }, 0, kind, world, [])
    const asphalt = checkTyres({ x: 0, z: 0 }, 0, kind, world, [road(paths)])
    const path = checkTyres({ x: 0, z: 0 }, 0, kind, world, [road(paths, 'footpath')])
    assert.ok(Math.abs(asphalt.y - ground.y - .06) < 1e-8)
    assert.ok(Math.abs(path.y - ground.y - .08) < 1e-8)
    checkTyres({ x: 2.9, z: 0 }, .4, kind, world, [road(paths)])
  }
})
test('uphill pitch raises the front and tyres clear slopes, crests and steering turns', () => {
  for (const height of [(x, z) => -.4 * z + .08 * x, (x, z) => -Math.abs(z) * .3 + .04 * x]) {
    const world = createWalkWorld([], [], terrain(height)), roads = [road([[{ x: 0, z: -18 }, { x: 0, z: 18 }]])]
    for (const kind of ['bicycle', 'buggy']) for (const point of [{ x: 0, z: 4 }, { x: 2.8, z: .1 }]) {
      const pose = checkTyres(point, .2, kind, world, roads, -.3)
      if (point.z === 4 && height(0, -1) > height(0, 1)) assert.ok(pose.pitch > 0, 'front tilts upward on an uphill road')
    }
  }
})
test('wheel support covers the rendered miter at bends and drops to grass beyond the road', () => {
  const world = createWalkWorld([], [], terrain()), roads = [road([[{ x: 0, z: 15 }, { x: 0, z: 0 }, { x: 15, z: 0 }]])]
  assert.equal(vehicleSurfaceHeightAt({ x: -2.5, z: -2.5 }, world, roads), .06, 'outer miter is road even beyond the centreline strips')
  assert.equal(vehicleSurfaceHeightAt({ x: -4, z: -4 }, world, roads), 0)
  for (const kind of ['bicycle', 'buggy']) checkTyres({ x: -2, z: -2 }, -Math.PI / 4, kind, world, roads)
})
test('bridge deck supports wheels above bare terrain between the carriageways', () => {
  const model = terrain(); model.canal = { center: { x: 0, z: 0 }, along: { x: 1, z: 0 }, across: { x: 0, z: 1 }, length: 30, width: 3, bankWidth: 1, depth: 1.2, bridge: { width: 12, length: 7, roadIds: [] } }
  const world = createWalkWorld([], [], model)
  assert.equal(vehicleSurfaceHeightAt({ x: 0, z: 0 }, world, []), .018)
  for (const kind of ['bicycle', 'buggy']) {
    assert.ok(Math.abs(vehicleGroundPose({ x: 0, z: 0 }, 0, kind, world, []).y - .028) < 1e-8)
    checkTyres({ x: 0, z: 0 }, .3, kind, world, [])
  }
})
