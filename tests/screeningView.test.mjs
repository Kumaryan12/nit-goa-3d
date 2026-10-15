import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { extractBuildingFootprints } from '../src/lib/buildings.ts'
import { createSeminarPlan, SEMINAR_ID } from '../src/lib/seminarInterior.ts'
import { createScreeningLayout, screeningView, SCREENING_SCREEN } from '../src/lib/screening.ts'

const campus = JSON.parse(readFileSync(new URL('./fixtures/nit-goa-campus.json', import.meta.url)))
const plan = createSeminarPlan(extractBuildingFootprints(campus.elements).find(b => b.id === SEMINAR_ID), () => true)
const hall = plan.seminar.halls[0], seats = createScreeningLayout(plan).seats

test('screening assignments fill 32 physical front-centre chairs before any rear seats', () => {
  assert.equal(seats.length, 32)
  const frontX = Math.max(...hall.seats.map(p => p.x))
  assert.equal(seats[0].x, frontX)
  assert.ok(Math.abs(seats[0].z - hall.stage.z) < 1.36)
  assert.equal(new Set(seats.map(p => `${p.x},${p.z}`)).size, 32)
  for (const p of seats) {
    assert.ok(p.x >= frontX - 3)
    assert.ok(Math.abs(p.z - hall.stage.z) <= 4)
    assert.ok(hall.seats.some(chair => chair.x === p.x && chair.z === p.z))
    const forward = { x: -Math.sin(p.yaw), z: -Math.cos(p.yaw) }
    const dx = hall.maxX - SCREENING_SCREEN.wallInset - p.x, dz = hall.stage.z - p.z
    assert.ok((forward.x * dx + forward.z * dz) / Math.hypot(dx, dz) > .9999)
  }
  const published = JSON.parse(readFileSync(new URL('../public/map/nit-goa-screening-layout.json', import.meta.url)))
  assert.deepEqual(published.seats.map(({ x, z, yaw }) => ({ x, z, yaw })), seats.map(({ x, z, yaw }) => ({ x, z, yaw })))
})

test('every assigned chair frames the whole screen straight ahead on wide and portrait displays', () => {
  for (const aspect of [21/9, 16/9, 4/3, 390/844, 844/390, 320/900]) for (const seat of seats) {
    const view = screeningView(plan, seat, aspect)
    assert.ok(view && Number.isFinite(view.fov) && view.fov >= 12 && view.fov <= 100)
    const eye = view.position, target = view.target
    assert.ok(eye.x > seat.x && eye.x < hall.stage.x - hall.stage.width / 2)
    assert.equal(eye.y, target.y)
    assert.equal(eye.z, target.z)
    assert.ok(Math.abs(SCREENING_SCREEN.width / SCREENING_SCREEN.height - 16 / 9) < 1e-10)
    assert.equal(target.x, hall.maxX - SCREENING_SCREEN.wallInset)
    assert.equal(target.z, hall.stage.z)
    const dx=target.x-eye.x,dy=target.y-eye.y,dz=target.z-eye.z,d=Math.hypot(dx,dy,dz),h=Math.hypot(dx,dz)
    const f={x:dx/d,y:dy/d,z:dz/d},r={x:-dz/h,z:dx/h},u={x:-f.y*r.z,y:f.x*r.z-f.z*r.x,z:f.y*r.x}
    const tangent=Math.tan(view.fov*Math.PI/360)
    for(const y of [-1,1])for(const z of [-1,1]){
      const v={x:dx,y:dy+y*SCREENING_SCREEN.height/2,z:dz+z*SCREENING_SCREEN.width/2}
      const depth=v.x*f.x+v.y*f.y+v.z*f.z
      assert.ok(depth>0)
      assert.ok(Math.abs((v.x*r.x+v.z*r.z)/depth/tangent/aspect)<.83,`horizontal clipping at aspect ${aspect}`)
      assert.ok(Math.abs((v.x*u.x+v.y*u.y+v.z*u.z)/depth/tangent)<.83,`vertical clipping at aspect ${aspect}`)
    }
  }
  assert.equal(screeningView(null,seats[0]),null)
  assert.equal(screeningView(plan,null),null)
})
