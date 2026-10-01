import type { CampusMapState, CampusRoadState } from '../types/osm'

export default function LoadingOverlay({ state, roadState }: { state: CampusMapState; roadState: CampusRoadState }) {
  const messages: { text: string; error?: boolean; loading?: boolean }[] = []
  if (state.status === 'loading') messages.push({ text: 'Loading NIT Goa map data...', loading: true })
  if (state.status === 'error') messages.push({ text: 'Unable to load OpenStreetMap campus data.', error: true })
  if (roadState.status === 'error') messages.push({ text: 'Unable to load OpenStreetMap campus roads.', error: true })
  if (state.status !== 'loading' && roadState.status === 'loading') messages.push({ text: 'Loading NIT Goa roads...', loading: true })
  if (roadState.status === 'ready' && roadState.data.roads.length === 0) messages.push({ text: 'No mapped campus roads found in OpenStreetMap.' })
  if (!messages.length) return null
  return (
    <div className="map-status" role="status" aria-live="polite">
      {messages.map(({ text, error, loading }) => (
        <div key={text} className={`map-status-message ${error ? 'map-status-error' : ''}`}>
          {loading && <span className="loading-dot" aria-hidden="true" />}
          {text}
        </div>
      ))}
    </div>
  )
}
