import { BufferGeometry, Float32BufferAttribute } from 'three'

// Five curved, tapered blades in one shared tuft: 25 triangles, no alpha cards.
export function createMeadowTuft(): BufferGeometry {
  const positions: number[] = [], indices: number[] = []
  for (let blade = 0; blade < 5; blade++) {
    const angle = blade * Math.PI * 2 / 5, start = positions.length / 3
    for (let row = 0; row < 3; row++) for (const side of [-1, 1]) {
      const y = row / 3, bend = .08 + y * y * .65, width = .065 * (1 - y * .75)
      positions.push(Math.sin(angle) * bend + Math.cos(angle) * width * side, y, Math.cos(angle) * bend - Math.sin(angle) * width * side)
    }
    positions.push(Math.sin(angle) * .73, 1, Math.cos(angle) * .73)
    for (let row = 0; row < 2; row++) { const a = start + row * 2; indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2) }
    indices.push(start + 4, start + 5, start + 6)
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3)); geometry.setIndex(indices)
  geometry.computeVertexNormals(); geometry.computeBoundingSphere()
  return geometry
}
