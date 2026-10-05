import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Euler, Matrix4, Vector3 } from 'three'
import { avatarPose, ridingPose, socialPose, socialPoseForMotion } from '../src/lib/avatarMotion.ts'

const gesture = (action, startedAt = 1_000, until = 9_000) => ({ action, startedAt, until })
const soleHeights = pose => pose.hips.map((hip, i) => pose.rootY + .88 - .37 * Math.cos(hip) - .37 * Math.cos(hip + pose.knees[i]) - .129)
const hand = (pose, i) => new Vector3(0, -.24, -.007)
  .applyMatrix4(new Matrix4().makeRotationX(pose.elbows[i]))
  .add(new Vector3(0, -.235, 0))
  .applyMatrix4(new Matrix4().makeRotationFromEuler(new Euler(pose.arms[i], pose.armY[i], pose.armZ[i], 'YXZ')))
  .add(new Vector3(i ? .29 : -.29, 1.40, 0))

test('social gestures have finite bounded transforms, flat grounded soles and a gentle expiry', () => {
  for (const action of ['wave', 'dance', 'applause', 'heart', 'cheer', 'sit']) {
    assert.equal(socialPose(gesture(action), 999), null)
    assert.equal(socialPose(gesture(action), 9_000), null)
    assert.equal(socialPose(gesture(action), 1_000).weight, 0)
    assert.ok(socialPose(gesture(action), 8_999).weight < .001)
    for (let now = 1_000; now < 9_000; now += 41) {
      const pose = socialPose(gesture(action), now)
      for (const value of Object.values(pose).flat()) assert.ok(Number.isFinite(value) && Math.abs(value) <= Math.PI)
      assert.ok(Math.abs(Math.min(...soleHeights(pose)) - .011) < 1e-8)
      assert.ok(pose.hips.every((hip, i) => Math.abs(hip + pose.knees[i] + pose.ankles[i]) < 1e-8))
    }
  }
  for (const state of [gesture('wave', NaN), gesture('dance', 2_000, 1_000), gesture('unknown'), gesture('wave', 1_000, Infinity)]) assert.equal(socialPose(state, 2_000), null)
  assert.equal(socialPose(gesture('wave'), NaN), null)
})

test('applause brings both hands together in front of the torso and opens them between claps', () => {
  const closed = socialPose(gesture('applause'), 2_000, true)
  const open = socialPose(gesture('applause'), 1_500)
  assert.ok(hand(closed, 0).distanceTo(hand(closed, 1)) < .14, 'hands meet within their combined palm diameters')
  assert.ok(hand(open, 0).distanceTo(hand(open, 1)) > .3, 'hands separate for the next clap')
  for (const i of [0, 1]) { const palm = hand(closed, i); assert.ok(palm.z < -.3); assert.ok(palm.y > 1 && palm.y < 1.4) }
})

test('reduced motion presents distinct still gestures without repeated movement', () => {
  const poses = ['wave', 'dance', 'applause', 'heart', 'cheer', 'sit'].map(action => {
    const early = socialPose(gesture(action), 2_000, true), late = socialPose(gesture(action), 4_000, true)
    assert.deepEqual(early, late)
    return JSON.stringify(early)
  })
  assert.equal(new Set(poses).size, 6)
})

test('bench sitting matches the low OAT seat and preserves seated legs for audience gestures', () => {
  const sitting = socialPose(undefined, 2_000, false, true)
  assert.ok(sitting.rootY + .88 > .24 && sitting.rootY + .88 < .3, 'hip joint is just above the 22 cm seat')
  assert.ok(soleHeights(sitting).every(y => y >= 0 && y < .02))
  for (const action of ['wave', 'dance', 'applause', 'heart', 'cheer']) {
    const seated = socialPose(gesture(action), 2_000, false, true)
    assert.deepEqual(seated.hips, sitting.hips); assert.deepEqual(seated.knees, sitting.knees)
    assert.equal(seated.rootY, sitting.rootY)
    assert.deepEqual(socialPose(gesture(action), 9_000, false, true), sitting)
  }
})

test('walking, jumping and riding override social state and leave established poses available', () => {
  const motion = { phase: 0, moving: false, social: gesture('dance') }
  assert.ok(socialPoseForMotion(motion, 2_000))
  for (const override of [{ moving: true }, { speed: 1 }, { airborne: true }, { vehicle: 'bicycle' }, { vehicle: 'buggy' }]) {
    assert.equal(socialPoseForMotion({ ...motion, ...override }, 2_000), null)
    assert.equal(socialPoseForMotion({ ...motion, seated: true, ...override }, 2_000), null)
  }
  assert.ok(avatarPose(1, 2.3, false, 0).hips[0] > 0)
  assert.ok(avatarPose(0, 0, false, 0, 0, .5).hips[1] > 1)
  assert.equal(avatarPose(0, 0, false, 0, 0, 0, true).knees[0], -.55)
  for (const vehicle of ['bicycle', 'buggy']) assert.ok(ridingPose(vehicle, 1, 3).hips[0] > .5)
})
