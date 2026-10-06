// Pinch changes camera distance, never the browser page scale. The inverse
// ratio makes spreading fingers bring the camera closer in both explorer modes.
export function pinchRatio(previous: number, current: number) {
  return Number.isFinite(previous) && Number.isFinite(current) && previous > 4 && current > 4 ? previous / current : 1
}
export function trackpadPinchRatio(deltaY: number, deltaMode = 0) {
  const pixels = deltaY * (deltaMode === 1 ? 16 : deltaMode === 2 ? 500 : 1)
  return Number.isFinite(pixels) ? Math.exp(Math.max(-60, Math.min(60, pixels)) * .01) : 1
}
type Gesture = Event & { scale: number }
interface Options {
  zoom: (ratio: number) => void
  rotate?: (x: number, y: number) => void
  scroll?: (event: WheelEvent) => void
}
export function bindCameraGestures(canvas: HTMLElement, { zoom, rotate, scroll }: Options, background: EventTarget = window) {
  const pointers = new Map<number, { x: number; y: number }>()
  let gap = 0, gestureScale = 0
  const spacing = () => { const [a, b] = [...pointers.values()]; return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0 }
  const start = (event: PointerEvent) => {
    if (!rotate && event.pointerType !== 'touch') return
    if (event.button !== 0 || event.pointerType !== 'touch' && !event.isPrimary) return
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (rotate) { event.preventDefault(); canvas.setPointerCapture(event.pointerId) }
    gap = spacing()
  }
  const move = (event: PointerEvent) => {
    const before = pointers.get(event.pointerId); if (!before) return
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (!rotate) return // Overview's camera-controls owns touchscreen dolly.
    event.preventDefault()
    if (pointers.size === 2) { const next = spacing(); zoom(pinchRatio(gap, next)); gap = next }
    else if (pointers.size === 1) rotate?.(event.clientX - before.x, event.clientY - before.y)
    // A third contact suspends camera changes until two remain.
  }
  const end = (event: PointerEvent) => {
    if (!pointers.delete(event.pointerId)) return
    gap = spacing()
    if (rotate && canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId)
  }
  const clear = () => {
    const ids = [...pointers.keys()]; pointers.clear(); gap = 0; gestureScale = 0
    for (const id of ids) if (rotate && canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id)
  }
  const wheel = (event: WheelEvent) => {
    if (event.ctrlKey || gestureScale) {
      event.preventDefault(); event.stopImmediatePropagation()
      if (!gestureScale) zoom(trackpadPinchRatio(event.deltaY, event.deltaMode))
    } else if (scroll) { event.preventDefault(); scroll(event) }
  }
  const gestureStart = (event: Event) => { event.preventDefault(); gestureScale = (event as Gesture).scale || 1 }
  const gestureChange = (event: Event) => {
    event.preventDefault(); const next = (event as Gesture).scale
    if (gestureScale && pointers.size < 2) zoom(pinchRatio(gestureScale * 100, next * 100))
    if (Number.isFinite(next) && next > 0) gestureScale = next
  }
  const gestureEnd = (event: Event) => { event.preventDefault(); gestureScale = 0 }
  canvas.addEventListener('pointerdown', start); canvas.addEventListener('pointermove', move)
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.addEventListener(name, end as EventListener)
  // Capture runs before camera-controls' wheel handler, avoiding double zoom.
  canvas.addEventListener('wheel', wheel, { passive: false, capture: true })
  canvas.addEventListener('gesturestart', gestureStart, { passive: false })
  canvas.addEventListener('gesturechange', gestureChange, { passive: false })
  canvas.addEventListener('gestureend', gestureEnd, { passive: false })
  background.addEventListener('blur', clear)
  return () => {
    clear(); canvas.removeEventListener('pointerdown', start); canvas.removeEventListener('pointermove', move)
    for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.removeEventListener(name, end as EventListener)
    canvas.removeEventListener('wheel', wheel, { capture: true })
    canvas.removeEventListener('gesturestart', gestureStart); canvas.removeEventListener('gesturechange', gestureChange); canvas.removeEventListener('gestureend', gestureEnd)
    background.removeEventListener('blur', clear)
  }
}
