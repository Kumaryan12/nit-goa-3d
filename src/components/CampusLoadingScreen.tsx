import { useEffect, useId, useState } from 'react'
import type { CSSProperties } from 'react'
import { CAMPUS_LOADING_ENTRY_MS, CAMPUS_LOADING_EXIT_MS } from '../lib/campusStartup'
import type { CampusLoadingPhase } from '../lib/campusStartup'
import './campus-loading.css'

const captions: Record<CampusLoadingPhase, string> = {
  opening: 'Opening your campus',
  map: 'Mapping the campus',
  terrain: 'Bringing the campus to life',
  scenery: 'Adding a little greenery',
  frame: 'One last touch',
  ready: 'Your campus is ready',
  error: 'The connection needs another try',
  unavailable: 'The 3D view couldn’t start',
}
export interface CampusLoadingScreenProps {
  phase?: CampusLoadingPhase
  stages?: boolean[]
  exiting?: boolean
  showSlowNotice?: boolean
  retryBuildings?: () => void
  retryRoads?: () => void
  onExplore?: () => void
}
export default function CampusLoadingScreen({ phase = 'opening', stages = [false, false, false, false], exiting = false, showSlowNotice = true, retryBuildings, retryRoads, onExplore }: CampusLoadingScreenProps) {
  const gradient = useId(), [slow, setSlow] = useState(false)
  useEffect(() => { if (!showSlowNotice) return; const timer = window.setTimeout(() => setSlow(true), 15000); return () => window.clearTimeout(timer) }, [showSlowNotice])
  const problem = phase === 'error' || phase === 'unavailable'
  return <section className={`campus-intro${exiting ? ' campus-intro-exit' : ''}`} style={{ '--intro-entry-duration': `${CAMPUS_LOADING_ENTRY_MS}ms`, '--intro-exit-duration': `${CAMPUS_LOADING_EXIT_MS}ms` } as CSSProperties} aria-label="Campus loading screen">
    <div className="campus-intro-aura" aria-hidden="true" />
    <header className="campus-intro-header"><span>NITG <b>Explored</b></span></header>
    <div className="campus-intro-center">
      <div className="ak-flight">
      <div className="ak-emblem" aria-label="AK logo" role="img">
        <svg viewBox="0 0 180 140" fill="none" aria-hidden="true">
          <defs><linearGradient id={gradient} x1="24" y1="26" x2="150" y2="113" gradientUnits="userSpaceOnUse"><stop stopColor="#fff2c7" /><stop offset=".28" stopColor="#e8c56c" /><stop offset=".5" stopColor="#a87924" /><stop offset=".7" stopColor="#f7dfa0" /><stop offset="1" stopColor="#bc8c38" /></linearGradient></defs>
          <g transform="translate(3 5)" stroke="#674616" strokeWidth="9" strokeLinecap="square" strokeLinejoin="miter">
            <path d="M25 107 57 29 89 107M38 77H76M101 29V107M150 29 112 68 152 107" />
          </g>
          <g stroke={`url(#${gradient})`} strokeWidth="8" strokeLinecap="square" strokeLinejoin="miter">
            <path d="M25 107 57 29 89 107M38 77H76" />
            <path d="M101 29V107M150 29 112 68 152 107" />
          </g>
          <path d="M25 107 57 29 89 107M38 77H76M101 29V107M150 29 112 68 152 107" transform="translate(-1 -1)" stroke="#fff4d5" strokeOpacity=".38" strokeWidth="1" />
        </svg>
      </div>
      <p className="campus-intro-credit">Made by <strong>Aryan</strong><span aria-hidden="true">✦</span></p>
      </div>
      <div className="campus-intro-progress" aria-label="Campus preparation stages">
        {['Map', 'Terrain', 'Greenery', 'Scene'].map((name, index) => <span key={name} className={stages[index] ? 'is-done' : !stages.slice(0, index).includes(false) ? 'is-current' : ''}><i aria-hidden="true" /><span className="sr-only">{name}: {stages[index] ? 'ready' : 'loading'}.</span></span>)}
      </div>
      <p className="campus-intro-caption">{captions[phase]}</p>
      {problem && <div className="campus-intro-recovery">
        {phase === 'unavailable' && <p>Your browser needs WebGL to explore. Try another browser or reload.</p>}
        {retryBuildings && <button type="button" onClick={retryBuildings}>Retry buildings</button>}
        {retryRoads && <button type="button" onClick={retryRoads}>Retry roads</button>}
        {onExplore && <button type="button" onClick={onExplore}>Explore available campus ↗</button>}
        {(phase === 'unavailable' || !retryBuildings && !retryRoads) && <button type="button" onClick={() => window.location.reload()}>Reload campus</button>}
        <a href="/">Back to welcome</a>
      </div>}
      {slow && !problem && !exiting && <div className="campus-intro-recovery"><p>Taking a little longer. Hang tight.</p><button type="button" onClick={() => window.location.reload()}>Reload campus</button><a href="/">Back to welcome</a></div>}
    </div>
    <footer className="campus-intro-footer"><div className="campus-loading-notice" role="status" aria-live="polite" aria-atomic="true"><span className="campus-notice-icon" aria-hidden="true">{exiting ? '✓' : <i />}</span><span>{exiting ? 'Campus is ready' : problem ? 'Campus loading needs attention' : 'Campus is loading…'}</span></div></footer>
  </section>
}
