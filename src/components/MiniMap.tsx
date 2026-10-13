import { memo, useMemo, useEffect, useRef } from 'react'
import { miniMapData } from '../lib/minimap'
import type { DigitalTwin } from '../lib/digitalTwin'
import type { RoutePresentation } from '../lib/traversal'
import type { LocalCoordinate } from '../lib/geo'
import type { BuildingSelection } from '../types/campus'
import { canalPoint } from '../lib/canal'
import { THEATRE_OUTER_RADIUS } from '../lib/theatre'

function MiniMap({ twin, selection, onSelect, presentation, travelerPosition, avatarPosition }: { avatarPosition?: React.RefObject<LocalCoordinate | null>; presentation?: RoutePresentation | null; travelerPosition?: React.RefObject<LocalCoordinate | null>; twin: DigitalTwin | null; selection: BuildingSelection | null; onSelect: (id: string) => void }) {
  const map = useMemo(() => miniMapData(twin), [twin])
  const traveler = useRef<SVGCircleElement>(null)
  useEffect(() => {
    const markerPosition = avatarPosition ?? (presentation ? travelerPosition : undefined)
    if (!markerPosition) return
    let frame = 0
    const update = () => {
      const p = markerPosition.current
      if (traveler.current) { traveler.current.style.display = p ? '' : 'none'; if (p) { traveler.current.setAttribute('cx', String(p.x)); traveler.current.setAttribute('cy', String(p.z)) } }
      frame = requestAnimationFrame(update)
    }
    frame = requestAnimationFrame(update); return () => cancelAnimationFrame(frame)
  }, [presentation, travelerPosition, avatarPosition])
  const selected = selection?.location.coordinates
  return <aside className="campus-minimap" aria-label="Campus overview map">
    <div className="minimap-heading"><span className="eyebrow">Campus overview</span><span aria-label="North is up">↑ N</span></div>
    <svg viewBox={map.viewBox} className="minimap-svg" aria-label="Map of campus buildings and roads">
      {map.boundary && <polygon points={map.boundary} className="minimap-campus" />}
      {twin?.canal && <polyline points={[-1, 1].map(side => canalPoint(twin.canal!, side * twin.canal!.length / 2)).map(p => `${p.x},${p.z}`).join(' ')}
        fill="none" stroke="#4f969c" strokeWidth="2" vectorEffect="non-scaling-stroke" pointerEvents="none" aria-label="Entrance canal" />}
      {map.roads.flatMap((road) => road.paths.map((points, i) => <polyline key={`${road.id}/${i}`} points={points} className="minimap-road" vectorEffect="non-scaling-stroke" />))}
      {twin?.flag && <g transform={`translate(${twin.flag.x} ${twin.flag.z})`} pointerEvents="none" role="img" aria-label="Indian national flag opposite Administration Block">
        <circle r="5" fill="#fff" stroke="#000080" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        <path d="M0 4 V-13 L13 -13 L13 -5 L0 -5" fill="#fff" stroke="#34465a" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        <path d="M1 -12.5 H12.5 V-10 H1 Z" fill="#ff9933" />
        <path d="M1 -8 H12.5 V-5.5 H1 Z" fill="#138808" />
        <circle cx="6.5" cy="-9" r="1" fill="#000080" />
      </g>}
      {map.buildings.map((building) => <path key={building.id} d={building.path} fillRule="evenodd" vectorEffect="non-scaling-stroke"
        className={`minimap-building ${selection?.buildingId === building.id ? 'minimap-selected' : ''}`} tabIndex={0} role="button" aria-label={`Select ${building.name}`}
        onClick={() => onSelect(building.locationId)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(building.locationId) } }} />)}
      {twin?.theatre && <g transform={`translate(${twin.theatre.center.x} ${twin.theatre.center.z}) rotate(${-twin.theatre.rotation * 180 / Math.PI}) scale(${twin.theatre.widthScale} ${twin.theatre.depthScale})`}
        role="button" tabIndex={0} aria-label="Select Open Air Theatre" onClick={() => onSelect('open-air-theatre')}
        onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect('open-air-theatre') } }}>
        <path d={`M${-THEATRE_OUTER_RADIUS} 0 A${THEATRE_OUTER_RADIUS} ${THEATRE_OUTER_RADIUS} 0 0 0 ${THEATRE_OUTER_RADIUS} 0 L4.8 -4 L-4.8 -4 Z`}
          fill={selection?.location.id === 'open-air-theatre' ? '#d88a45' : '#ad8466'} stroke="#ede3cc" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      </g>}
      {presentation && <g pointerEvents="none"><polyline points={presentation.route.path.map((p) => `${p.x},${p.z}`).join(' ')} fill="none" stroke="#08a9e0" strokeWidth="3" vectorEffect="non-scaling-stroke" />
      {[ [presentation.start, presentation.route.path[0]], [presentation.route.path.at(-1), presentation.end] ].map(([a,b], i) => a && b && <line key={i} x1={a.x} y1={a.z} x2={b.x} y2={b.z} stroke="#cd8b36" strokeDasharray="3 2" strokeWidth="2" vectorEffect="non-scaling-stroke" />)}
      <circle cx={presentation.start.x} cy={presentation.start.z} r="9" fill="#4ed4ac" stroke="white" strokeWidth="1.5" vectorEffect="non-scaling-stroke" /><circle cx={presentation.end.x} cy={presentation.end.z} r="9" fill="#f29b53" stroke="white" strokeWidth="1.5" vectorEffect="non-scaling-stroke" /></g>}
      {(presentation || avatarPosition) && <circle ref={traveler} r="8" fill="#fff" stroke="#007cc2" strokeWidth="2" vectorEffect="non-scaling-stroke" style={{display:'none'}} pointerEvents="none" aria-label="Your position" />}
      {selected && !presentation && <g className="minimap-marker" transform={`translate(${selected.x} ${selected.z})`}>
        <circle r="19" fill="#d88a45" fillOpacity="0.22" /><circle r="7" fill="#e79a51" stroke="#fff" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      </g>}
    </svg>
    {!twin && <span className="minimap-empty">Loading overview...</span>}
    <div className="minimap-legend"><span><i /> Buildings</span><span><i /> Roads</span><span><i /> Selected</span>{avatarPosition && <span className="minimap-you"><i /> You</span>}</div>
  </aside>
}
export default memo(MiniMap)
