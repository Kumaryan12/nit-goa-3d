import { BufferGeometry, Color, CylinderGeometry, Float32BufferAttribute, TorusGeometry } from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { CafeDrinkKind } from './cafeDrinks.ts'

// One small coloured mesh per held drink, with no textures or transparency.
export function createCafeDrinkGeometry(kind: CafeDrinkKind): BufferGeometry {
  const parts: BufferGeometry[] = []
  const add = (geometry: BufferGeometry, y: number, color: string) => {
    geometry.translate(0, y, -.035)
    const tint = new Color(color), colors = new Float32Array(geometry.getAttribute('position').count * 3)
    for (let i = 0; i < colors.length; i += 3) colors.set([tint.r, tint.g, tint.b], i)
    geometry.setAttribute('color', new Float32BufferAttribute(colors, 3)); parts.push(geometry)
  }
  if (kind === 'water') {
    add(new CylinderGeometry(.046, .046, .20, 10), .10, '#82b9c2')
    add(new CylinderGeometry(.046, .046, .06, 10), .10, '#f1eddb')
    add(new CylinderGeometry(.028, .04, .035, 10), .216, '#82b9c2')
    add(new CylinderGeometry(.029, .029, .024, 10), .24, '#335f79')
  } else {
    add(new CylinderGeometry(.066, .051, .16, 12), .08, kind === 'coffee' ? '#b34738' : '#e6c89f')
    add(new CylinderGeometry(.052, .052, .005, 12), .163, kind === 'coffee' ? '#4b2d21' : '#806044')
    add(new CylinderGeometry(.068, .068, .016, 12), .158, '#f4ead6')
    if (kind === 'coffee') add(new TorusGeometry(.036, .011, 5, 10).rotateY(Math.PI / 2).translate(.065, 0, 0), .08, '#b34738')
    else add(new CylinderGeometry(.006, .006, .14, 6).translate(.025, 0, 0), .22, '#497e6b')
  }
  const result = mergeGeometries(parts)!
  parts.forEach(part => part.dispose()); result.computeBoundingSphere(); return result
}
