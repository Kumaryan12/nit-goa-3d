// Production control panel with a local-only, synthetic room; no network access.
import { useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import WalkControls from '../../src/components/WalkControls'
import type { CampusLiveSession } from '../../src/hooks/useCampusSession'
import type { WalkStatus } from '../../src/lib/walking'
import type { CampusLocation } from '../../src/types/campus'
import { emptyWalkInput } from '../../src/lib/walking'
import '../../src/styles.css'
import '../../src/components/campus-panels.css'
function Preview() {
  const input = useRef(emptyWalkInput()), session = useRef({ id: null, snapshot: null })
  const [paused, setPaused] = useState(false), [compact, setCompact] = useState(false)
  const [status, setStatus] = useState<WalkStatus>({ position: { x: 0, z: 0 }, nearestId: 'nescafe', distance: 3.9, moving: false, blocked: false, canRide: true, canJump: true, vehicle: 'walk' })
  const locations = [{ id: 'main-entrance', name: 'Main Entrance' }, { id: 'nescafe', name: 'Nescafé' }].map(p => ({ ...p, coordinates: { x: 0, z: 0 }, category: 'amenity', keywords: [], description: '', icon: '', images: [], facilities: [] })) as CampusLocation[]
  const live = { session, ridePending: false, rideError: '' } as unknown as CampusLiveSession
  return <main className="explorer night-mode" style={{background:'#203530'}}>
    <p style={{padding:20,color:'#e5eee4'}}>Local control layout · use browser device emulation to compare touch controls.</p>
    <button style={{marginLeft:20}} onClick={() => setCompact(v => !v)}>Toggle compact panel</button>
    <WalkControls compact={compact} campusLive={live} input={input} status={status} paused={paused} ready locations={locations} onPause={() => setPaused(v => !v)} onSpawn={id => { setPaused(false); setStatus(s => ({...s,nearestId:id,distance:0})) }} onInspect={id => setStatus(s => ({...s,nearestId:id,distance:0}))} onOverview={() => {}} />
  </main>
}
if (import.meta.env.DEV) createRoot(document.getElementById('root')!).render(<Preview />)
