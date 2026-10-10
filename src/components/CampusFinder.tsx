import { useLayoutEffect, useRef } from 'react'
import type { CampusPose } from '../lib/campusProtocol'
import type { CampusLiveSession } from '../hooks/useCampusSession'
import type { FinderLandmark } from '../lib/peopleFinder'
import { usePeopleFinder } from '../hooks/usePeopleFinder'
import './people-finder.css'

export default function CampusFinder({ live, pose, landmarks, enabled, onToggle, targetId, onFind, onOpenPeople }: {
  live: CampusLiveSession; pose: React.RefObject<CampusPose | null>; landmarks: FinderLandmark[]; enabled: boolean; onToggle: () => void;
  targetId: string | null; onFind: (id: string | null) => void; onOpenPeople: () => void
}) {
  const people = usePeopleFinder(live.session, pose, landmarks, live.muted, enabled)
  const target = people.find(p => p.person.id === targetId)
  const anotherFloor = target && !target.sameSpace && pose.current?.space !== 'outdoors' && pose.current?.space.split(':')[0] === target.person.pose?.space.split(':')[0]
  const root = useRef<HTMLElement>(null)
  useLayoutEffect(() => {
    const element = root.current, explorer = element?.closest<HTMLElement>('.explorer')
    if (!element || !explorer) return
    const measure = () => explorer.style.setProperty('--people-finder-height', `${element.offsetHeight}px`)
    measure(); const observer = new ResizeObserver(measure); observer.observe(element)
    return () => { observer.disconnect(); explorer.style.removeProperty('--people-finder-height') }
  }, [])
  return <aside ref={root} className={`people-finder ${enabled ? '' : 'finder-muted'}`} aria-label="Find people on campus">
    <div className="finder-heading"><button className="finder-open" onClick={onOpenPeople}>⌖ People {enabled && <span>{people.length}</span>}</button><button className="finder-toggle" aria-pressed={enabled} aria-label={enabled ? 'Mute people finder' : 'Show people finder'} onClick={onToggle}>{enabled ? 'On' : 'Muted'}</button></div>
    {enabled && <>
      <label className="sr-only" htmlFor="campus-find-person">Find a person</label>
      <select id="campus-find-person" value={target ? targetId! : ''} onChange={event => onFind(event.target.value || null)}>
        <option value="">{people.length ? 'Find someone…' : live.connection === 'live' ? 'No shared locations yet' : 'Waiting for live campus…'}</option>
        {people.map(p => <option key={p.person.id} value={p.person.id}>{p.person.name} · {Math.round(p.distance)} m</option>)}
      </select>
      {target ? <div className="finder-target"><span className="finder-arrow" style={{ transform: anotherFloor ? undefined : `rotate(${target.bearing}rad)` }} aria-hidden="true">{anotherFloor ? '↕' : '↑'}</span><div><strong>{anotherFloor ? 'On another floor' : `${Math.round(target.distance)} m ${target.sameSpace ? 'away' : 'across campus'}`}</strong><span>{target.location}</span>{!target.sameSpace && <small>{anotherFloor ? 'Use the stairs or lift' : 'Enter their building / floor'}</small>}</div><button aria-label="Stop finding this person" onClick={() => onFind(null)}>×</button></div> : targetId ? <p className="finder-empty" role="status">Location unavailable. Choose another person.</p> : null}
    </>}
  </aside>
}
