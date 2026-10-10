// Development-only simulated visitors. No accounts or network identity.
import { useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import CampusFinder from '../../src/components/CampusFinder'
import CampusSocial from '../../src/components/CampusSocial'
import MiniMap from '../../src/components/MiniMap'
import { createDigitalTwin } from '../../src/lib/digitalTwin'
import { extractBuildingFootprints } from '../../src/lib/buildings'
import { extractCampusRoads } from '../../src/lib/roads'
import { savedCampusOverrides } from '../../src/data/campusOverrides'
import type { CampusLiveSession } from '../../src/hooks/useCampusSession'
import type { CampusPerson, CampusPose, CampusSession } from '../../src/lib/campusProtocol'
import campus from './nit-goa-campus.json'
import roads from './nit-goa-roads.json'
import '../../src/styles.css'
import '../../src/components/campus-panels.css'

const boundary = roads.elements.find(e => e.id === 1259742369)!.geometry!
const twin = createDigitalTwin({ buildings: extractBuildingFootprints(campus.elements), boundary, source: 'campus-area', returnedBuildingCount: 22 }, { roads: extractCampusRoads(roads.elements, boundary), boundary, source: 'campus-area', returnedRoadCount: 20 }, true, savedCampusOverrides)
const start: CampusPose = { x: 50, y: 0, z: -90, yaw: 0, moving: false, running: false, active: true, visible: true, space: 'outdoors', epoch: 1 }
const people: CampusPerson[] = [
  { id: 'me', name: 'You', color: 'forest', handle: null, activity: 'walk', pose: start },
  { id: 'aryan', name: 'Aryan', color: 'ocean', handle: null, activity: 'walk', pose: { ...start, x: 75, z: -120 } },
  { id: 'maya', name: 'Maya', color: 'coral', handle: null, activity: 'walk', pose: { ...start, x: 18, z: -380, space: 'hostel:2', y: 6.4 } },
]
function Preview() {
  const session = useRef<CampusSession>({ id: 'me', snapshot: null }), pose = useRef<CampusPose | null>(start), position = useRef(start)
  const [muted, setMuted] = useState(new Set<string>()), [enabled, setEnabled] = useState(true), [shareLocator, setShareLocator] = useState(true)
  const [targetId, setTarget] = useState<string | null>(null), [open, setOpen] = useState(false), [hidden, setHidden] = useState(false), [online, setOnline] = useState(true), [departed, setDeparted] = useState(false)
  const roster = useMemo(() => people.filter(p => !departed || p.id !== 'maya').map(p => ({ ...p, locatorVisible: p.id === 'aryan' ? !hidden : p.id === 'me' ? shareLocator : true })), [departed, hidden, shareLocator])
  useEffect(() => {
    let sequence = 0
    const update = () => {
      if (!online) { session.current.snapshot = null; return }
      session.current.snapshot = { type: 'campus-state', sequence: ++sequence, serverTime: Date.now(), people: roster.map(p => p.id === 'aryan' ? { ...p, pose: { ...p.pose!, x: 75 + Math.sin(Date.now() / 4000) * 6 } } : p) }
      session.current.snapshotReceivedAt = performance.now()
    }
    update(); const timer = window.setInterval(update, 100); return () => clearInterval(timer)
  }, [roster, online])
  const live = { session, muted, toggleMute: (id: string) => setMuted(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next }), shareLocator, setShareLocator, locatorError: '', people: roster, connection: online ? 'live' : 'offline', messages: [], error: '', queue: 0, clearError: () => {}, rejoin: () => setOnline(true), sendChat: () => false, socialAction: () => false, socialError: '', socialPending: false, socialPreview: true, rideBuggy: () => {}, rideError: '' } satisfies CampusLiveSession
  const find = (id: string | null) => { setTarget(id); setEnabled(true); setOpen(false) }
  return <main className={`explorer walk-mode ${open ? 'social-open' : ''}`} style={{ height: '100dvh', background: 'linear-gradient(145deg,#bddbc0,#6caa86)' }}>
    <header className="scene-header"><div><h1>People finder</h1><small>Simulated visitors · local only</small></div><div className="scene-toolbar"><button onClick={() => setHidden(!hidden)}>Hide Aryan</button><button onClick={() => setDeparted(!departed)}>Remove Maya</button><button onClick={() => setOnline(!online)}>Disconnect</button></div></header>
    <CampusFinder live={live} pose={pose} landmarks={twin.locations} enabled={enabled} onToggle={() => setEnabled(!enabled)} targetId={targetId} onFind={find} onOpenPeople={() => setOpen(true)}/>
    <MiniMap twin={twin} selection={null} onSelect={() => {}} avatarPosition={position} finder={{ live, pose, landmarks: twin.locations, enabled: enabled && !open, targetId, onFind: find }}/>
    <CampusSocial live={live} open={open} onClose={() => setOpen(false)} pose={pose} walking landmarks={twin.locations} finderEnabled={enabled} onToggleFinder={() => setEnabled(!enabled)} targetId={targetId} onFind={find}/>
  </main>
}
if (import.meta.env.DEV) createRoot(document.getElementById('root')!).render(<Preview/>);
