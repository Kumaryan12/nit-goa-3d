import assert from 'node:assert/strict'
import { test } from 'node:test'
import { advanceLocomotion, freshLocomotion } from '../src/lib/avatarMotion.ts'
import { cameraWheelStep, smoothLookAngle, walkSpeed } from '../src/lib/walkControls.ts'

test('campus and indoor pacing stay controlled across frame rates, with running opt-in', () => {
  for (const indoors of [false, true]) {
    const walk = walkSpeed(false, indoors), run = walkSpeed(true, indoors)
    assert.ok(walk <= (indoors ? 1.15 : 2.5) && run <= (indoors ? 1.9 : 5) && run > walk)
    const distances = [30, 60, 144].map(fps => {
      const state = freshLocomotion(); let distance = 0
      for (let i = 0; i < fps * 2; i++) {
        const frame = advanceLocomotion(state, { x: 1, z: 1 }, walk, 1 / fps)
        distance += frame.speed * frame.delta
        assert.ok(frame.speed <= walk)
      }
      return distance
    })
    assert.ok(distances[0] < walk * 2)
    for (const distance of distances) assert.ok(Math.abs(distance - distances[0]) < 1e-8)
  }
  assert.ok(walkSpeed(false, true) < walkSpeed(false, false))
})

test('short walking taps allow fine positioning and key release brakes within ten centimetres', () => {
  const state = freshLocomotion(), speed = walkSpeed(false, false)
  const tap = advanceLocomotion(state, { x: 1, z: 0 }, speed, .1)
  assert.ok(tap.speed * tap.delta < .05, '100 ms tap travels less than 5 cm')
  let releasedDistance = 0
  for (let i = 0; i < 60; i++) {
    const frame = advanceLocomotion(state, { x: 0, z: 0 }, speed, 1 / 60)
    releasedDistance += frame.speed * frame.delta
  }
  assert.ok(releasedDistance < .1); assert.deepEqual(state.velocity, { x: 0, z: 0 })
  for (let i = 0; i < 60; i++) advanceLocomotion(state, { x: 1, z: 0 }, speed, 1 / 60)
  releasedDistance = 0
  for (let i = 0; i < 60; i++) {
    const frame = advanceLocomotion(state, { x: 0, z: 0 }, speed, 1 / 60)
    releasedDistance += frame.speed * frame.delta
  }
  assert.ok(releasedDistance < .1, 'full walking speed also stops precisely')
})

test('hostel pacing is brisker, stays frame-rate independent and stops within doorway clearance', () => {
  for (const running of [false, true]) {
    const cap = walkSpeed(running, true, 'boys-hostel')
    assert.ok(cap > walkSpeed(running, true, 'gyan-mandir'))
    assert.ok(cap <= walkSpeed(running, false))
    assert.equal(walkSpeed(running, true, 'gyan-mandir'), walkSpeed(running, true))
    assert.equal(walkSpeed(running, false, 'boys-hostel'), walkSpeed(running, false))
    const results = [30, 60, 144].map(fps => {
      const state = freshLocomotion(); let distance = 0, stoppingDistance = 0
      const tap = advanceLocomotion(state, { x: 1, z: 0 }, cap, .1)
      assert.ok(tap.speed * tap.delta < .05, 'brief taps still allow fine positioning')
      state.velocity = { x: 0, z: 0 }
      for (let i = 0; i < fps * 5; i++) {
        const frame = advanceLocomotion(state, { x: 1, z: 1 }, cap, 1 / fps)
        distance += frame.speed * frame.delta
        assert.ok(frame.speed <= cap + 1e-8, 'diagonals cannot exceed the cap')
      }
      assert.ok(Math.abs(Math.hypot(state.velocity.x, state.velocity.z) - cap) < 1e-8)
      for (let i = 0; i < fps; i++) {
        const frame = advanceLocomotion(state, { x: 0, z: 0 }, cap, 1 / fps)
        stoppingDistance += frame.speed * frame.delta
      }
      assert.deepEqual(state.velocity, { x: 0, z: 0 })
      assert.ok(stoppingDistance < .13, 'release stops within thirteen centimetres even when running')
      return distance
    })
    for (const distance of results) assert.ok(Math.abs(distance - results[0]) < 1e-8)
  }
})

test('walking and running continue gaining speed until their caps, then stay capped', () => {
  for (const running of [false, true]) for (const fps of [30, 60, 144]) {
    const state = freshLocomotion(), cap = walkSpeed(running, false)
    let previous = 0, atOneSecond = 0, atTwoSeconds = 0
    for (let i = 0; i < fps * 8; i++) {
      advanceLocomotion(state, { x: 0, z: -1 }, cap, 1 / fps)
      const speed = Math.hypot(state.velocity.x, state.velocity.z)
      assert.ok(speed >= previous - 1e-8 && speed <= cap + 1e-8)
      if (i === fps - 1) atOneSecond = speed
      if (i === fps * 2 - 1) atTwoSeconds = speed
      previous = speed
    }
    assert.ok(atOneSecond < atTwoSeconds && atTwoSeconds < cap)
    assert.ok(Math.abs(previous - cap) < 1e-8)
  }
})

test('large camera drags settle without a snap, overshoot or frame-rate-dependent rotation', () => {
  const results = [30, 60, 144].map(fps => {
    let yaw = 0
    for (let i = 0; i < fps; i++) {
      const next = smoothLookAngle(yaw, 2, 1 / fps)
      assert.ok(next >= yaw && next <= 2)
      assert.ok(next - yaw <= 2 / fps + 1e-8, 'at most two radians per second')
      yaw = next
    }
    return yaw
  })
  for (const result of results) assert.ok(Math.abs(result - results[0]) < 1e-8)
  const wrap = smoothLookAngle(Math.PI - .05, -Math.PI + .05, .1)
  assert.ok(wrap > Math.PI - .05 && wrap < Math.PI + .05, 'takes the short path across the angle boundary')
  assert.equal(smoothLookAngle(1, 2, NaN), 1)
  assert.equal(smoothLookAngle(1, Infinity, .1), 1)
  assert.equal(smoothLookAngle(1, 2, 0), 1)
})

test('wheel input supports trackpads, line-based wheels and bounded large scroll events', () => {
  assert.equal(cameraWheelStep(16), cameraWheelStep(1, 1))
  assert.ok(cameraWheelStep(2) > 0 && cameraWheelStep(2) < .01)
  assert.equal(cameraWheelStep(100000), .36)
  assert.equal(cameraWheelStep(-100000), -.36)
  assert.equal(cameraWheelStep(1, 2), .36)
  assert.equal(cameraWheelStep(NaN), 0)
})
