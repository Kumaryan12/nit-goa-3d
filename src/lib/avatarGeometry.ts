import { BoxGeometry, CapsuleGeometry, CatmullRomCurve3, Color, Euler, Float32BufferAttribute, Matrix4, Quaternion, Shape, ShapeGeometry, SphereGeometry, TubeGeometry, Vector3 } from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import type { BufferGeometry } from 'three'
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js'

export type AvatarTriple = [number, number, number]
export interface AvatarPart { shape: 'box' | 'sphere' | 'head' | 'face' | 'capsule' | 'rounded' | 'scalp' | 'strand'; sweep?: number; curve?: AvatarTriple[]; color?: string; size: AvatarTriple; at: AvatarTriple; scale?: AvatarTriple; rotation?: AvatarTriple }

// One vertex-coloured mesh per rigid joint, rather than a draw call for every
// cuff, lace, hair lock and facial feature. Callers own the merged geometry.
export function createAvatarGeometry(parts: AvatarPart[]) {
  const pieces = parts.map(part => {
    let geometry: BufferGeometry = part.shape === 'face' ? faceGeometry(part.curve!, part.size[0]) : part.shape === 'strand' ? new TubeGeometry(new CatmullRomCurve3(part.curve!.map(point => new Vector3(...point))), 10, part.size[0], 4, false) : part.shape === 'head' ? headGeometry(part.size[0]) : part.shape === 'scalp' ? scalpGeometry(part.size, part.sweep) : part.shape === 'capsule' ? new CapsuleGeometry(part.size[0], part.size[1], 4, 10)
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

// One continuous skull, cheek and jaw surface. The lower rear narrows into the
// neck while the chin stays forward, rather than looking like a face on a ball.
function headGeometry(radius: number) {
  const geometry = new SphereGeometry(radius, 20, 14), positions = geometry.getAttribute('position')
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i)
    const jaw = Math.max(0, -y / radius), taper = 1 - .10 * jaw
    const front = Math.max(0, -z / radius)
    positions.setXYZ(i, x * taper, y, z * (1 - .10 * jaw) - .012 * jaw * (1 - jaw) + .012 * front ** 4)
  }
  geometry.computeVertexNormals()
  return geometry
}

// Place facial features on the oval head used by the selection portrait.
// Keeping this projection shared avoids floating eyes or a smile buried in skin.
export function avatarFacePoint(x: number, y: number, offset = 0): AvatarTriple {
  const radius = .215, rawY = y - .84
  const jaw = Math.max(0, -rawY / radius), rawX = x / (.90 * (1 - .10 * jaw))
  const rawZ = -Math.sqrt(Math.max(0, radius * radius - rawX * rawX - rawY * rawY)), front = -rawZ / radius
  return [x, y, -.01 + .85 * (rawZ * (1 - .10 * jaw) - .012 * jaw * (1 - jaw) + .012 * front ** 4) - offset]
}

// The SVG portrait is the design reference: preserve its spacing in 3D.
// Front view reverses model X because the avatar faces -Z.
export function avatarPortraitPoint(x: number, y: number, offset = 0): AvatarTriple {
  return avatarFacePoint((110 - x) * .0048, .84 + (83 - y) * .0048, offset)
}

// Painted almond eyes / irises follow the cheek surface, rather than looking
// like separate balls stuck onto a skull. These patches join the blink mesh.
function faceGeometry(outline: AvatarTriple[], offset: number) {
  const shape = new Shape()
  shape.moveTo(outline[0][0], outline[0][1])
  outline.slice(1).forEach(point => shape.lineTo(point[0], point[1]))
  shape.closePath()
  const source = new ShapeGeometry(shape)
  // ShapeGeometry faces +Z; the front of an avatar is -Z.
  const index = source.index!
  for (let i = 0; i < index.count; i += 3) { const a = index.getX(i); index.setX(i, index.getX(i + 2)); index.setX(i + 2, a) }
  const geometry = source.toNonIndexed(); source.dispose()
  const original = geometry.getAttribute('position'), points: number[] = [], normals: number[] = []
  const midpoint = (a: AvatarTriple, b: AvatarTriple): AvatarTriple => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, 0]
  const emit = (point: AvatarTriple) => {
    const [x, y] = point, z = avatarFacePoint(x, y, offset)[2], step = .0001
    points.push(x, y, z)
    const normal = new Vector3((avatarFacePoint(x + step, y)[2] - avatarFacePoint(x - step, y)[2]) / (2 * step), (avatarFacePoint(x, y + step)[2] - avatarFacePoint(x, y - step)[2]) / (2 * step), -1).normalize()
    normals.push(normal.x, normal.y, normal.z)
  }
  for (let i = 0; i < original.count; i += 3) {
    const triangle = [0, 1, 2].map(j => [original.getX(i + j), original.getY(i + j), 0] as AvatarTriple)
    const [a, b, c] = triangle, ab = midpoint(a, b), bc = midpoint(b, c), ca = midpoint(c, a)
    ;[a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca].forEach(emit)
  }
  geometry.setAttribute('position', new Float32BufferAttribute(points, 3))
  geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3))
  geometry.setAttribute('uv', new Float32BufferAttribute(new Float32Array(points.length / 3 * 2), 2))
  return geometry
}

