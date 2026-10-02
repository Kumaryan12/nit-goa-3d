import { memo, useEffect, useMemo, useRef } from 'react'
import { categoryLabels } from '../types/campus'
import type { BuildingSelection, CampusLocation } from '../types/campus'
import type { LocalCoordinate } from '../lib/geo'
import { locationDistance, nearbyLocations } from '../lib/locations'
import GalleryPreview from './GalleryPreview'

interface BuildingInfoPanelProps {
  selection: BuildingSelection | null
  locations: CampusLocation[]
  center: LocalCoordinate | null
  onClose: () => void
  onFlyTo: (locationId: string) => void
  onNavigate: () => void
  onSelectLocation: (locationId: string) => void
}

function BuildingInfoPanel({ selection, locations, center, onClose, onFlyTo, onNavigate, onSelectLocation }: BuildingInfoPanelProps) {
  const panelRef = useRef<HTMLElement>(null)
  const nearby = useMemo(() => selection ? nearbyLocations(selection.location, locations) : [], [selection, locations])
  useEffect(() => {
    if (!selection) return
    if (panelRef.current) panelRef.current.scrollTop = 0
    panelRef.current?.focus({ preventScroll: true })
    const handleKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [selection?.location.id, onClose])
  if (!selection) return null
  const { location, matchMethod } = selection
  const distance = center ? Math.round(locationDistance(location.coordinates, center)) : null
  return <aside ref={panelRef} className="building-info-panel" aria-labelledby="building-info-title" tabIndex={-1}>
    <div className="building-info-header">
      <span className="building-category"><span aria-hidden="true">{location.icon}</span> {categoryLabels[location.category]}</span>
      <button type="button" className="panel-close" aria-label="Close building information" onClick={onClose}>×</button>
    </div>
    <h2 id="building-info-title">{location.name}</h2>
    <p className="building-description">{location.description}</p>
    <div className="location-distance"><span aria-hidden="true">◎</span><span>{distance === null ? 'Campus center loading...' : `${distance} m from campus center`}<small>Approximate straight-line distance</small></span></div>
    <div className="panel-actions"><button type="button" className="navigate-button" onClick={onNavigate}>📍 Navigate here</button>
      <button type="button" className="fly-button" onClick={() => onFlyTo(location.id)}>Fly to location ↗</button></div>
    {matchMethod === 'proximity' && <p className="building-match-note">Approximate identification based on campus position.</p>}
    {!selection.buildingId && <p className="building-match-note">Approximate campus location anchor.</p>}
    <section className="panel-section"><h3>Facilities</h3>
      {location.facilities.length ? <ul className="facilities-list">{location.facilities.map((facility) => <li key={facility}>{facility}</li>)}</ul>
        : <p className="panel-muted">Facilities have not yet been assigned.</p>}
    </section>
    <GalleryPreview locationId={location.id} />
    <section className="panel-section"><h3>Nearby locations</h3>
      <div className="nearby-locations">{nearby.map((item) => <button type="button" key={item.location.id} onClick={() => onSelectLocation(item.location.id)}>
        <span aria-hidden="true">{item.location.icon}</span><span>{item.location.name}</span><small>{Math.round(item.distance)} m ↗</small>
      </button>)}</div>
    </section>
  </aside>
}
export default memo(BuildingInfoPanel)
