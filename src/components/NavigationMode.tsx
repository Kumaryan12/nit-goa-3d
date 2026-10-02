import { memo, useEffect, useMemo, useRef } from 'react'
import { planWalkingRoute } from '../lib/pathfinding'
import type { RoadGraph } from '../lib/pathfinding'
import type { CampusLocation } from '../types/campus'

const locationLabel = (location: CampusLocation) => location.name === 'Unnamed campus building'
  ? `${location.name} (${location.id.replace(/^osm-/, '')})` : location.name

function NavigationMode({ locations, destination, startId, onStartChange, onDestinationChange, graph, roadStatus, onClose }: {
  locations: CampusLocation[]; destination: CampusLocation | null; startId: string; onStartChange: (id: string) => void;
  onDestinationChange: (id: string) => void; graph: RoadGraph; roadStatus: 'loading' | 'ready' | 'error'; onClose: () => void
}) {
  const panel = useRef<HTMLElement>(null)
  useEffect(() => {
    panel.current?.focus({ preventScroll: true })
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onClose])
  const start = locations.find((location) => location.id === (startId === '@current' ? 'main-entrance' : startId))
  const route = useMemo(() => start && destination ? planWalkingRoute(start.coordinates, destination.coordinates, graph) : null, [start, destination, graph])
  return <aside ref={panel} tabIndex={-1} className="building-info-panel navigation-panel" aria-label="Walking navigation">
    <div className="building-info-header"><span className="building-category">📍 Walking navigation</span><button type="button" className="panel-close" aria-label="Close walking navigation" onClick={onClose}>×</button></div>
    <h2>{destination ? `To ${destination.name}` : 'Where to?'}</h2>
    <p className="panel-muted">Explore the campus on foot. Estimates assume authorized access to private campus roads.</p>
    <div className="navigation-form">
      <label htmlFor="navigation-start">Starting point</label>
      <select id="navigation-start" value={startId} onChange={(event) => onStartChange(event.target.value)}>
        <option value="@current">Current location placeholder · Main Entrance</option>
        {locations.map((location) => <option key={location.id} value={location.id}>{locationLabel(location)}</option>)}
      </select>
      <label htmlFor="navigation-destination">Destination</label>
      <select id="navigation-destination" value={destination?.id ?? ''} onChange={(event) => onDestinationChange(event.target.value)}>
        <option value="" disabled>Choose a campus location</option>
        {locations.map((location) => <option key={location.id} value={location.id}>{locationLabel(location)}</option>)}
      </select>
    </div>
    {!destination ? <p className="route-message">Choose a destination to estimate your walk.</p>
      : roadStatus === 'loading' ? <p className="route-message" role="status">Waiting for the mapped road network...</p>
        : roadStatus === 'error' ? <p className="route-message" role="status">Road data unavailable. Retry roads to calculate a walking estimate.</p>
          : route ? <>
            <dl className="route-metrics"><div><dt>Distance</dt><dd>{Math.round(route.distance)} <small>m</small></dd></div><div><dt>Walking time</dt><dd>{route.distance === 0 ? 0 : Math.max(1, Math.ceil(route.walkingMinutes))} <small>min</small></dd></div></dl>
            <p className="route-message">{route.distance === 0 ? 'Start and destination are the same location.' : 'An approximate walking estimate along mapped roads and paths, including short connections to location anchors.'}</p>
          </> : <p className="route-message" role="status">No connected walking route found. The mapped network may be incomplete or the location may be too far from a mapped path.</p>}
    <div className="navigation-foundation-note"><span aria-hidden="true">◎</span><p>The current-location placeholder starts at Main Entrance. GPS and turn-by-turn guidance are not enabled.</p></div>
    <button type="button" className="fly-button" onClick={onClose}>← Back to location details</button>
  </aside>
}
export default memo(NavigationMode)
