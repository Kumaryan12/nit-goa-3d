import { Box3, BufferAttribute, BufferGeometry, Sphere, Vector3 } from 'three'
import { createTerrainGeometry } from './terrain.ts'
import type { TerrainModel } from './terrain.ts'

export interface TerrainPatchData {
  id: string
  positions: Float32Array; normals: Float32Array; colors: Float32Array
  indices: Uint16Array | Uint32Array
  min: [number, number, number]; max: [number, number, number]
}

// Split original triangles, including canal cuts, without resampling heights.
// Shared edge normals and colours remain identical across patches.
export function createTerrainPatches(model: TerrainModel, patchSegments = 64): TerrainPatchData[] {
  if (!Number.isInteger(patchSegments) || patchSegments < 2) throw new Error('Invalid terrain patch size')
  const source = createTerrainGeometry(model)
  const position = source.getAttribute('position'), normal = source.getAttribute('normal'), color = source.getAttribute('color'), index = source.getIndex()!
  const count = Math.ceil(model.segments / patchSegments), width = model.size * patchSegments / model.segments
  const patches = new Map<number, { ids: Map<number, number>; positions: number[]; normals: number[]; colors: number[]; indices: number[]; min: TerrainPatchData['min']; max: TerrainPatchData['max'] }>()
  for (let i = 0; i < index.count; i += 3) {
    const triangle = [index.getX(i), index.getX(i + 1), index.getX(i + 2)]
    const x = triangle.reduce((sum, n) => sum + position.getX(n), 0) / 3, z = triangle.reduce((sum, n) => sum + position.getZ(n), 0) / 3
    const col = Math.max(0, Math.min(count - 1, Math.floor((x + model.size / 2) / width))), row = Math.max(0, Math.min(count - 1, Math.floor((z + model.size / 2) / width))), key = row * count + col
    let patch = patches.get(key)
    if (!patch) { patch = { ids: new Map(), positions: [], normals: [], colors: [], indices: [], min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] }; patches.set(key, patch) }
    for (const original of triangle) {
      let local = patch.ids.get(original)
      if (local === undefined) {
        local = patch.ids.size; patch.ids.set(original, local)
        for (let axis = 0; axis < 3; axis++) {
          const value = position.array[original * 3 + axis]
          patch.positions.push(value); patch.normals.push(normal.array[original * 3 + axis]); patch.colors.push(color.array[original * 3 + axis])
          patch.min[axis] = Math.min(patch.min[axis], value); patch.max[axis] = Math.max(patch.max[axis], value)
        }
      }
      patch.indices.push(local)
    }
  }
  source.dispose()
  return [...patches].map(([key, p]) => ({ id: `${Math.floor(key / count)}/${key % count}`, positions: new Float32Array(p.positions), normals: new Float32Array(p.normals), colors: new Float32Array(p.colors),
    indices: p.ids.size <= 65536 ? new Uint16Array(p.indices) : new Uint32Array(p.indices), min: p.min, max: p.max }))
}

export function terrainPatchGeometry(patch: TerrainPatchData): BufferGeometry {
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(patch.positions, 3))
  geometry.setAttribute('normal', new BufferAttribute(patch.normals, 3))
  geometry.setAttribute('color', new BufferAttribute(patch.colors, 3))
  geometry.setIndex(new BufferAttribute(patch.indices, 1))
  geometry.boundingBox = new Box3(new Vector3(...patch.min), new Vector3(...patch.max))
  geometry.boundingSphere = geometry.boundingBox.getBoundingSphere(new Sphere())
  return geometry
}
