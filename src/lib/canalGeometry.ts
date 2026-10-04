import { BufferGeometry, Float32BufferAttribute } from 'three'
import { canalPoint } from './canal.ts'
import type { CanalLayout } from './canal.ts'
import { terrainHeightAt } from './terrain.ts'
import type { TerrainModel } from './terrain.ts'

export const CANAL_WATER_DROP = 0.85

export function canalWaterHeight(canal: CanalLayout, terrain: TerrainModel, along: number): number {
  const point = canalPoint(canal, along)
  return terrainHeightAt(terrain, point.x, point.z) - canal.depth * CANAL_WATER_DROP
}

function stripGeometry(positions: number[], indices: number[]): BufferGeometry {
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  geometry.computeBoundingSphere()
  return geometry
}

export function createCanalGeometry(canal: CanalLayout, terrain: TerrainModel) {
  const water: number[] = [], lining: number[] = [], waterIndices: number[] = [], liningIndices: number[] = []
  const steps = Math.ceil(canal.length), opening = canal.width / 2 + canal.bankWidth
  for (let i = 0; i <= steps; i++) {
    const along = -canal.length / 2 + canal.length * i / steps, y = canalWaterHeight(canal, terrain, along)
    for (const side of [-1, 1]) {
      const point = canalPoint(canal, along, side * canal.width / 2)
      water.push(point.x, y, point.z)
      const rim = canalPoint(canal, along, side * opening), bottom = canalPoint(canal, along, side * canal.width / 2)
      const curb = canalPoint(canal, along, side * (opening + 0.18))
      // Grey concrete lining meets the exact terrain cut; no brown earth bank.
      const top = terrainHeightAt(terrain, rim.x, rim.z)
      lining.push(bottom.x, y - canal.depth * 0.15, bottom.z, rim.x, top, rim.z, curb.x, terrainHeightAt(terrain, curb.x, curb.z) + 0.035, curb.z)
    }
    if (i < steps) {
      const w = i * 2
      waterIndices.push(w, w + 2, w + 1, w + 1, w + 2, w + 3)
      for (let side = 0; side < 2; side++) for (let edge = 0; edge < 2; edge++) {
        const start = i * 6 + side * 3 + edge
        const face = [start, start + 6, start + 1, start + 1, start + 6, start + 7]
        liningIndices.push(...(side ? face : [face[0], face[2], face[1], face[3], face[5], face[4]]))
      }
    }
  }
  return { water: stripGeometry(water, waterIndices), lining: stripGeometry(lining, liningIndices) }
}

/** Thin structural slab follows the existing road grade on top and below. */
export function createBridgeSlabGeometry(canal: CanalLayout, terrain: TerrainModel): BufferGeometry {
  const positions: number[] = [], indices: number[] = []
  const acrossSteps = Math.ceil(canal.bridge.length), alongSteps = Math.ceil(canal.bridge.width)
  for (let across = 0; across <= acrossSteps; across++) for (let along = 0; along <= alongSteps; along++) {
    const p = canalPoint(canal, -canal.bridge.width / 2 + along * canal.bridge.width / alongSteps, -canal.bridge.length / 2 + across * canal.bridge.length / acrossSteps)
    const y = terrainHeightAt(terrain, p.x, p.z)
    positions.push(p.x, y + 0.018, p.z, p.x, y - 0.32, p.z)
  }
  const stride = (alongSteps + 1) * 2
  for (let across = 0; across < acrossSteps; across++) for (let along = 0; along < alongSteps; along++) {
    const a = across * stride + along * 2, b = a + 2, c = a + stride, d = c + 2
    indices.push(a, b, c, b, d, c, a + 1, c + 1, b + 1, b + 1, c + 1, d + 1)
  }
  const wall = (a: number, b: number) => indices.push(a, a + 1, b, b, a + 1, b + 1)
  for (let along = 0; along < alongSteps; along++) { wall(along * 2 + 2, along * 2); const a = acrossSteps * stride + along * 2; wall(a, a + 2) }
  for (let across = 0; across < acrossSteps; across++) { wall(across * stride, (across + 1) * stride); const a = across * stride + alongSteps * 2; wall(a + stride, a) }
  return stripGeometry(positions, indices)
}
