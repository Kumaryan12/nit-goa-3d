import { useEffect, useRef, useState } from 'react'
import type { CampusLocation } from '../types/campus'
import type { CampusOverride, CampusOverrides } from '../lib/locationOverrides'
import { isOpenPlace } from '../lib/locationOverrides'
import type { LocalCoordinate } from '../lib/geo'
import { localToGps } from '../lib/geo'

export interface MapPickRequest { locationId: string; mode: 'point' | 'building' }
export interface PickedLocation { locationId: string; coordinates: LocalCoordinate; buildingId?: string }
interface Props {
  locations: CampusLocation[]
  locationId: string
  assignedBuildingId: string | null
  picking: MapPickRequest | null
  picked: PickedLocation | null
  edits: CampusOverrides
  onLocation: (id: string) => void
  onPick: (request: MapPickRequest | null) => void
  onSave: (id: string, edit: CampusOverride) => void
  onReset: (id: string) => void
  onClose: () => void
}
export default function CampusLocationEditor({ locations, locationId, assignedBuildingId, picking, picked, edits, onLocation, onPick, onSave, onReset, onClose }: Props) {
  const location = locations.find((item) => item.id === locationId)
  const [name, setName] = useState(''), [x, setX] = useState(''), [z, setZ] = useState(''), [rotation, setRotation] = useState('0')
  const [buildingId, setBuildingId] = useState<string | null>(null), [manualAssignment, setManualAssignment] = useState(false), [message, setMessage] = useState('')
  const panel = useRef<HTMLElement>(null)
  const openPlace = isOpenPlace(locationId)
  const landmark = !locationId.includes('/')
  useEffect(() => {
    if (!location) return
    setName(location.name); setX(String(location.coordinates.x)); setZ(String(location.coordinates.z)); setRotation(String(location.rotationDegrees ?? 0))
    setBuildingId(assignedBuildingId); setManualAssignment(location.osmBuildingId !== undefined)
  }, [location?.id, location?.name, location?.coordinates.x, location?.coordinates.z, location?.rotationDegrees, assignedBuildingId, location?.osmBuildingId])
  useEffect(() => { setMessage('') }, [locationId])
  useEffect(() => {
    if (!picked || picked.locationId !== locationId) return
    setX(String(picked.coordinates.x)); setZ(String(picked.coordinates.z))
    if (picked.buildingId) { setBuildingId(picked.buildingId); setManualAssignment(true) }
    setMessage('Position picked. Save changes to apply it.')
  }, [picked, locationId])
  useEffect(() => {
    panel.current?.focus({ preventScroll: true })
    if (panel.current) panel.current.scrollTop = 0
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape' && !document.querySelector('dialog[open]')) { if (picking) onPick(null); else onClose() } }
    window.addEventListener('keydown', escape); return () => window.removeEventListener('keydown', escape)
  }, [picking, onPick, onClose])
  const exportEdits = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(edits, null, 2) + '\n'], { type: 'application/json' }))
    const link = document.createElement('a'); link.href = url; link.download = 'campus-overrides.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  if (!location) return null
  const point = { x: Number(x), z: Number(z) }, gps = localToGps(point)
  return <aside ref={panel} tabIndex={-1} className={`campus-editor ${picking ? 'is-picking' : ''}`} aria-label="Edit campus locations">
    <div className="building-info-header"><span className="building-category">Edit campus locations</span><button className="panel-close" aria-label="Close campus editor" onClick={onClose}>×</button></div>
    <h2>{location.name}</h2>
    {!picking && <p className="panel-muted">Corrections are saved in this browser. Export them so we can put the confirmed locations into the project for everyone.</p>}
    {!picking && <form onSubmit={(event) => {
      event.preventDefault()
      try {
        const edit: CampusOverride = { name }
        if (openPlace) { edit.coordinates = { x: x.trim() ? Number(x) : NaN, z: z.trim() ? Number(z) : NaN }; edit.rotationDegrees = Number(rotation) }
        else if (landmark && manualAssignment) edit.buildingId = buildingId
        onSave(locationId, edit); setMessage('Saved in this browser. Export corrections to share them.')
      } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to save.') }
    }}>
      <label>Location<select name="edit-location" value={locationId} onChange={(event) => { onPick(null); onLocation(event.target.value) }}>{locations.map((item) => <option key={item.id} value={item.id}>{item.name}{item.id.includes('/') ? ` · ${item.id}` : ''}</option>)}</select></label>
      <label>Name<input name="location-name" required maxLength={100} value={name} onChange={(event) => setName(event.target.value)} /></label>
      {openPlace ? <>
        <div className="coordinate-inputs"><label>X · meters east<input name="location-x" type="number" step="0.01" required value={x} onChange={(event) => setX(event.target.value)} /></label><label>Z · meters south<input name="location-z" type="number" step="0.01" required value={z} onChange={(event) => setZ(event.target.value)} /></label></div>
        <label>Rotation · degrees<input name="location-rotation" type="number" min="-360" max="360" step="1" value={rotation} onChange={(event) => setRotation(event.target.value)} /></label>
        <button type="button" className="navigate-button" onClick={() => onPick({ locationId, mode: 'point' })}>Pick new position on map</button>
        <p className="panel-muted">Drag to orbit and zoom for accuracy, then click the ground. The gold marker previews your pick; Save moves this place.</p>
        <output className="coordinate-readout">X {x}, Z {z} · {Number.isFinite(gps.lat) ? `${gps.lat.toFixed(6)}, ${gps.lon.toFixed(6)}` : 'Invalid coordinates'}</output>
      </> : <>
        <p className="panel-muted">OSM footprint: {buildingId ?? 'Not assigned'}. Real building geometry stays in place.</p>
        {landmark && <button type="button" className="navigate-button" onClick={() => onPick({ locationId, mode: 'building' })}>Choose correct building on map</button>}
        {!landmark && <p className="panel-muted">Rename this footprint here. To label it as Academic Block or another landmark, select that landmark above and choose this building on the map.</p>}
      </>}
      <div className="editor-actions"><button className="navigate-button" type="submit">Save changes</button><button className="fly-button" type="button" onClick={() => { try { onReset(locationId); setName(location.name); setX(String(location.coordinates.x)); setZ(String(location.coordinates.z)); setRotation(String(location.rotationDegrees ?? 0)); setBuildingId(assignedBuildingId); setManualAssignment(location.osmBuildingId !== undefined); setMessage('Local correction reset.') } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to reset.') } }}>Reset local edit</button></div>
    </form>}
    {picking && <div><p role="status">{picking.mode === 'point' ? 'Click the ground at the new position.' : 'Click the correct building footprint.'} You can still drag and zoom.</p><button className="fly-button" onClick={() => onPick(null)}>Cancel picking</button></div>}
    {!picking && <><p className="editor-message" role="status">{message}</p>
    <button className="fly-button" onClick={exportEdits} disabled={!Object.keys(edits).length}>Export corrections</button>
    <p className="panel-muted">Stable location IDs, gallery links and real OSM footprints are preserved. Your corrections are local metadata, not an OpenStreetMap edit.</p></>}
  </aside>
}
