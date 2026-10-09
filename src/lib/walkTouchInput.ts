import { joystickInput } from './avatarMotion.ts'
import { emptyWalkInput } from './walking.ts'
import type { WalkInput } from './walking.ts'

export type WalkDirection = 'forward' | 'back' | 'left' | 'right' | 'turn-left' | 'turn-right'

interface ControlPointer {
  button: number; pointerId: number
  preventDefault: () => void
  currentTarget: { setPointerCapture: (id: number) => void }
}
// Action controls must accept non-primary fingers. The eventual browser click
// must not execute a toggle twice; keyboard and assistive clicks still work.
export function instantControlPress(perform: () => void, enabled = true) {
  return {
    onPointerDown: (event: ControlPointer) => {
      if (!enabled || event.button !== 0) return
      event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId)
      perform()
    },
    onClick: (event: { detail: number; nativeEvent: object }) => {
      const pointerType = (event.nativeEvent as { pointerType?: string }).pointerType
      if (enabled && event.detail === 0 && !pointerType) perform()
    },
    onKeyDown: (event: { key: string; stopPropagation: () => void }) => {
      if (event.key === ' ' || event.key === 'Enter') event.stopPropagation()
    },
  }
}

// Each finger owns its held control. A second finger can change Run or Jump
// immediately without waiting for a primary-pointer click or a React render.
export class WalkTouchInput {
  private directions = new Map<number, WalkDirection>()
  private brakes = new Set<number>()
  private stick = { id: -1, forward: 0, side: 0 }
  running = false
  private input: { current: WalkInput }
  constructor(input: { current: WalkInput }) { this.input = input }

  private synchronize() {
    const held = [...this.directions.values()]
    this.input.current = {
      ...this.input.current,
      forward: this.stick.forward + Number(held.includes('forward')) - Number(held.includes('back')),
      side: this.stick.side + Number(held.includes('right')) - Number(held.includes('left')),
      turn: Number(held.includes('turn-left')) - Number(held.includes('turn-right')),
      running: this.running,
      brake: this.brakes.size > 0,
    }
  }

  beginStick(id: number) {
    if (this.stick.id !== -1) return false
    this.stick.id = id
    return true
  }

  moveStick(id: number, x: number, y: number, radius: number) {
    if (this.stick.id !== id) return null
    const value = joystickInput(x, y, radius)
    this.stick.forward = value.forward; this.stick.side = value.side
    this.synchronize()
    return value
  }

  holdDirection(id: number, direction: WalkDirection) {
    this.directions.set(id, direction)
    this.synchronize()
  }

  holdBrake(id: number) {
    this.brakes.add(id)
    this.synchronize()
  }

  toggleRun() {
    this.running = !this.running
    this.synchronize()
    return this.running
  }

  jump() { this.input.current.jump = true }

  release(id: number) {
    let owned = this.directions.delete(id)
    owned = this.brakes.delete(id) || owned
    const releasedStick = this.stick.id === id
    if (releasedStick) this.stick = { id: -1, forward: 0, side: 0 }
    if (owned || releasedStick) this.synchronize()
    return releasedStick
  }

  clear() {
    this.directions.clear(); this.brakes.clear()
    this.stick = { id: -1, forward: 0, side: 0 }
    this.running = false
    this.input.current = emptyWalkInput()
  }
}
