// Development-only rendering fixture. It provides no server identity or auth bypass.
import { lazy, StrictMode } from 'react'
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
    window.parent.postMessage({ type: 'mobile-preview', viewport: `${innerWidth} × ${innerHeight}`, overflow: document.documentElement.scrollWidth > innerWidth, header: inside('.scene-header'), movement: inside('.walk-controls'), view: inside('.view-controls'), introMounts: introNodes.size, arrivalStarts: animationStarts.arrival, departureStarts: animationStarts.departure, introVisible: !!document.querySelector('.campus-intro') }, window.location.origin)
  }, 1000)
}
