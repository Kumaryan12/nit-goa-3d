import type { CampusMapState } from '../types/osm'

export default function LoadingOverlay({ state }: { state: CampusMapState }) {
  if (state.status === 'ready') return null
  return (
    <div className={`map-status ${state.status === 'error' ? 'map-status-error' : ''}`} role="status" aria-live="polite">
      {state.status === 'loading' && <span className="loading-dot" aria-hidden="true" />}
      {state.status === 'loading'
        ? 'Loading NIT Goa map data...'
        : 'Unable to load OpenStreetMap campus data.'}
    </div>
  )
}
