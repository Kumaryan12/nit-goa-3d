import { test } from 'node:test'
import assert from 'node:assert/strict'
import { advanceLocomotion, avatarPose, freshLocomotion, joystickInput, motionDelta, reconcileLocomotion, stridePhase } from '../src/lib/avatarMotion.ts'
import { createWalkWorld, isWalkable, stepWalking } from '../src/lib/walking.ts'
import { localToGps } from '../src/lib/geo.ts'

test('acceleration and travel are independent of rendering at 30, 60 or 144 Hz', () => {
  const results = [30, 60, 144].map(fps => {
    const state = freshLocomotion(); let distance = 0
    for (let i = 0; i < fps * 2; i++) { const frame = advanceLocomotion(state, { x: 0, z: -1 }, 5.5, 1 / fps); distance += frame.speed * frame.delta }
    return { distance, speed: Math.hypot(state.velocity.x, state.velocity.z) }
  })
  for (const result of results) { assert.ok(Math.abs(result.distance - results[0].distance) < 1e-8); assert.ok(result.speed <= 5.5); assert.ok(result.distance > 10 && result.distance < 11) }
})

test('analog magnitude is preserved while diagonals and repeated inputs cannot exceed running speed', () => {
  for (const input of [{ x: 1, z: 0 }, { x: 1, z: 1 }, { x: 2, z: 2 }]) {
    const frame = advanceLocomotion(freshLocomotion(), input, 5.5, .1)
    assert.ok(frame.speed <= 5.5)
  }
  const slow = freshLocomotion(), full = freshLocomotion()
  for (let i = 0; i < 60; i++) { advanceLocomotion(slow, { x: .25, z: 0 }, 2.3, 1 / 60); advanceLocomotion(full, { x: 1, z: 0 }, 2.3, 1 / 60) }
  assert.ok(Math.abs(slow.velocity.x / full.velocity.x - .25) < 1e-8)
})

test('release brakes promptly, reversals pass smoothly through rest, and pausing stops immediately', () => {
  const state = freshLocomotion()
  for (let i = 0; i < 60; i++) advanceLocomotion(state, { x: 1, z: 0 }, 5.5, 1 / 60)
  const reverse = advanceLocomotion(state, { x: -1, z: 0 }, 5.5, 1 / 60)
  assert.ok(reverse.direction.x > 0 && reverse.direction.x < 5.5)
  let brakingDistance = 0
  for (let i = 0; i < 60; i++) { const frame = advanceLocomotion(state, { x: 0, z: 0 }, 5.5, 1 / 60); brakingDistance += frame.speed / 60 }
  assert.ok(brakingDistance < .31); assert.deepEqual(state.velocity, { x: 0, z: 0 })
  advanceLocomotion(state, { x: 1, z: 0 }, 5.5, .1)
  const paused = advanceLocomotion(state, { x: 1, z: 1 }, 5.5, .1, false)
  assert.equal(paused.speed, 0); assert.deepEqual(state.velocity, { x: 0, z: 0 })
})

test('smooth momentum cannot tunnel through walls and blocked axes do not retain momentum', () => {
  const outer = [{ x: 0, z: -10 }, { x: .05, z: -10 }, { x: .05, z: 10 }, { x: 0, z: 10 }, { x: 0, z: -10 }].map(localToGps)
  const terrain = { size: 400, segments: 40, heights: new Float32Array(41 ** 2), colors: new Float32Array(41 ** 2 * 3) }
  const world = createWalkWorld([{ id: 'thin-wall', outer, holes: [], height: 10 }], [], terrain)
  const state = freshLocomotion(); let point = { x: -.7, z: 0 }
  for (let i = 0; i < 60; i++) {
    const frame = advanceLocomotion(state, { x: 1, z: 0 }, 5.5, 1 / 60), next = stepWalking(point, frame.direction, frame.speed, frame.delta, world)
    reconcileLocomotion(state, point, next, frame); point = next
    assert.ok(isWalkable(point, world)); assert.ok(point.x < -.42)
  }
  assert.equal(state.velocity.x, 0)
})

test('gait follows travelled distance, keeps the supporting shoe grounded, and changes the running posture', () => {
  assert.equal(stridePhase(1, 0, false), 1)
  let phase = 0
  for (let i = 0; i < 165; i++) phase = stridePhase(phase, .01, false)
  assert.ok(phase < 1e-8 || Math.abs(phase - Math.PI * 2) < 1e-8)
  for (const running of [false, true]) for (let i = 0; i < 64; i++) {
    const pose = avatarPose(i / 64 * Math.PI * 2, running ? 5.5 : 2.3, running, 0)
    const soles = pose.hips.map((hip, j) => pose.rootY + .88 - .37 * Math.cos(hip) - .37 * Math.cos(hip + pose.knees[j]) - .129)
    assert.ok(Math.abs(Math.min(...soles) - .011) < 1e-8)
    assert.ok(pose.hips.every((hip, j) => Math.abs(hip + pose.knees[j] + pose.ankles[j]) < 1e-8))
    assert.ok(pose.knees.every(knee => knee <= 0))
  }
  assert.ok(avatarPose(1, 5.5, true, 0).lean < avatarPose(1, 2.3, false, 0).lean)
  assert.ok(avatarPose(0, 0, false, 0, 0, .5).hips[1] > 1)
})

test('touch stick has a dead zone, bounded travel, analog response, and neutral invalid input', () => {
  assert.equal(joystickInput(2, 0, 40).side, 0)
  assert.equal(joystickInput(0, -40, 40).forward, 1)
  const diagonal = joystickInput(100, -100, 40)
  assert.ok(Math.abs(Math.hypot(diagonal.forward, diagonal.side) - 1) < 1e-8)
  assert.ok(Math.hypot(diagonal.x, diagonal.y) <= 40 + 1e-8)
  assert.ok(joystickInput(20, 0, 40).side > .3 && joystickInput(20, 0, 40).side < .5)
  assert.deepEqual(joystickInput(NaN, 0, 40), { forward: 0, side: 0, x: 0, y: 0 })
})

test('frame stalls and invalid inputs cannot produce a burst or NaN motion', () => {
  assert.equal(motionDelta(5), .1); assert.equal(motionDelta(-1), 0); assert.equal(motionDelta(NaN), 0)
  for (const delta of [NaN, Infinity, -.1]) assert.equal(advanceLocomotion(freshLocomotion(), { x: 1, z: 0 }, 5.5, delta).speed, 0)
  assert.equal(advanceLocomotion(freshLocomotion(), { x: Infinity, z: 0 }, 5.5, .1).speed, 0)
})
