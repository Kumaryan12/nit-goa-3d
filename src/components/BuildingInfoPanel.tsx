import { useEffect, useRef } from 'react'
import { categoryLabels } from '../types/campus'
import type { BuildingSelection } from '../types/campus'

interface BuildingInfoPanelProps {
  selection: BuildingSelection | null
  onClose: () => void
}

export default function BuildingInfoPanel({ selection, onClose }: BuildingInfoPanelProps) {
  const panelRef = useRef<HTMLElement>(null)

  useEffect(() => {
    if (!selection) return
    panelRef.current?.focus({ preventScroll: true })
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [selection, onClose])

  if (!selection) return null
  const { location, matchMethod } = selection

  return (
    <aside ref={panelRef} className="building-info-panel" aria-labelledby="building-info-title" tabIndex={-1}>
      <div className="building-info-header">
        <span className="building-category">{categoryLabels[location.category]}</span>
        <button type="button" className="panel-close" aria-label="Close building information" onClick={onClose}>
          <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" fill="none">
            <path d="m5 5 10 10M15 5 5 15" />
          </svg>
        </button>
      </div>
      <h2 id="building-info-title">{location.name}</h2>
      <p className="building-description">{location.description}</p>
      {matchMethod === 'proximity' && <p className="building-match-note">Approximate identification based on campus position.</p>}
    </aside>
  )
}
