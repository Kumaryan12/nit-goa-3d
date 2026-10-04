import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { categoryLabels } from '../types/campus'
import type { BuildingSelection, CampusLocation } from '../types/campus'
import type { LocalCoordinate } from '../lib/geo'
import { locationDistance, nearbyLocations } from '../lib/locations'
import GalleryPreview from './GalleryPreview'
import BuildingFloorDirectory from './BuildingFloorDirectory'
import type { HostelPlan } from '../lib/hostelInterior'
import { buildingDetails } from '../data/buildingDetails'

interface BuildingInfoPanelProps {
  gyanPlan?: HostelPlan | null
  onEnterGyan?: () => void
  hostelPlan?: HostelPlan | null
  onPlayFootball?: () => void
  onOpenConcert?: () => void
  onEnterHostel?: () => void
  onViewCourtyards?: () => void
  walkMode?: boolean
  onEdit?: (id: string) => void
  onGallery: (id: string, photo?: string) => void
  onUpload: (id: string) => void
  selection: BuildingSelection | null
  locations: CampusLocation[]
  center: LocalCoordinate | null
  onClose: () => void
  onFlyTo: (locationId: string) => void
  onNavigate: () => void
  onSelectLocation: (locationId: string) => void
}

function BuildingInfoPanel({ gyanPlan, onEnterGyan, hostelPlan, onPlayFootball, onOpenConcert, onEnterHostel, onViewCourtyards, walkMode = false, onEdit, onGallery, onUpload, selection, locations, center, onClose, onFlyTo, onNavigate, onSelectLocation }: BuildingInfoPanelProps) {
  const [collapsed, setCollapsed] = useState(false)
  const panelRef = useRef<HTMLElement>(null)
  const nearby = useMemo(() => selection ? nearbyLocations(selection.location, locations) : [], [selection, locations])
  useEffect(() => {
    setCollapsed(false)
    if (!selection) return
    if (panelRef.current) panelRef.current.scrollTop = 0
    panelRef.current?.focus({ preventScroll: true })
    const handleKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && !document.querySelector('dialog[open]')) onClose() }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [selection?.location.id, onClose])
  if (!selection) return null
  const { location, matchMethod } = selection
  const distance = center ? Math.round(locationDistance(location.coordinates, center)) : null
  return <aside ref={panelRef} className={`building-info-panel ${collapsed ? 'panel-collapsed' : ''}`} aria-labelledby="building-info-title" tabIndex={-1}>
    <div className="building-info-header">
      <span className="building-category"><span aria-hidden="true">{location.icon}</span> {categoryLabels[location.category]}</span>
      <div className="panel-heading-actions"><button className="panel-collapse" onClick={() => setCollapsed(!collapsed)} aria-expanded={!collapsed}>{collapsed ? 'Expand' : 'Collapse'}</button><button type="button" className="panel-close" aria-label="Close building information" onClick={onClose}>×</button></div>
    </div>
    <h2 id="building-info-title">{location.name}</h2>
    {!collapsed && <><p className="building-description">{location.description}</p>
    <div className="location-distance"><span aria-hidden="true">◎</span><span>{distance === null ? 'Campus center loading...' : `${distance} m from campus center`}<small>Approximate straight-line distance</small></span></div>
    <div className="panel-actions"><button type="button" className="navigate-button" onClick={onNavigate}>📍 Navigate here</button>
      <button type="button" className="fly-button" onClick={() => onFlyTo(location.id)}>{walkMode ? 'Start walking here ↗' : 'Fly to location ↗'}</button></div>
    {gyanPlan?.locationId===location.id && onEnterGyan && <section className="panel-section"><h3>Explore the classrooms</h3><p className="panel-muted">Ground: rooms 1–15 · First: 16–45 · Second: 46–75. Two open courtyards and a large reading room at the north end of the first floor.</p><p className="building-match-note">Room ranges follow campus information. Interior partitions and furnishings are approximate.</p><button className="navigate-button" onClick={onEnterGyan}>Enter Gyan Mandir →</button></section>}
    {location.id === 'sports-ground' && onPlayFootball && <button className="navigate-button football-join" onClick={onPlayFootball}>⚽ Join live football</button>}
    {location.id === 'open-air-theatre' && onOpenConcert && <button className="navigate-button football-join" onClick={onOpenConcert}>🎤 Open live concert</button>}
    {matchMethod === 'manual' && <p className="building-match-note">Building identity assigned manually in campus metadata.</p>}
    {matchMethod === 'proximity' && <p className="building-match-note">Approximate identification based on campus position.</p>}
    {!selection.buildingId && <p className="building-match-note">Approximate campus location anchor.</p>}
    {location.id === 'boys-hostel' && onViewCourtyards && <button className="navigate-button" onClick={onViewCourtyards}>View courtyards & badminton court ↗</button>}
    {buildingDetails[location.id] && <BuildingFloorDirectory key={location.id} details={buildingDetails[location.id]} plan={location.id === 'boys-hostel' ? hostelPlan : null} onEnter={onEnterHostel} />}
    <section className="panel-section"><h3>Facilities</h3>
      {location.facilities.length ? <ul className="facilities-list">{location.facilities.map((facility) => <li key={facility}>{facility}</li>)}</ul>
        : <p className="panel-muted">Facilities have not yet been assigned.</p>}
    </section>
    {onEdit && <button type="button" className="fly-button" onClick={() => onEdit(location.id)}>Edit name / location</button>}
    <GalleryPreview locationId={location.id} onGallery={onGallery} onUpload={onUpload} />
    <section className="panel-section"><h3>Nearby locations</h3>
      <div className="nearby-locations">{nearby.map((item) => <button type="button" key={item.location.id} onClick={() => onSelectLocation(item.location.id)}>
        <span aria-hidden="true">{item.location.icon}</span><span>{item.location.name}</span><small>{Math.round(item.distance)} m ↗</small>
      </button>)}</div>
    </section></>}
  </aside>
}
export default memo(BuildingInfoPanel)
