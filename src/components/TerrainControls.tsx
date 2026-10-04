import { useEffect, useId, useRef, useState } from 'react'
import { defaultTerrainSettings } from '../data/topography'
import type { TerrainSettings } from '../data/topography'

const heightControls = [
  { key: 'nescafeRiseMeters', label: 'Nescafe above Sports', min: 2, max: 24 },
  { key: 'gateRiseMeters', label: 'Gate to Admin · two rises', min: 0, max: 16 },
  { key: 'girlsRoadRiseMeters', label: 'Faculty Quarters above Girls Hostel', min: 0, max: 12 },
] as const

export default function TerrainControls({ settings, onChange, onOpenChange, onViewSlope, onViewCampusSlope, onEditSlopes }: {
  settings: TerrainSettings
  onChange: (settings: TerrainSettings) => void
  onOpenChange: (open: boolean) => void
  onViewSlope?: () => void
  onViewCampusSlope?: (section: 'gate' | 'faculty') => void
  onEditSlopes?: () => void
}) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<TerrainSettings>(settings)
  const root = useRef<HTMLDivElement>(null), toggle = useRef<HTMLButtonElement>(null)
  const panelId = useId(), noteId = useId()
  const close = () => { setOpen(false); toggle.current?.focus() }
  useEffect(() => { onOpenChange(open); return () => onOpenChange(false) }, [open, onOpenChange])

  useEffect(() => {
    if (!open) return
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false)
    }
    window.addEventListener('pointerdown', outside)
    return () => window.removeEventListener('pointerdown', outside)
  }, [open])

  return <div className="terrain-controls" ref={root}>
    <button type="button" ref={toggle} className="toolbar-button" aria-expanded={open} aria-controls={panelId}
      onClick={() => { if (!open) setDraft({ ...settings }); setOpen(!open) }}>Terrain</button>
    {open && <form id={panelId} className="terrain-controls-panel" aria-label="Campus terrain settings" aria-describedby={noteId}
      onKeyDown={event => { event.stopPropagation(); if (event.key === 'Escape') { event.preventDefault(); close() } }}
      onSubmit={event => { event.preventDefault(); onChange({ ...draft }); close() }}>
      <div className="terrain-controls-heading">
        <h2>Campus terrain</h2>
        <button type="button" className="panel-close" aria-label="Close terrain settings" onClick={close}>×</button>
      </div>
      <p id={noteId} className="terrain-controls-note">Approximate relative heights. Adjust these estimates to match the campus you know.</p>
      {heightControls.map(control => {
        const id = `${panelId}-${control.key}`
        return <div className="terrain-height-control" key={control.key}>
          <label htmlFor={id}>{control.label}<output htmlFor={id}>{draft[control.key]} m</output></label>
          <input id={id} type="range" min={control.min} max={control.max} step={1} value={draft[control.key]}
            aria-valuetext={`${draft[control.key]} meters`}
            onChange={event => setDraft(current => ({ ...current, [control.key]: Number(event.target.value) }))} />
        </div>
      })}
      <label className="terrain-contour-toggle"><input type="checkbox" checked={draft.showContours}
        onChange={event => setDraft(current => ({ ...current, showContours: event.target.checked }))} />Show height contours</label>
      <div className="terrain-legend" aria-label="Terrain colors">
        <span><i className="terrain-legend-terrace" />Level terrace</span>
        <span><i className="terrain-legend-grass" />Grass</span>
      </div>
      <div className="terrain-controls-actions">
        <button type="button" className="fly-button" onClick={() => setDraft({ ...defaultTerrainSettings })}>Reset defaults</button>
        <button type="submit" className="navigate-button">Apply terrain</button>
      </div>
      <button type="button" className="fly-button terrain-view-slope" disabled={!onViewSlope}
        onClick={() => { onChange({ ...draft }); onViewSlope?.(); close() }}>View Nescafe–Sports slope ↗</button>
      {(['gate', 'faculty'] as const).map(section => <button key={section} type="button" className="fly-button terrain-view-slope" disabled={!onViewCampusSlope}
        onClick={() => { onChange({ ...draft }); onViewCampusSlope?.(section); close() }}>View {section === 'gate' ? 'Gate–Admin rises' : 'Girls–Faculty climb'} ↗</button>)}
      <button type="button" className="navigate-button terrain-view-slope" disabled={!onEditSlopes}
        onClick={() => { onChange({ ...draft }); onEditSlopes?.(); close() }}>Map campus slopes ({settings.customSlopes.length})</button>
      <p className="terrain-controls-hint">Apply or view slope to save in this browser. Contours show 2 m intervals.</p>
    </form>}
  </div>
}
