import { useCallback, useEffect, useState } from 'react'
import CampusScene from './components/CampusScene'
import LoadingOverlay from './components/LoadingOverlay'
import { sceneConfig } from './lib/sceneConfig'
import { fetchCampusData } from './lib/osm'
import { LAT0, LON0 } from './lib/geo'
import type { CampusMapState } from './types/osm'

export default function App() {
  const [showGrid, setShowGrid] = useState(true)
  const [mapState, setMapState] = useState<CampusMapState>({ status: 'loading' })
  const [renderedCount, setRenderedCount] = useState(0)
  const onRenderedCount = useCallback((count: number) => {
    setRenderedCount(count)
    if (import.meta.env.DEV) console.info('[NIT Goa OSM] Buildings successfully rendered:', count)
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    if (import.meta.env.DEV) console.info('[NIT Goa OSM] Campus coordinate origin:', { lat: LAT0, lon: LON0, x: 0, z: 0 })
    fetchCampusData(controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return
        if (import.meta.env.DEV) {
          console.info('[NIT Goa OSM] Building objects returned:', data.returnedBuildingCount)
          console.info('[NIT Goa OSM] Query source:', data.source)
        }
        setMapState({ status: 'ready', data })
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        console.error('[NIT Goa OSM] Unable to load campus data.', error)
        setMapState({ status: 'error' })
      })
    return () => controller.abort()
  }, [])

  return (
    <main className="explorer" aria-label="NIT Goa 3D campus explorer">
      <div className="scene-viewport" aria-label="Interactive campus ground. Drag to orbit, scroll to zoom, and right-drag to pan.">
        <CampusScene
          showGrid={showGrid}
          mapData={mapState.status === 'ready' ? mapState.data : null}
          onRenderedCount={onRenderedCount}
        />
      </div>
      <LoadingOverlay state={mapState} />
      {import.meta.env.DEV && (
        <div className="map-debug">Buildings loaded: {renderedCount}</div>
      )}

      <header className="scene-header">
        <div className="title-block">
          <span className="eyebrow">Campus explorer</span>
          <h1>NIT Goa <span>3D Explorer</span></h1>
        </div>
        <button
          type="button"
          className="grid-toggle"
          aria-pressed={showGrid}
          onClick={() => setShowGrid((visible) => !visible)}
        >
          <svg viewBox="0 0 20 20" width="18" height="18" fill="none" aria-hidden="true">
            <rect x="3" y="3" width="14" height="14" rx="2" />
            <path d="M3 10h14M10 3v14" />
          </svg>
          Grid {showGrid ? 'on' : 'off'}
        </button>
      </header>

      <footer className="scene-footer">
        <div>
          <p className="navigation-hint">Drag to orbit <span>·</span> Scroll to zoom <span>·</span> Right-drag to pan</p>
          <p className="map-attribution">
            © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a>
            {mapState.status === 'ready' && mapState.data.source === 'nearby-fallback' && ' · Nearby buildings (900 m fallback)'}
          </p>
        </div>
        <p className="scale-note">1 unit ≈ 1 meter <span>·</span> Grid {sceneConfig.gridSpacing} m</p>
      </footer>
    </main>
  )
}
