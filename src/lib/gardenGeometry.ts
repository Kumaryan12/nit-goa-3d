import { BufferGeometry, Float32BufferAttribute } from 'three'
import { gardenPoint } from './campusGardens.ts'
import type { GardenBed } from './campusGardens.ts'
import { terrainHeightAt } from './terrain.ts'
import type { TerrainModel } from './terrain.ts'

export function createGardenSoil(beds: GardenBed[], terrain: TerrainModel): BufferGeometry {
  const positions: number[] = [], indices: number[] = [], segments = 24, rings = 4
  for (const bed of beds) {
    const start = positions.length / 3
    for (let ring = 0; ring <= rings; ring++) for (let i = 0; i <= segments; i++) {
      const angle = i * Math.PI * 2 / segments, r = ring / rings
      const p = gardenPoint(bed, Math.cos(angle) * bed.length / 2 * r, Math.sin(angle) * bed.width / 2 * r)
      positions.push(p.x, terrainHeightAt(terrain, p.x, p.z) + .028, p.z)
    }
    for (let ring = 0; ring < rings; ring++) for (let i = 0; i < segments; i++) {
      const a = start + ring * (segments + 1) + i, b = a + segments + 1
      if (ring > 0) indices.push(a, a + 1, b)
      indices.push(a + 1, b + 1, b)
    }
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3)); geometry.setIndex(indices)
  geometry.computeVertexNormals(); geometry.computeBoundingSphere()
  return geometry
}

// Five cupped petals share a single instanced geometry, rather than five meshes
// per flower. A separate small gold centre gives a readable flower silhouette.
export function createFlowerPetals(): BufferGeometry {
  const positions: number[] = [], indices: number[] = []
  for (let petal = 0; petal < 5; petal++) {
    const angle = petal * Math.PI * 2 / 5, start = positions.length / 3
    const vertex = (radial: number, across: number, y: number) => positions.push(Math.cos(angle) * radial - Math.sin(angle) * across, y, Math.sin(angle) * radial + Math.cos(angle) * across)
    vertex(.57, .02, -.04)
    for (let i = 0; i <= 8; i++) {
      const a = i * Math.PI / 4, radial = .57 + Math.cos(a) * .56
      vertex(radial, Math.sin(a) * .35, Math.max(0, radial - .4) * .15)
    }
    for (let i = 0; i < 8; i++) indices.push(start, start + i + 2, start + i + 1)
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3)); geometry.setIndex(indices)
  geometry.computeVertexNormals(); geometry.computeBoundingSphere()
  return geometry
}

export function createFlowerLeaves(): BufferGeometry {
  const positions: number[] = [], indices: number[] = []
  for (const side of [-1, 1]) {
    const start = positions.length / 3
    positions.push(0, 0, 0, side * .55, .22, .23, side, .35, 0, side * .55, .22, -.23)
    indices.push(start, start + 2, start + 1, start, start + 3, start + 2)
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3)); geometry.setIndex(indices)
  geometry.computeVertexNormals(); return geometry
}

export function createPalmFrond(): BufferGeometry {
  const positions: number[] = [], indices: number[] = [], steps = 8
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, halfWidth = .6 * Math.pow(Math.sin(t * Math.PI), .65)
    const y = .28 * Math.sin(t * Math.PI) - .72 * t * t
    positions.push(-halfWidth, y, t * 4.6, 0, y + .08 * Math.sin(t * Math.PI), t * 4.6, halfWidth, y, t * 4.6)
  }
  for (let i = 0; i < steps; i++) {
    const a = i * 3, b = a + 3
    if (i > 0) indices.push(a, b, a + 1, a + 1, b + 1, a + 2)
    if (i < steps - 1) indices.push(a + 1, b, b + 1, a + 2, b + 1, b + 2)
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3)); geometry.setIndex(indices)
  geometry.computeVertexNormals(); geometry.computeBoundingSphere(); return geometry
}
