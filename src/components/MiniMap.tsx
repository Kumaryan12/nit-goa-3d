import { memo, useMemo, useEffect, useRef } from 'react'
import { miniMapData } from '../lib/minimap'
import type { DigitalTwin } from '../lib/digitalTwin'
import type { RoutePresentation } from '../lib/traversal'
import type { LocalCoordinate } from '../lib/geo'
import type { BuildingSelection } from '../types/campus'

function MiniMap({ twin, selection, onSelect, presentation, travelerPosition }: { presentation?: RoutePresentation | null; travelerPosition?: React.RefObject<LocalCoordinate | null>; twin: DigitalTwin | null; selection: BuildingSelection | null; onSelect: (id: string) => void }) {
  const map = useMemo(() => miniMapData(twin), [twin])
  const traveler = useRef<SVGCircleElement>(null)
  useEffect(() => {
    if (!presentation || !travelerPosition) return
    let frame = 0
    const update = () => {
      const p = travelerPosition.current
      if (traveler.current) { traveler.current.style.display = p ? '' : 'none'; if (p) { traveler.current.setAttribute('cx', String(p.x)); traveler.current.setAttribute('cy', String(p.z)) } }
      frame = requestAnimationFrame(update)
    }
    frame = requestAnimationFrame(update); return () => cancelAnimationFrame(frame)
  }, [presentation, travelerPosition])
  const selected = selection?.location.coordinates
  return <aside className="campus-minimap" aria-label="Campus overview map">
    <div className="minimap-heading"><span className="eyebrow">Campus overview</span><span aria-label="North is up">↑ N</span></div>
    <svg viewBox={map.viewBox} className="minimap-svg" aria-label="Map of campus buildings and roads">
      {map.boundary && <polygon points={map.boundary} className="minimap-campus" />}
      {map.roads.flatMap((road) => road.paths.map((points, i) => <polyline key={`${road.id}/${i}`} points={points} className="minimap-road" vectorEffect="non-scaling-stroke" />))}
      {map.buildings.map((building) => <path key={building.id} d={building.path} fillRule="evenodd" vectorEffect="non-scaling-stroke"
        className={`minimap-building ${selection?.buildingId === building.id ? 'minimap-selected' : ''}`} tabIndex={0} role="button" aria-label={`Select ${building.name}`}
        onClick={() => onSelect(building.locationId)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(building.locationId) } }} />)}
      {presentation && <g pointerEvents="none"><polyline points={presentation.route.path.map((p) => `${p.x},${p.z}`).join(' ')} fill="none" stroke="#08a9e0" strokeWidth="3" vectorEffect="non-scaling-stroke" />
      {[ [presentation.start, presentation.route.path[0]], [presentation.route.path.at(-1), presentation.end] ].map(([a,b], i) => a && b && <line key={i} x1={a.x} y1={a.z} x2={b.x} y2={b.z} stroke="#cd8b36" strokeDasharray="3 2" strokeWidth="2" vectorEffect="non-scaling-stroke" />)}
      <circle cx={presentation.start.x} cy={presentation.start.z} r="9" fill="#4ed4ac" stroke="white" strokeWidth="1.5" vectorEffect="non-scaling-stroke" /><circle cx={presentation.end.x} cy={presentation.end.z} r="9" fill="#f29b53" stroke="white" strokeWidth="1.5" vectorEffect="non-scaling-stroke" /><circle ref={traveler} r="8" fill="white" stroke="#007cc2" strokeWidth="2" vectorEffect="non-scaling-stroke" style={{display:'none'}} /></g>}
      {selected && !presentation && <g className="minimap-marker" transform={`translate(${selected.x} ${selected.z})`}>
        <circle r="19" fill="#d88a45" fillOpacity="0.22" /><circle r="7" fill="#e79a51" stroke="#fff" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      </g>}
    </svg>
    {!twin && <span className="minimap-empty">Loading overview...</span>}
    <div className="minimap-legend"><span><i /> Buildings</span><span><i /> Roads</span><span><i /> Selected</span></div>
  </aside>
}
export default memo(MiniMap)
