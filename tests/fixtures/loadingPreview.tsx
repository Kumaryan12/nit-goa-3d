// Local design review only; this fixture supplies no authentication identity.
import { createRoot } from 'react-dom/client'
import { useEffect, useState } from 'react'
import CampusLoadingScreen from '../../src/components/CampusLoadingScreen'
import { CAMPUS_LOADING_EXIT_MS } from '../../src/lib/campusStartup'
import type { CampusLoadingPhase } from '../../src/lib/campusStartup'
import '../../src/styles.css'

if (import.meta.env.DEV) {
  const phases: CampusLoadingPhase[] = ['opening', 'map', 'terrain', 'scenery', 'frame', 'ready', 'error', 'unavailable']
  const query = new URLSearchParams(window.location.search), value = query.get('phase') as CampusLoadingPhase
  const phase = phases.includes(value) ? value : 'terrain'
  const completed = { opening: 0, map: 0, terrain: 1, scenery: 2, frame: 3, ready: 4, error: 0, unavailable: 0 }[phase]
  function MotionPreview() {
    const [exiting, setExiting] = useState(false), [visible, setVisible] = useState(true)
    useEffect(() => {
      if (!exiting) return
      const timer = window.setTimeout(() => setVisible(false), window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 180 : CAMPUS_LOADING_EXIT_MS)
      return () => window.clearTimeout(timer)
    }, [exiting])
    return <>
      {visible ? <CampusLoadingScreen showSlowNotice={false} phase={exiting ? 'ready' : phase} exiting={exiting} stages={[0, 1, 2, 3].map(i => exiting || i < completed)} retryBuildings={phase === 'error' ? () => window.location.search = '?phase=map' : undefined} /> : <p style={{ position: 'fixed', inset: 0, margin: 0, display: 'grid', placeItems: 'center', color: '#e5bf69', background: '#000' }}>Campus reveal complete</p>}
      <button type="button" disabled={visible && exiting} style={{ position: 'fixed', zIndex: 1100, top: 72, left: 25, padding: '9px 13px', border: '1px solid #e5bf6933', borderRadius: 8, background: '#0c0a06', color: '#e5bf69', fontSize: 11 }} onClick={() => { if (visible) setExiting(true); else { setExiting(false); setVisible(true) } }}>{visible ? 'Preview reveal' : 'Replay intro'}</button>
    </>
  }
  const demo = <MotionPreview />
  // ?mobile=1 previews the layout at a real phone viewport inside the desktop.
  createRoot(document.getElementById('root')!).render(query.has('mobile') ? <div style={{ width: 390, height: 844, maxHeight: '100vh', margin: '0 auto' }}><iframe title="Mobile loading screen" src={`./loading-preview.html?phase=${phase}`} style={{ width: '100%', height: '100%', border: 0 }} /></div> : demo)
}
