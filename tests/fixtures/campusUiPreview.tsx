// Development-only rendering fixture. It provides no server identity or auth bypass.
import { lazy, StrictMode } from 'react'
import { _roots } from '@react-three/fiber'
import { Vector3 } from 'three'
import type { CameraControls } from '@react-three/drei'
import { createRoot } from 'react-dom/client'
import CampusLoadingBoundary from '../../src/components/CampusLoadingBoundary'
import '../../src/styles.css'
import '../../src/components/community.css'
const requestedDelay = Number(new URL(location.href).searchParams.get('bundle-delay'))
const bundleDelay = Number.isFinite(requestedDelay) ? Math.min(5000, Math.max(0, requestedDelay)) : 0
const App = lazy(async () => {
  if (bundleDelay) await new Promise(resolve => window.setTimeout(resolve, bundleDelay))
  return import('../../src/App')
})

if (import.meta.env.DEV && !import.meta.env.VITE_FIREBASE_API_KEY) {
  const controlsCheck = new URL(location.href).searchParams.has('controls-check') ? document.createElement('output') : null
  if (controlsCheck) {
    controlsCheck.style.cssText = 'position:fixed;bottom:14px;left:50%;transform:translateX(-50%);z-index:200;background:#10241fee;color:white;padding:8px;font:11px monospace;pointer-events:none'
    document.body.append(controlsCheck)
  }
  if (controlsCheck) {
    for (const [button, label] of [[0, 'Test left drag'], [2, 'Test right drag']] as const) {
      const check = document.createElement('button')
      check.textContent = label
      check.style.cssText = `position:fixed;left:${button === 0 ? 45 : 55}%;top:160px;z-index:200;padding:8px`
      check.onclick = async () => {
        const canvas = document.querySelector('canvas'); if (!canvas) return
        const rect = canvas.getBoundingClientRect(), buttons = button === 0 ? 1 : 2
        const pointer = (type: string, x: number) => canvas.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 123, pointerType: 'mouse', isPrimary: true, button, buttons: type === 'pointerup' ? 0 : buttons, clientX: rect.left + rect.width / 2 + x, clientY: rect.top + rect.height / 2 }))
        pointer('pointerdown', 0)
        for (let x = 15; x <= 90; x += 15) { await new Promise<void>(resolve => requestAnimationFrame(() => resolve())); pointer('pointermove', x) }
        pointer('pointerup', 90)
      }
      document.body.append(check)
    }
  }
  const introNodes = new Set<Element>(), animationStarts = { arrival: 0, departure: 0 }
  const observer = new MutationObserver(records => {
    for (const record of records) for (const node of record.addedNodes) if (node instanceof Element) {
      if (node.matches('.campus-intro')) introNodes.add(node)
      node.querySelectorAll('.campus-intro').forEach(intro => introNodes.add(intro))
    }
  })
  observer.observe(document.getElementById('root')!, { childList: true, subtree: true })
  document.addEventListener('animationstart', event => {
    if (event.animationName === 'ak-arrive') animationStarts.arrival++
    if (event.animationName === 'ak-depart') animationStarts.departure++
  })
  createRoot(document.getElementById('root')!).render(<StrictMode><CampusLoadingBoundary><App publishedMap /></CampusLoadingBoundary></StrictMode>)
  window.setInterval(() => {
    const inside = (selector: string) => {
      const element = document.querySelector(selector)
      if (!element) return 'not mounted'
      const r = element.getBoundingClientRect()
      return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight ? 'within screen' : 'outside screen'
    }
    if (controlsCheck) {
      const canvas = document.querySelector('canvas'), control = canvas ? _roots.get(canvas)?.store.getState().controls as CameraControls | undefined : undefined
      const target = control?.getTarget?.(new Vector3())
      controlsCheck.textContent = target ? `Camera: target ${target.x.toFixed(2)}, ${target.y.toFixed(2)}, ${target.z.toFixed(2)} · angles ${control!.azimuthAngle.toFixed(3)}, ${control!.polarAngle.toFixed(3)} · distance ${control!.distance.toFixed(2)}` : 'Preparing camera…'
    }
    window.parent.postMessage({ type: 'mobile-preview', viewport: `${innerWidth} × ${innerHeight}`, overflow: document.documentElement.scrollWidth > innerWidth, header: inside('.scene-header'), movement: inside('.walk-controls'), view: inside('.view-controls'), introMounts: introNodes.size, arrivalStarts: animationStarts.arrival, departureStarts: animationStarts.departure, introVisible: !!document.querySelector('.campus-intro') }, window.location.origin)
  }, 1000)
}
