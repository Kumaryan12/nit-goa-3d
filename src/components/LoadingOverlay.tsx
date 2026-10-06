import type { CampusMapState, CampusRoadState } from '../types/osm'

export default function LoadingOverlay({ state, roadState, terrainReady, vegetationReady, onRetryRoads, onRetryBuildings }: {
  state: CampusMapState; roadState: CampusRoadState; terrainReady: boolean; vegetationReady: boolean; onRetryRoads: () => void; onRetryBuildings: () => void
}) {
  const complete = state.status === 'ready' && roadState.status === 'ready' && terrainReady && vegetationReady
  const stages = [
    { name: 'Buildings', status: state.status },
    { name: 'Roads', status: roadState.status },
    { name: 'Terrain', status: terrainReady ? 'ready' : 'loading' },
    { name: 'Vegetation', status: vegetationReady ? 'ready' : 'loading' },
  ]
  return <div className={`map-status ${complete ? 'map-status-complete' : ''}`} role="status" aria-live="polite">
    <span className="loading-title">{complete ? 'Campus ready' : state.status === 'error' || roadState.status === 'error' ? 'Campus partially available' : 'Preparing your campus'}</span>
    <div className="loading-stages">{stages.map(({ name, status }) => <div key={name} className={status === 'error' ? 'map-status-error' : ''}>
      <span aria-hidden="true" className={status === 'loading' ? 'loading-dot' : ''}>{status === 'ready' ? '✓' : status === 'error' ? '!' : ''}</span>
      {name}<span className="sr-only"> {status}</span>
    </div>)}</div>
    {state.status === 'error' && <><p className="map-status-error">Buildings unavailable. Retry when your connection is ready.</p><button type="button" className="retry-button" onClick={onRetryBuildings}>Retry buildings ↻</button></>}
    {roadState.status === 'error' && <><p className="map-status-error">Roads unavailable. Building selection remains available.</p><button type="button" className="retry-button" onClick={onRetryRoads}>Retry roads ↻</button></>}
    {roadState.status === 'ready' && !roadState.data.roads.length && <p>No mapped roads found.</p>}
  </div>
}
