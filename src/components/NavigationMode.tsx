import { memo, useEffect, useRef, useState } from 'react'
import type { CampusLocation } from '../types/campus'
import type { Playback, RoutePresentation } from '../lib/traversal'
import DirectionsPanel from './DirectionsPanel'
function NavigationMode({ locations, destination, startId, onStartChange, onDestinationChange, presentation, playback, onPlayback, onViewRoute, roadStatus, onClose }: {
  locations: CampusLocation[]; destination: CampusLocation | null; startId: string; onStartChange: (id: string) => void;
  onDestinationChange: (id: string) => void; presentation: RoutePresentation | null; playback: Playback;
  onPlayback: (playback: Playback) => void; onViewRoute: () => void; roadStatus: 'loading' | 'ready' | 'error'; onClose: () => void
}) {
  const panel = useRef<HTMLElement>(null), [collapsed, setCollapsed] = useState(false)
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  useEffect(() => {
    panel.current?.focus({ preventScroll: true })
    const handler = (event: KeyboardEvent) => { if (event.key === 'Escape' && !document.querySelector('dialog[open]')) onClose() }
    window.addEventListener('keydown', handler); return () => window.removeEventListener('keydown', handler)
  }, [onClose])
  const route = presentation?.route
  return <aside ref={panel} tabIndex={-1} className={`building-info-panel navigation-panel ${collapsed ? 'panel-collapsed' : ''}`} aria-label="Walking navigation">
    <div className="building-info-header"><span className="building-category">📍 Walking navigation</span><div className="panel-heading-actions"><button className="panel-collapse" onClick={() => setCollapsed(!collapsed)} aria-expanded={!collapsed}>{collapsed ? 'Expand' : 'Collapse'}</button><button className="panel-close" aria-label="Close walking navigation" onClick={onClose}>×</button></div></div>
    <h2>{destination ? `To ${destination.name}` : 'Where to?'}</h2>
    {!collapsed && <>
    <div className="navigation-form"><label htmlFor="navigation-start">Starting point</label><select id="navigation-start" value={startId} onChange={(event) => onStartChange(event.target.value)}>
      <option value="@current">Main Entrance · current-location placeholder</option>{locations.map((location) => <option key={location.id} value={location.id}>{location.name === 'Unnamed campus building' ? `${location.name} (${location.id})` : location.name}</option>)}
    </select><label htmlFor="navigation-destination">Destination</label><select id="navigation-destination" value={destination?.id ?? ''} onChange={(event) => onDestinationChange(event.target.value)}><option value="" disabled>Choose destination</option>{locations.map((location) => <option key={location.id} value={location.id}>{location.name === 'Unnamed campus building' ? `${location.name} (${location.id})` : location.name}</option>)}</select></div>
    {!destination ? <p className="route-message">Choose a destination to calculate a route.</p> : roadStatus === 'loading' ? <p role="status">Loading mapped roads…</p> : roadStatus === 'error' ? <p role="status">Road data unavailable. Retry roads to calculate a route.</p> : route && presentation ? <>
      <dl className="route-metrics"><div><dt>Distance</dt><dd>{Math.round(route.distance)} <small>m</small></dd></div><div><dt>Walking time</dt><dd>{Math.ceil(route.walkingMinutes)} <small>min</small></dd></div></dl>
      <div className="route-controls"><button className="navigate-button" onClick={onViewRoute}>View route</button><button className="fly-button" onClick={() => onPlayback({ ...playback, status: playback.status === 'playing' ? 'paused' : 'playing', sequence: playback.status === 'complete' || playback.status === 'stopped' ? playback.sequence + 1 : playback.sequence })}>{playback.status === 'playing' ? 'Pause' : playback.status === 'paused' ? 'Resume' : 'Preview walk'}</button>
      <button className="fly-button" onClick={() => onPlayback({ ...playback, status: reduced ? 'paused' : 'playing', sequence: playback.sequence + 1 })}>Restart</button><button className="fly-button" onClick={() => onPlayback({ ...playback, status: 'stopped', sequence: playback.sequence + 1 })}>Stop</button>
      <label>Speed <select name="playback-speed" aria-label="Playback speed" value={playback.speed} onChange={(event) => onPlayback({ ...playback, speed: Number(event.target.value) as 1 | 2 | 4 })}><option value="1">1x</option><option value="2">2x</option><option value="4">4x</option></select></label></div>
      <p role="status" className="panel-muted">Preview {playback.status}.{reduced && ' Reduced motion: playback starts only when you request it.'}</p>
      <DirectionsPanel presentation={presentation} />
    </> : <p role="status" className="route-message">No connected walking route found. The mapped network may be incomplete or an anchor too far from a mapped road.</p>}
    <button className="fly-button" onClick={onClose}>← Back to location details</button></>}
  </aside>
}
export default memo(NavigationMode)
