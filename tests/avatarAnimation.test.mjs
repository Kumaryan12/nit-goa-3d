import assert from 'node:assert/strict'
import { test } from 'node:test'
import { advanceAvatarAnimation, freshAvatarAnimation } from '../src/lib/avatarAnimation.ts'
import { avatarPose } from '../src/lib/avatarMotion.ts'
import { createAvatarGeometry } from '../src/lib/avatarGeometry.ts'

const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-8)
test('visual speed, run and jump blends are consistent across screen refresh rates', () => {
  const results = [30, 60, 144, 240].map(hz => {
    const state = freshAvatarAnimation()
    for (let i = 0; i < hz; i++) advanceAvatarAnimation(state, { phase: 1, moving: true, speed: 5.5, running: true, airborne: true }, 1 / hz)
    return state
  })
  for (const value of results) for (const key of ['speed', 'run', 'air']) close(value[key], results[0][key])
  assert.ok(results[0].run > .99 && results[0].speed <= 5.5)
})
test('landing bends recover gently, stay grounded and cannot persist when riding', () => {
  const state = freshAvatarAnimation(), motion = { phase: 1, moving: false, airborne: true }
  advanceAvatarAnimation(state, motion, .1)
  advanceAvatarAnimation(state, { ...motion, airborne: false }, 1 / 60)
  assert.equal(state.landing, 1)
  for (let i = 0; i < 20; i++) {
    const previous = state.landing
    advanceAvatarAnimation(state, { ...motion, airborne: false }, 1 / 60)
    assert.ok(state.landing <= previous)
    const pose = avatarPose(1, 2.3, .5, 0, 0, 0, false, undefined, state.landing)
    const soles = pose.hips.map((hip, j) => pose.rootY + .88 - .37 * Math.cos(hip) - .37 * Math.cos(hip + pose.knees[j]) - .129)
    close(Math.min(...soles), .011)
  }
  assert.equal(state.landing, 0)
  advanceAvatarAnimation(state, motion, .1)
  advanceAvatarAnimation(state, { ...motion, airborne: false, vehicle: 'bicycle' }, .1)
  assert.equal(state.landing, 0); assert.equal(state.wasAirborne, false)
})
test('visual transitions freeze while paused, reject invalid speeds and stay bounded', () => {
  const state = freshAvatarAnimation()
  advanceAvatarAnimation(state, { phase: 0, moving: true, speed: 2.3 }, .1)
  const before = { ...state }
  for (const dt of [0, NaN, Infinity, -.1]) { advanceAvatarAnimation(state, { phase: 0, moving: false }, dt); assert.deepEqual(state, before) }
  advanceAvatarAnimation(state, { phase: 0, moving: false, paused: true }, .1); assert.deepEqual(state, before)
  for (const speed of [Infinity, NaN, -4, 1e8]) {
    advanceAvatarAnimation(state, { phase: 0, moving: true, speed, running: true, airborne: true }, 5)
    assert.ok(Object.values(state).every(value => typeof value === 'boolean' || Number.isFinite(value)))
    assert.ok(state.speed >= 0 && state.speed <= 18 && state.run <= 1 && state.air <= 1)
  }
})
test('run blending avoids a posture pop and jump ascent/descent remain inside collision height', () => {
  const a = avatarPose(1, 3, .499, 0), b = avatarPose(1, 3, .501, 0)
  for (const key of ['hips', 'knees', 'arms']) a[key].forEach((value, i) => assert.ok(Math.abs(value - b[key][i]) < .005))
  const ascending = avatarPose(1, 3, .5, 0, 0, 0, true, 4.4), descending = avatarPose(1, 3, .5, 0, 0, 0, true, -4.4)
  assert.ok(ascending.knees[0] < descending.knees[0])
  for (let velocity = -4.4; velocity <= 4.4; velocity += .2) {
    const pose = avatarPose(1, 3, .5, 0, 0, 0, true, velocity)
    assert.ok(.88 + 1.087 + pose.rootY < 2.1)
    assert.ok(Object.values(pose).flat().every(Number.isFinite))
  }
})
test('mixed rounded clothing and indexed face geometry merges into a valid coloured mesh', () => {
  const parts = [
    { shape: 'rounded', size: [.47, .49, .31], at: [0, 1.2, 0], color: '#277c77' },
    { shape: 'sphere', size: [.2, 0, 0], at: [0, 1.7, 0], scale: [1, .8, .9], color: '#cf9871' },
    { shape: 'capsule', size: [.1, .2, 0], at: [.3, 1.2, 0], rotation: [0, 0, .2] },
    { shape: 'box', size: [.1, .02, .03], at: [0, 1.5, -.2], color: '#ffffff' },
  ]
  const geometry = createAvatarGeometry(parts)
  assert.ok(geometry.index && geometry.index.count > 0)
  assert.equal(geometry.getAttribute('color').count, geometry.getAttribute('position').count)
  for (const key of ['position', 'normal', 'color']) assert.ok([...geometry.getAttribute(key).array].every(Number.isFinite))
  geometry.computeBoundingBox()
  assert.ok(geometry.boundingBox.min.y > .9 && geometry.boundingBox.max.y > 1.85)
  assert.ok(geometry.boundingSphere.radius > .4 && Number.isFinite(geometry.boundingSphere.radius))
  assert.ok(new Set([...geometry.getAttribute('color').array]).size > 3)
  geometry.dispose()
})

test('sculpted hair covers the nape, leaves the face open and has outward finite normals', () => {
  for (const back of [2.15, 2.3]) {
    const geometry = createAvatarGeometry([{ shape: 'scalp', size: [.224, 1.12, back], sweep: back === 2.15 ? 1 : 0, at: [0, 0, 0] }])
    assert.equal(geometry.index.count / 3, 20 * (2 * 10 - 1), 'open cap retains both triangles along each hairline segment')
    const positions = geometry.getAttribute('position'), normals = geometry.getAttribute('normal')
    const front = [], rear = []
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i)
      const dot = x * normals.getX(i) + y * normals.getY(i) + z * normals.getZ(i)
      assert.ok(Number.isFinite(dot) && dot > .15, 'hair normals point away from the head, including along the open hairline')
      if (Math.abs(x) < .015 && z < -.04) front.push(y)
      if (Math.abs(x) < .015 && z > .04) rear.push(y)
    }
    assert.ok(front.length && rear.length)
    assert.ok(Math.min(...front) > .09, 'forehead and eyes remain visible')
    assert.ok(Math.min(...rear) < -.12, 'rear hair reaches down to the nape')
    geometry.computeBoundingBox()
    assert.ok(.88 + .845 + geometry.boundingBox.max.y * 1.03 < 2.1, 'crown remains inside the standing collision height')
    geometry.dispose()
  }
})