// Hair wraps down to the nape at the rear while leaving the forehead and eyes
// open at the front. A complete sphere cap otherwise leaves a bald-looking back.
function scalpGeometry([radius, frontAngle, backAngle]: AvatarTriple, sweep = 0) {
  const width = 20, height = 10, geometry = new SphereGeometry(radius, width, height, 0, Math.PI * 2, 0, backAngle)
  // Construct an open cap: a full sphere omits alternating bottom-row
  // triangles for its south pole, which would leave gaps along this hairline.
  const positions = geometry.getAttribute('position')
  for (let row = 0; row <= height; row++) for (let column = 0; column <= width; column++) {
    const theta = column / width * Math.PI * 2
    // Keep the temples above the ears, then curve down behind them to the
    // nape. A single forehead-to-nape slope cuts diagonally across the cheeks.
    const cosine = Math.cos(theta), rear = Math.max(0, -cosine), temple = 1.78
    const edge = frontAngle + (temple - frontAngle) * (1 - Math.max(0, cosine)) + (backAngle - temple) * rear * rear * (3 - 2 * rear) + sweep * .16 * Math.sin(theta + .35) * Math.max(0, cosine)
    const phi = row / height * edge, i = row * (width + 1) + column
    positions.setXYZ(i, ...avatarScalpPoint(radius, phi, theta, sweep))
  }
  // Roll the exposed hairline inward into the skull. A paper-thin open shell
  // leaves a visible air gap under the swept fringe when viewed from the side.
  const uv = geometry.getAttribute('uv'), expandedPositions = [...positions.array], expandedUv = [...uv.array], indices = [...geometry.index!.array]
  const innerStart = positions.count, edgeStart = height * (width + 1)
  for (let column = 0; column <= width; column++) {
    const edge = edgeStart + column
    expandedPositions.push(positions.getX(edge) * .88, positions.getY(edge) * .86, positions.getZ(edge) * .78)
    expandedUv.push(uv.getX(edge), uv.getY(edge))
    if (column < width) indices.push(edge, innerStart + column, edge + 1, innerStart + column, innerStart + column + 1, edge + 1)
  }
  geometry.setAttribute('position', new Float32BufferAttribute(expandedPositions, 3))
  geometry.setAttribute('uv', new Float32BufferAttribute(expandedUv, 2))
  geometry.deleteAttribute('normal')
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

// A continuous quiff lifts the crown and forehead without separate round blobs.
// Shared sampling also keeps the fine hair strands on the scalp surface.
export function avatarScalpPoint(radius: number, phi: number, theta: number, sweep = 0): AvatarTriple {
  const top = Math.max(0, Math.cos(phi)), front = Math.max(0, Math.cos(theta))
  const lift = sweep * (.016 * top * top + .095 * Math.sin(phi) * top * front * (.6 + .4 * Math.sin(theta)))
  return [-radius * Math.sin(phi) * Math.sin(theta), radius * Math.cos(phi) + lift, -radius * Math.sin(phi) * Math.cos(theta)]
}
