// Development-only rendering fixture. It provides no server identity or auth bypass.
import { lazy, StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import CampusLoadingScreen from '../../src/components/CampusLoadingScreen'
import '../../src/styles.css'
import '../../src/components/community.css'
const App = lazy(() => import('../../src/App'))

if (import.meta.env.DEV && !import.meta.env.VITE_FIREBASE_API_KEY) {
  createRoot(document.getElementById('root')!).render(<StrictMode><Suspense fallback={<CampusLoadingScreen />}><App publishedMap /></Suspense></StrictMode>)
  window.setInterval(() => {
    const inside = (selector: string) => {
      const element = document.querySelector(selector)
      if (!element) return 'not mounted'
      const r = element.getBoundingClientRect()
      return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight ? 'within screen' : 'outside screen'
    }
    window.parent.postMessage({ type: 'mobile-preview', viewport: `${innerWidth} × ${innerHeight}`, overflow: document.documentElement.scrollWidth > innerWidth, header: inside('.scene-header'), movement: inside('.walk-controls'), view: inside('.view-controls') }, window.location.origin)
  }, 1000)
}
