import { useEffect, useRef, useState } from 'react'
import type { CampusSlope, TerrainSettings } from '../data/topography'
import type { LocalCoordinate } from '../lib/geo'
import { MAX_CAMPUS_SLOPES, validateCampusSlope } from '../lib/slopeEdits'

export type SlopeEnd = 'lower' | 'upper'
export interface SlopePreviewPoints { lower: LocalCoordinate | null; upper: LocalCoordinate | null }
export interface SlopePickedPoint { end: SlopeEnd; point: LocalCoordinate; sequence: number }
type Draft = Omit<CampusSlope, 'lower' | 'upper'> & SlopePreviewPoints
const emptyDraft = (): Draft => ({ id: crypto.randomUUID(), name: '', lower: null, upper: null, riseMeters: 4, widthMeters: 40 })

export default function SlopeEditor({ settings, picking, picked, onPick, onChange, onPreview, onView, onClose }: {
  settings: TerrainSettings
  picking: SlopeEnd | null
  picked: SlopePickedPoint | null
  onPick: (end: SlopeEnd | null) => void
  onChange: (settings: TerrainSettings) => void
  onPreview: (points: SlopePreviewPoints | null) => void
  onView: (points: LocalCoordinate[]) => void
  onClose: () => void
}) {
  const [draft, setDraft] = useState<Draft>(emptyDraft), [message, setMessage] = useState('')
  const panel = useRef<HTMLElement>(null), nameInput = useRef<HTMLInputElement>(null)
  useEffect(() => { if (picked) setDraft(current => ({ ...current, [picked.end]: picked.point })) }, [picked])
  useEffect(() => { onPreview({ lower: draft.lower, upper: draft.upper }) }, [draft.lower, draft.upper, onPreview])
  useEffect(() => () => onPreview(null), [onPreview])
  useEffect(() => { panel.current?.focus({ preventScroll: true }) }, [])
  useEffect(() => {
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape' && !document.querySelector('dialog[open]')) { if (picking) onPick(null); else onClose() } }
    window.addEventListener('keydown', escape); return () => window.removeEventListener('keydown', escape)
  }, [picking, onPick, onClose])
  const saved = settings.customSlopes.some(slope => slope.id === draft.id)
  const distance = draft.lower && draft.upper ? Math.hypot(draft.upper.x - draft.lower.x, draft.upper.z - draft.lower.z) : null
  const exportSlopes = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(settings, null, 2) + '\n'], { type: 'application/json' }))
    const link = document.createElement('a'); link.href = url; link.download = 'campus-terrain.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  const choose = (slope: CampusSlope) => { setDraft({ ...slope }); setMessage(''); onPick(null); nameInput.current?.focus() }
  return <aside ref={panel} tabIndex={-1} className={`campus-editor slope-editor ${picking ? 'is-picking' : ''}`} aria-label="Map campus slopes">
    <div className="building-info-header"><span className="building-category">Campus slopes</span><button className="panel-close" aria-label="Close slope editor" onClick={onClose}>×</button></div>
    <h2>{picking ? `Pick the ${picking === 'lower' ? 'lower' : 'higher'} end` : 'Map a slope'}</h2>
    {picking ? <>
      <p role="status">Click the road or ground at the <strong>{picking === 'lower' ? 'lower' : 'higher'}</strong> end. Drag and zoom to position the map.</p>
      <button type="button" className="fly-button" onClick={() => onPick(null)}>Cancel picking</button>
    </> : <>
      <p className="panel-muted">Mark the two ends and estimate how much the road rises. Slopes keep the usual ground colors.</p>
      <form onSubmit={event => {
        event.preventDefault()
        try {
          const slope = validateCampusSlope(draft)
          if (!saved && settings.customSlopes.length >= MAX_CAMPUS_SLOPES) throw new Error(`You can save up to ${MAX_CAMPUS_SLOPES} slopes.`)
          const customSlopes = saved ? settings.customSlopes.map(item => item.id === slope.id ? slope : item) : [...settings.customSlopes, slope]
          onChange({ ...settings, customSlopes }); setDraft(slope); setMessage('Slope applied and saved in this browser.')
        } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to save the slope.') }
      }}>
        <label>Name<input ref={nameInput} name="slope-name" required maxLength={80} placeholder="e.g. Girls Hostel to Faculty Quarters" value={draft.name} onChange={event => setDraft(current => ({ ...current, name: event.target.value }))} /></label>
        <div className="slope-endpoints">
          {(['lower', 'upper'] as const).map(end => <div key={end}>
            <button type="button" className="fly-button" onClick={() => { setMessage(''); onPick(end) }}>{draft[end] ? 'Change' : 'Pick'} {end === 'lower' ? 'lower' : 'higher'} end</button>
            <span>{draft[end] ? `X ${draft[end].x.toFixed(1)}, Z ${draft[end].z.toFixed(1)}` : 'Not marked'}</span>
          </div>)}
        </div>
        <div className="coordinate-inputs">
          <label>Rise · meters<input name="slope-rise" type="number" min={0.5} max={24} step={0.5} required value={draft.riseMeters} onChange={event => setDraft(current => ({ ...current, riseMeters: Number(event.target.value) }))} /></label>
          <label>Width · meters<input name="slope-width" type="number" min={8} max={120} step={1} required value={draft.widthMeters} onChange={event => setDraft(current => ({ ...current, widthMeters: Number(event.target.value) }))} /></label>
        </div>
        {distance !== null && <p className="panel-muted">{Math.round(distance)} m between ends · approximately {Math.round(draft.riseMeters / distance * 100)}% rise. Width controls how far the grade blends into adjacent ground.</p>}
        <div className="editor-actions">
          <button className="navigate-button" type="submit">{saved ? 'Update slope' : 'Save slope'}</button>
          <button className="fly-button" type="button" disabled={!draft.lower || !draft.upper} onClick={() => { if (draft.lower && draft.upper) onView([draft.lower, draft.upper]) }}>View section ↗</button>
        </div>
      </form>
      <p className="editor-message" role="status">{message}</p>
      <div className="slope-list-heading"><h3>Saved slopes ({settings.customSlopes.length})</h3><button type="button" className="text-button" onClick={() => { setDraft(emptyDraft()); setMessage(''); nameInput.current?.focus() }}>+ New slope</button></div>
      {settings.customSlopes.length ? <ul className="saved-slopes">{settings.customSlopes.map(slope => <li key={slope.id}>
        <button type="button" className="slope-list-name" aria-label={`Edit ${slope.name}`} onClick={() => choose(slope)}>{slope.name}<span>{slope.riseMeters} m rise</span></button>
        <button type="button" className="text-button" aria-label={`Remove ${slope.name}`} onClick={() => { onChange({ ...settings, customSlopes: settings.customSlopes.filter(item => item.id !== slope.id) }); if (draft.id === slope.id) setDraft(emptyDraft()); setMessage('Slope removed from this browser.') }}>Remove</button>
      </li>)}</ul> : <p className="panel-muted">No extra slopes marked yet. The existing campus grades remain in Terrain.</p>}
      <button type="button" className="fly-button" onClick={exportSlopes}>Export terrain</button>
      <p className="panel-muted">Saved locally. Export the marked slopes to include them in the shared campus. Heights are estimates; steep settings can limit avatar walking.</p>
    </>}
  </aside>
}
