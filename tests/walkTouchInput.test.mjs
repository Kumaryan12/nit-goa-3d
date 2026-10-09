import assert from 'node:assert/strict'
import { test } from 'node:test'
import { instantControlPress, WalkTouchInput } from '../src/lib/walkTouchInput.ts'
import { emptyWalkInput } from '../src/lib/walking.ts'

const setup = () => { const input = { current: emptyWalkInput() }; return { input, controls: new WalkTouchInput(input) } }

test('non-primary touch activates Run immediately and compatibility clicks never toggle it twice', () => {
  const { input, controls } = setup(), captured = []
  controls.beginStick(1); controls.moveStick(1, 0, -32, 32)
  let prevented = false
  const press = instantControlPress(() => controls.toggleRun())
  press.onPointerDown({ button: 0, pointerId: 2, isPrimary: false, pointerType: 'touch', preventDefault: () => { prevented = true }, currentTarget: { setPointerCapture: id => captured.push(id) } })
  assert.equal(input.current.running, true); assert.ok(input.current.forward > .9)
  assert.equal(prevented, true); assert.deepEqual(captured, [2])
  press.onClick({ detail: 1, nativeEvent: {} })
  press.onClick({ detail: 0, nativeEvent: { pointerType: 'touch' } })
  controls.release(2)
  assert.equal(input.current.running, true, 'compatibility clicks and lift do not undo the toggle')
  press.onClick({ detail: 0, nativeEvent: {} })
  assert.equal(input.current.running, false, 'keyboard and screen-reader clicks still activate Run')
  assert.ok(input.current.forward > .9)
  press.onPointerDown({ button: 2, pointerId: 3 })
  assert.equal(input.current.running, false, 'right-click is not an action')
})

test('movement, run and jump work together with independent fingers before a render', () => {
  const { input, controls } = setup()
  assert.ok(controls.beginStick(11))
  controls.moveStick(11, 0, -32, 32)
  assert.ok(input.current.forward > .9)
  assert.equal(controls.toggleRun(), true)
  controls.release(22) // The finger that tapped Run has no movement ownership.
  assert.equal(input.current.running, true)
  assert.ok(input.current.forward > .9)
  controls.jump(); controls.release(33)
  assert.equal(input.current.jump, true)
  controls.moveStick(11, 15, -20, 32)
  assert.equal(input.current.running, true, 'joystick updates cannot restore stale run state')
  assert.equal(input.current.jump, true, 'movement does not discard a pending jump')
  assert.ok(input.current.forward > 0 && input.current.side > 0)
  controls.release(11)
  assert.equal(input.current.forward, 0); assert.equal(input.current.side, 0)
})

test('steering and braking release only their own pointer while accelerating', () => {
  const { input, controls } = setup()
  controls.beginStick(1); controls.moveStick(1, 0, -32, 32)
  controls.holdDirection(2, 'turn-left'); controls.holdBrake(3)
  assert.ok(input.current.forward > .9); assert.equal(input.current.turn, 1); assert.equal(input.current.brake, true)
  controls.release(2)
  assert.equal(input.current.turn, 0); assert.equal(input.current.brake, true); assert.ok(input.current.forward > .9)
  controls.release(3)
  assert.equal(input.current.brake, false); assert.ok(input.current.forward > .9)
  controls.release(1)
  assert.deepEqual(input.current, { ...emptyWalkInput(), brake: false })
})

test('unrelated pointer cancellation cannot steal the joystick or release other held controls', () => {
  const { input, controls } = setup()
  controls.beginStick(7); controls.moveStick(7, 0, -32, 32)
  assert.equal(controls.beginStick(8), false)
  assert.equal(controls.moveStick(8, 0, 32, 32), null)
  controls.holdDirection(9, 'right')
  assert.equal(controls.release(8), false)
  assert.ok(input.current.forward > .9); assert.equal(input.current.side, 1)
  assert.equal(controls.release(7), true)
  assert.equal(input.current.forward, 0); assert.equal(input.current.side, 1)
  controls.release(9)
  assert.deepEqual(input.current, { ...emptyWalkInput(), brake: false })
})

test('multiple pointers holding the same direction or brake keep it until all owners release', () => {
  const { input, controls } = setup()
  controls.holdDirection(1, 'forward'); controls.holdDirection(2, 'forward')
  controls.holdBrake(3); controls.holdBrake(4)
  assert.equal(input.current.forward, 1, 'extra fingers do not multiply speed')
  controls.release(1); controls.release(3)
  assert.equal(input.current.forward, 1); assert.equal(input.current.brake, true)
  controls.release(2); controls.release(4)
  assert.deepEqual(input.current, { ...emptyWalkInput(), brake: false })
})

test('pause, blur, vehicle switch and teardown clear every owner and pending action', () => {
  const { input, controls } = setup()
  controls.beginStick(1); controls.moveStick(1, 20, -25, 32)
  controls.toggleRun(); controls.jump(); controls.holdDirection(2, 'turn-right'); controls.holdBrake(3)
  input.current.action = 'enter-gyan'
  controls.clear()
  assert.deepEqual(input.current, emptyWalkInput()); assert.equal(controls.running, false)
  for (const id of [1, 2, 3]) controls.release(id)
  assert.deepEqual(input.current, emptyWalkInput(), 'late pointer-up events cannot restore stale input')
  assert.ok(controls.beginStick(4)); controls.moveStick(4, 0, -32, 32)
  assert.ok(input.current.forward > .9); assert.equal(input.current.running, false)
})

test('keyboard owners coexist with touch and do not discard pending actions', () => {
  const { input, controls } = setup()
  controls.holdDirection(-2, 'forward'); controls.holdDirection(17, 'left'); controls.holdBrake(-20)
  input.current.vehicle = 'buggy'; input.current.action = 'enter-gyan'
  controls.release(-20); controls.release(-2)
  assert.equal(input.current.forward, 0); assert.equal(input.current.side, -1)
  assert.equal(input.current.vehicle, 'buggy'); assert.equal(input.current.action, 'enter-gyan')
  controls.release(17); assert.equal(input.current.side, 0)
})
