import { BoxGeometry, CapsuleGeometry, Color, Euler, Float32BufferAttribute, Matrix4, Quaternion, SphereGeometry, Vector3 } from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import type { BufferGeometry } from 'three'
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js'

export type AvatarTriple = [number, number, number]
export interface AvatarPart { shape: 'box' | 'sphere' | 'capsule' | 'rounded'; color?: string; size: AvatarTriple; at: AvatarTriple; scale?: AvatarTriple; rotation?: AvatarTriple }

// One vertex-coloured mesh per rigid joint, rather than a draw call for every
// cuff, lace, hair lock and facial feature. Callers own the merged geometry.
export function createAvatarGeometry(parts: AvatarPart[]) {
  const pieces = parts.map(part => {
    let geometry: BufferGeometry = part.shape === 'capsule' ? new CapsuleGeometry(part.size[0], part.size[1], 4, 10)
      : part.shape === 'sphere' ? new SphereGeometry(part.size[0], 12, 8)
      : part.shape === 'rounded' ? new RoundedBoxGeometry(...part.size, 2, Math.min(...part.size) * .2) : new BoxGeometry(...part.size)
    // Rounded boxes are non-indexed; normalize topology before merging them
    // with indexed spheres/capsules, otherwise Three returns a null geometry.
    if (geometry.index) { const indexed = geometry; geometry = indexed.toNonIndexed(); indexed.dispose() }
    geometry.applyMatrix4(new Matrix4().compose(new Vector3(...part.at), new Quaternion().setFromEuler(new Euler(...(part.rotation ?? [0, 0, 0]))), new Vector3(...(part.scale ?? [1, 1, 1]))))
    const shade = new Color(part.color ?? '#ffffff'), colors = new Float32Array(geometry.getAttribute('position').count * 3)
    for (let i = 0; i < colors.length; i += 3) { colors[i] = shade.r; colors[i + 1] = shade.g; colors[i + 2] = shade.b }
    geometry.setAttribute('color', new Float32BufferAttribute(colors, 3))
    return geometry
  })
  const combined = mergeGeometries(pieces)
  pieces.forEach(piece => piece.dispose())
  if (!combined) throw new Error('Avatar details could not be merged')
  const indexed = mergeVertices(combined)
  combined.dispose()
  indexed.computeBoundingSphere()
  return indexed
}
