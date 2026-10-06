import { test } from 'node:test'
import assert from 'node:assert/strict'
import { bindCameraGestures, pinchRatio, trackpadPinchRatio } from '../src/lib/cameraGestures.ts'
class Surface extends EventTarget {
  captures = new Set()
  setPointerCapture(id) { this.captures.add(id) }
  hasPointerCapture(id) { return this.captures.has(id) }
  releasePointerCapture(id) { this.captures.delete(id) }
}
function dispatch(target, type, values = {}) {
  const event = Object.assign(new Event(type, { cancelable: true }), values)
  target.dispatchEvent(event); return event
}
const touch = (id, x, y = 0) => ({ pointerId: id, clientX: x, clientY: y, pointerType: 'touch', isPrimary: id === 1, button: 0 })

test('spreading two fingers zooms in without rotating; lifting one resumes drag without a jump', () => {
  const canvas = new Surface(), background = new EventTarget(), rotations = []
  let distance = 7
  const cleanup = bindCameraGestures(canvas, { zoom: ratio => distance *= ratio, rotate: (x,y) => rotations.push([x,y]) }, background)
  dispatch(canvas,'pointerdown',touch(1,0)); dispatch(canvas,'pointerdown',touch(2,100))
  dispatch(canvas,'pointermove',touch(2,200)); assert.equal(distance,3.5); assert.deepEqual(rotations,[])
  dispatch(canvas,'pointermove',touch(2,100)); assert.equal(distance,7)
  dispatch(canvas,'pointerup',touch(1,0)); dispatch(canvas,'pointermove',touch(2,103,2))
  assert.deepEqual(rotations,[[3,2]]); assert.equal(distance,7)
  cleanup(); assert.equal(canvas.captures.size,0)
})

test('cancellation, third contacts, blur and cleanup do not leave stuck camera gestures', () => {
  const canvas = new Surface(), background = new EventTarget(), ratios = [], rotations = []
  const cleanup = bindCameraGestures(canvas,{zoom:r=>ratios.push(r),rotate:(x,y)=>rotations.push([x,y])},background)
  for(const [id,x] of [[1,0],[2,100],[3,150]])dispatch(canvas,'pointerdown',touch(id,x))
  dispatch(canvas,'pointermove',touch(2,200)); assert.equal(ratios.length,0)
  dispatch(canvas,'pointercancel',touch(3,150)); dispatch(canvas,'pointermove',touch(2,220)); assert.equal(ratios[0],200/220)
  background.dispatchEvent(new Event('blur')); assert.equal(canvas.captures.size,0)
  dispatch(canvas,'pointermove',touch(2,100)); assert.equal(ratios.length,1); assert.equal(rotations.length,0)
  cleanup(); dispatch(canvas,'wheel',{ctrlKey:true,deltaY:-10}); assert.equal(ratios.length,1)
})

test('trackpad pinch prevents browser zoom and duplicate dolly while ordinary scrolling still works', () => {
  const canvas = new Surface(), background = new EventTarget(), ratios = [], scrolls = []
  const cleanup = bindCameraGestures(canvas,{zoom:r=>ratios.push(r),scroll:e=>scrolls.push(e.deltaY)},background)
  let nativeWheel = 0; canvas.addEventListener('wheel',()=>nativeWheel++)
  const pinch = dispatch(canvas,'wheel',{ctrlKey:true,deltaY:-10,deltaMode:0})
  assert.equal(pinch.defaultPrevented,true); assert.equal(nativeWheel,0); assert.ok(ratios[0]<1)
  dispatch(canvas,'wheel',{ctrlKey:false,deltaY:16,deltaMode:0})
  assert.deepEqual(scrolls,[16]); assert.equal(nativeWheel,1); assert.equal(ratios.length,1)
  cleanup()
})

test('Safari trackpad gestures zoom once and touchscreen gesture events do not double the pointer pinch', () => {
  const canvas = new Surface(), background = new EventTarget(), ratios = []
  const cleanup = bindCameraGestures(canvas,{zoom:r=>ratios.push(r)},background)
  dispatch(canvas,'gesturestart',{scale:1}); dispatch(canvas,'gesturechange',{scale:2})
  dispatch(canvas,'wheel',{ctrlKey:true,deltaY:-10}); assert.deepEqual(ratios,[.5])
  dispatch(canvas,'gestureend',{scale:2})
  dispatch(canvas,'pointerdown',touch(1,0)); dispatch(canvas,'pointerdown',touch(2,100))
  dispatch(canvas,'gesturestart',{scale:1}); dispatch(canvas,'gesturechange',{scale:2})
  assert.deepEqual(ratios,[.5],'Overview native touch dolly owns these two contacts')
  cleanup()
})

test('pinch is cumulative and rejects invalid distances; trackpad deltas stay bounded', () => {
  assert.equal(pinchRatio(100,200)*pinchRatio(200,400),pinchRatio(100,400))
  for(const value of [0,2,NaN,Infinity])assert.equal(pinchRatio(100,value),1)
  assert.equal(trackpadPinchRatio(1,1),trackpadPinchRatio(16))
  assert.equal(trackpadPinchRatio(NaN),1)
  assert.ok(trackpadPinchRatio(100000)<2 && trackpadPinchRatio(-100000)>.5)
})
