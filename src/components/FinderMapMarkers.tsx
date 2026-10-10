import { CAMPUS_COLORS } from '../lib/campusProtocol'
import type { CampusPose } from '../lib/campusProtocol'
import type { CampusLiveSession } from '../hooks/useCampusSession'
import type { FinderLandmark } from '../lib/peopleFinder'
import { usePeopleFinder } from '../hooks/usePeopleFinder'

export interface FinderMapProps {
  live: CampusLiveSession; pose: React.RefObject<CampusPose | null>; landmarks: FinderLandmark[]; enabled: boolean;
  targetId: string | null; onFind: (id: string | null) => void
}
export default function FinderMapMarkers({ live, pose, landmarks, enabled, targetId, onFind }: FinderMapProps) {
  const people = usePeopleFinder(live.session, pose, landmarks, live.muted, enabled)
  const target = people.find(p => p.person.id === targetId), own = pose.current
  return <g aria-label="Live people on campus">
    {target?.person.pose && own && <line x1={own.x} y1={own.z} x2={target.person.pose.x} y2={target.person.pose.z} stroke={CAMPUS_COLORS[target.person.color]} strokeWidth="2" strokeDasharray="4 3" vectorEffect="non-scaling-stroke" pointerEvents="none"/>}
    {people.map(({ person, location }) => <g key={person.id} transform={`translate(${person.pose!.x} ${person.pose!.z})`} className="finder-map-marker" role="button" tabIndex={0} aria-label={`Find ${person.name}, ${location}`} onClick={event => { event.stopPropagation(); onFind(person.id) }} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); onFind(person.id) } }}>
      <title>{person.name} · {location}</title><circle className="finder-hit" r="22"/>
      {person.id === targetId && <circle r="16" fill={CAMPUS_COLORS[person.color]} fillOpacity=".2" stroke="white" strokeWidth="1" vectorEffect="non-scaling-stroke"/>}
      <circle r="8" fill={CAMPUS_COLORS[person.color]} stroke="white" strokeWidth="2" vectorEffect="non-scaling-stroke"/>
    </g>)}
  </g>
}
