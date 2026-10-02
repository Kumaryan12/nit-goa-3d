import { memo, useMemo } from 'react'
import { miniMapData } from '../lib/minimap'
import type { DigitalTwin } from '../lib/digitalTwin'
import type { BuildingSelection } from '../types/campus'

function MiniMap({ twin, selection, onSelect }: { twin: DigitalTwin | null; selection: BuildingSelection | null; onSelect: (id: string) => void }) {
  const map = useMemo(() => miniMapData(twin), [twin])
  const selected = selection?.location.coordinates
  return <aside className="campus-minimap" aria-label="Campus overview map">
    <div className="minimap-heading"><span className="eyebrow">Campus overview</span><span aria-label="North is up">↑ N</span></div>
    <svg viewBox={map.viewBox} className="minimap-svg" aria-label="Map of campus buildings and roads">
      {map.boundary && <polygon points={map.boundary} className="minimap-campus" />}
      {map.roads.flatMap((road) => road.paths.map((points, i) => <polyline key={`${road.id}/${i}`} points={points} className="minimap-road" vectorEffect="non-scaling-stroke" />))}
      {map.buildings.map((building) => <path key={building.id} d={building.path} fillRule="evenodd" vectorEffect="non-scaling-stroke"
        className={`minimap-building ${selection?.buildingId === building.id ? 'minimap-selected' : ''}`} tabIndex={0} role="button" aria-label={`Select ${building.name}`}
        onClick={() => onSelect(building.locationId)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(building.locationId) } }} />)}
      {selected && <g className="minimap-marker" transform={`translate(${selected.x} ${selected.z})`}>
        <circle r="19" fill="#d88a45" fillOpacity="0.22" /><circle r="7" fill="#e79a51" stroke="#fff" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      </g>}
    </svg>
    {!twin && <span className="minimap-empty">Loading overview...</span>}
    <div className="minimap-legend"><span><i /> Buildings</span><span><i /> Roads</span><span><i /> Selected</span></div>
  </aside>
}
export default memo(MiniMap)
