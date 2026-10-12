import { BoxGeometry, BufferGeometry, Color, CylinderGeometry, Float32BufferAttribute, Matrix4, SphereGeometry, Vector3 } from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { cafePoint } from './cafe.ts'
import type { CafeLayout } from './cafe.ts'
import { terrainHeightAt } from './terrain.ts'
import type { TerrainModel } from './terrain.ts'

// Bake repeated details into three draw calls. There are no per-chair React
// objects, shadow lights, external textures or frame-time geometry updates.
export function createCafeGeometry(cafe: CafeLayout, terrain: TerrainModel) {
  const solid: BufferGeometry[] = [], glow: BufferGeometry[] = [], glass: BufferGeometry[] = []
  const add = (geometry: BufferGeometry, at: number[], color: string, yaw = 0, list = solid) => {
    geometry.rotateY(yaw).translate(at[0], at[1], at[2])
    const tint = new Color(color), colors = new Float32Array(geometry.getAttribute('position').count * 3)
    for (let i = 0; i < colors.length; i += 3) colors.set([tint.r, tint.g, tint.b], i)
    geometry.setAttribute('color', new Float32BufferAttribute(colors, 3)); list.push(geometry)
  }
  const box = (at: number[], size: number[], color: string, yaw = 0, list = solid) => add(new BoxGeometry(size[0], size[1], size[2]), at, color, yaw, list)
  const cylinder = (at: number[], top: number, bottom: number, height: number, color: string, list = solid) => add(new CylinderGeometry(top, bottom, height, 12), at, color, 0, list)
  const along = (x: number, y: number, z: number, size: number[], color: string, list = solid) => {
    const p = cafePoint(cafe, x, z); box([p.x, cafe.base + y, p.z], size, color, cafe.terrace.angle, list)
  }
  const charcoal = '#253c37', wood = '#b98350', cream = '#f3e7cc', red = '#a93a34', green = '#34624e'
  along(0, 2.85, .12, [cafe.width - .8, .72, .22], charcoal)
  // Walk-up vending windows have waist-height counters, never ground-height
  // door panes or handles. Seating stays on the original shaded side.
  along(0, 1.45, .10, [2.8, 1.7, .16], charcoal)
  along(0, 1.48, .20, [2.45, 1.35, .025], '#567a78', glass)
  along(0, 1.5, .23, [.055, 1.3, .055], cream)
  along(0, .85, .26, [2.8, .13, .5], wood)
  along(4.3, 1.45, .10, [3.4, 1.7, .16], charcoal)
  along(4.3, 1.48, .20, [3.05, 1.35, .025], '#567a78', glass)
  along(4.3, .85, .26, [3.3, .13, .5], wood)
  along(4.3, 1.5, .23, [.06, 1.3, .055], cream)
  for (const table of cafe.tables) {
    cylinder([table.x, table.y + .75, table.z], .65, .65, .07, wood)
    cylinder([table.x, table.y + .36, table.z], .07, .09, .72, charcoal)
    cylinder([table.x, table.y + .04, table.z], .34, .39, .08, charcoal)
    for (const [i, dx] of [-.23, .23].entries()) {
      const dz = i ? -.14 : .14, c = Math.cos(table.yaw), s = Math.sin(table.yaw)
      const x = table.x + c * dx + s * dz, z = table.z - s * dx + c * dz
      cylinder([x, table.y + .80, z], .115, .115, .018, cream)
      cylinder([x, table.y + .865, z], .069, .054, .13, i ? cream : red)
      cylinder([x, table.y + .933, z], .055, .055, .006, '#482c22')
    }
    cylinder([table.x, table.y + .825, table.z], .065, .05, .08, cream)
    add(new SphereGeometry(.085, 6, 4).scale(1, 1.4, 1), [table.x, table.y + .92, table.z], green)
  }
  for (const seat of cafe.seats) {
    const c = Math.cos(seat.yaw), s = Math.sin(seat.yaw)
    const part = (x: number, y: number, z: number, size: number[], color: string) => box([seat.x + c * x + s * z, seat.y + y, seat.z - s * x + c * z], size, color, seat.yaw)
    part(0, .42, 0, [.49, .06, .48], cream)
    for (const x of [-.19, .19]) for (const z of [-.18, .18]) part(x, .20, z, [.035, .40, .035], charcoal)
    for (const x of [-.22, .22]) part(x, .68, .20, [.045, .60, .045], charcoal)
    for (const y of [.65, .76, .87]) part(0, y, .22, [.46, .075, .045], green)
  }
  const canopyY = Math.max(...cafe.posts.map(p => p.y), cafe.base) + 3.05
  for (const post of cafe.posts) {
    box([post.x, (post.y + canopyY) / 2, post.z], [.16, canopyY - post.y, .16], charcoal, cafe.terrace.angle)
    cylinder([post.x, post.y + .055, post.z], .19, .19, .11, charcoal)
  }
  const roof = canopyY - cafe.base
  for (const side of [-1, 1]) along(side * (cafe.width / 2 - .25), roof, cafe.depth / 2 + .3, [.16, .22, cafe.depth - .25], wood)
  for (const out of [1, cafe.depth - .4]) along(0, roof, out, [cafe.width, .22, .16], wood)
  for (let out = 1; out <= cafe.depth - .4; out += .45) along(0, roof + .10, out, [cafe.width, .10, .085], wood)
  // Wide, spaced canvas ribbons shade the tables while the slats remain visible.
  for (const x of [-cafe.width * .25, cafe.width * .25]) along(x, roof + .18, cafe.depth / 2 + .3, [3.05, .025, cafe.depth - 1], cream)
  for (const planter of cafe.planters) {
    cylinder([planter.x, planter.y + .27, planter.z], .44, .34, .54, '#b57155')
    cylinder([planter.x, planter.y + .55, planter.z], .43, .43, .03, '#65513b')
    for (let i = 0; i < 5; i++) {
      const a = i * Math.PI * 2 / 5 - planter.yaw
      add(new SphereGeometry(.25, 6, 4).scale(1, 1.6, 1), [planter.x + Math.cos(a) * .19, planter.y + .77, planter.z + Math.sin(a) * .19], i % 2 ? '#497854' : '#75925a')
    }
  }
  // Suspended festoon wires and bulbs: visual glow, no additional shadow maps.
  const from = new Vector3(), to = new Vector3(), up = new Vector3(0, 1, 0)
  for (const out of [2, 8.7]) {
    for (let i = 0; i < 16; i++) {
      const x = (i / 16 - .5) * (cafe.width - .5), nextX = ((i + 1) / 16 - .5) * (cafe.width - .5)
      const p = cafePoint(cafe, x, out), q = cafePoint(cafe, nextX, out)
      const y = canopyY - .15 - Math.sin(i / 16 * Math.PI) * .40, nextY = canopyY - .15 - Math.sin((i + 1) / 16 * Math.PI) * .40
      from.set(p.x, y, p.z); to.set(q.x, nextY, q.z)
      // Cylinder's long axis is Y; align it with the two suspension points.
      const segment = new CylinderGeometry(.012, .012, from.distanceTo(to), 4)
      const direction = to.clone().sub(from).normalize()
      const axis = up.clone().cross(direction).normalize(), angle = Math.acos(up.dot(direction))
      segment.applyMatrix4(new Matrix4().makeRotationAxis(axis, angle))
      add(segment, from.clone().add(to).multiplyScalar(.5).toArray(), charcoal)
      if (i % 2 === 0) {
        cylinder([p.x, y - .06, p.z], .025, .025, .12, charcoal)
        add(new SphereGeometry(.065, 8, 6), [p.x, y - .16, p.z], '#ffdf97', 0, glow)
      }
    }
  }
  // A second vending counter serves the long blank wall shown by the owner.
  const front = cafe.front, w = Math.min(12.5, front.length - 1.1)
  const facade = (x: number, y: number, out: number, size: number[], color: string, list = solid) => {
    const c = Math.cos(front.angle), s = Math.sin(front.angle)
    box([front.center.x + c * x + s * out, cafe.base + y, front.center.z - s * x + c * out], size, color, front.angle, list)
  }
  facade(0, 3.05, .15, [w, .85, .28], red)
  facade(0, 2.55, .38, [w + .2, .10, .8], charcoal)
  for (const x of [-w * .32, 0, w * .32]) {
    facade(x, 1.48, .11, [3.3, 1.65, .12], charcoal)
    facade(x, 1.48, .19, [3.05, 1.38, .025], '#567a78', glass)
    facade(x, 1.48, .23, [.05, 1.38, .045], cream)
  }
  facade(0, .85, .32, [w, .13, .6], wood)
  const merge = (pieces: BufferGeometry[]) => { const value = mergeGeometries(pieces)!; pieces.forEach(p => p.dispose()); value.computeBoundingSphere(); return value }
  const pavement = new BufferGeometry(), positions: number[] = [], indices: number[] = []
  const nx = 16, nz = 12
  for (let z = 0; z <= nz; z++) for (let x = 0; x <= nx; x++) {
    const p = cafePoint(cafe, (x / nx - .5) * cafe.width, .1 + z / nz * cafe.depth)
    positions.push(p.x, terrainHeightAt(terrain, p.x, p.z) + .021, p.z)
  }
  for (let z = 0; z < nz; z++) for (let x = 0; x < nx; x++) { const a = z * (nx + 1) + x; indices.push(a, a + nx + 1, a + 1, a + 1, a + nx + 1, a + nx + 2) }
  pavement.setAttribute('position', new Float32BufferAttribute(positions, 3)); pavement.setIndex(indices); pavement.computeVertexNormals(); pavement.computeBoundingSphere()
  return { solid: merge(solid), glow: merge(glow), glass: merge(glass), pavement }
}
