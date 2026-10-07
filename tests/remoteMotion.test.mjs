import { test } from 'node:test'
import assert from 'node:assert/strict'
import { RemoteMotionBuffer } from '../src/lib/remoteMotion.ts'
import { liveConnectionStalled } from '../src/lib/liveWatchdog.ts'

const pose = extra => ({ x: 0, y: 0, z: 0, yaw: 0, epoch: 1, vehicle: 'walk', moving: true, running: false, active: true, visible: true, space: 'outdoors', ...extra })
const frame = (sequence, serverTime, ...poses) => ({ sequence, serverTime, people: poses.map((p, i) => ({ id: `p${i}`, pose: p })) })
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} ≠ ${b}`)

test('remote movement fills every render frame between sparse, jittery network ticks', () => {
  const buffer = new RemoteMotionBuffer()
  buffer.push(frame(1, 10000, pose()), 0)
  buffer.push(frame(2, 10100, pose({ x: .4 })), 110)
  // Packet arrives 10 ms late, without slowing the shared timeline.
  near(buffer.sample('p0', 125).x, .1)
  near(buffer.sample('p0', 150).x, .2)
  near(buffer.sample('p0', 175).x, .3)
  near(buffer.sample('p0', 200).x, .4)
  buffer.push(frame(3, 10200, pose({ x: .8 })), 240)
  near(buffer.sample('p0', 250).x, .6)
  near(buffer.sample('p0', 275).x, .7)
})

test('late packets get bounded speed prediction and then hold position', () => {
  const buffer = new RemoteMotionBuffer()
  buffer.push(frame(1, 10000, pose()), 0)
  buffer.push(frame(2, 10100, pose({ x: 2 })), 100)
  const predicted = buffer.sample('p0', 300)
  assert.ok(predicted.x <= 2 + 5.8 * .1)
  near(buffer.sample('p0', 400).x, 2 + 5.8 * .15)
  assert.equal(buffer.sample('p0', 400).moving, false)
  near(buffer.sample('p0', 2000).x, buffer.sample('p0', 400).x)
})

test('floor changes, teleports, vehicles and reappearing players snap without ghost travel', () => {
  for (const change of [{ epoch: 2, x: 7 }, { space: 'gyan:1', y: 4 }, { vehicle: 'bicycle', x: 1 }, { x: 100 }]) {
    const buffer = new RemoteMotionBuffer()
    buffer.push(frame(1, 10000, pose()), 0)
    buffer.push(frame(2, 10100, pose(change)), 100)
    const sampled = buffer.sample('p0', 110)
    for (const [key, value] of Object.entries(change)) assert.equal(sampled[key], value)
  }
  const buffer = new RemoteMotionBuffer()
  buffer.push(frame(1, 10000, pose()), 0)
  buffer.push(frame(2, 10100, pose({ visible: false })), 100)
  assert.equal(buffer.sample('p0', 110).visible, false)
  buffer.push(frame(3, 10200), 200)
  assert.equal(buffer.sample('p0', 250), null)
  buffer.push(frame(4, 14000, pose({ x: 4 })), 4000)
  assert.equal(buffer.sample('p0', 4000).x, 4)
  buffer.push(frame(3, 10200, pose({ x: 10 })), 4001)
  assert.equal(buffer.sample('p0', 4001).x, 4, 'old packets cannot rewind the scene')
})

test('remote yaw follows the short arc across the angle wrap', () => {
  const buffer = new RemoteMotionBuffer()
  buffer.push(frame(1, 10000, pose({ yaw: Math.PI - .1 })), 0)
  buffer.push(frame(2, 10100, pose({ yaw: -Math.PI + .1 })), 100)
  near(buffer.sample('p0', 150).yaw, Math.PI)
})

test('background suspension does not reconnect; foreground gets a grace period before recovering', () => {
  assert.equal(liveConnectionStalled(20000, 0, 0, false, true), false)
  assert.equal(liveConnectionStalled(20000, 0, 0, true, false), false)
  assert.equal(liveConnectionStalled(20100, 0, 20000, true, true), false)
  assert.equal(liveConnectionStalled(21600, 0, 20000, true, true), true)
  assert.equal(liveConnectionStalled(21600, 21000, 20000, true, true), false)
})
