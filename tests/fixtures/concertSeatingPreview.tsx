// Local rendering rehearsal using the real avatar controller and campus geometry.
// No authentication bypass, microphone capture or production-room mutations.
import { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Canvas } from '@react-three/fiber'
import { createDigitalTwin } from '../../src/lib/digitalTwin'
import type { DigitalTwin } from '../../src/lib/digitalTwin'
import { extractBuildingFootprints } from '../../src/lib/buildings'
import { extractCampusRoads } from '../../src/lib/roads'
import { savedCampusOverrides } from '../../src/data/campusOverrides'
import { createConcertLayout, concertPlacement } from '../../src/lib/concertSeating'
import type { OatSnapshot } from '../../src/lib/oatProtocol'
import type { CampusPose, CampusSession } from '../../src/lib/campusProtocol'
import { emptyWalkInput } from '../../src/lib/walking'
import { createFootballControls } from '../../src/lib/football'
import AvatarExplorer from '../../src/components/AvatarExplorer'
import OatConcertScene from '../../src/components/OatConcertScene'
import OpenAirTheatre from '../../src/components/OpenAirTheatre'

function Rehearsal({ twin }: { twin: DigitalTwin }) {
  const [joined, setJoined] = useState(false), [stage, setStage] = useState(false), [spawn, setSpawn] = useState(0), [report, setReport] = useState('Waiting for the scene')
  const input = useRef(emptyWalkInput()), position = useRef<{ x: number; z: number } | null>(null), pose = useRef<CampusPose | null>(null)
  const interior = useRef(null), processed = useRef(-1), football = useRef(createFootballControls()), session = useRef<CampusSession>({ id: 'you', snapshot: null })
  const layout = createConcertLayout(twin.theatre)
  const concert: OatSnapshot | null = joined ? { type: 'state', sequence: 1, serverTime: Date.now(), participants: [{ id: 'singer', name: 'Singer', seat: 0 }, { id: 'you', name: 'You', seat: 1 }], performerId: stage ? 'you' : 'singer', queue: [], micOn: false, concertTitle: 'Seating rehearsal', music: { url: '', title: '', position: 0, duration: 0, playing: false, updatedAt: Date.now() } } : null
  const placement = concertPlacement(layout, concert, 'you')
  useEffect(() => {
    const timer = setInterval(() => {
      const current = pose.current
      if (!current) return
      const fixed = placement && Math.hypot(current.x - placement.x, current.z - placement.z) < .001 && Math.abs(current.y - placement.y) < .001
      setReport(`${joined ? fixed ? 'PASS: avatar at assigned ' + placement!.role + ' position' : 'FAIL: avatar drifted' : 'Walking outside concert'} · ${current.x.toFixed(2)}, ${current.y.toFixed(2)}, ${current.z.toFixed(2)} · ${current.moving ? 'moving' : 'stationary'}`)
    }, 200)
    return () => clearInterval(timer)
  }, [joined, placement?.role, placement?.x, placement?.z])
  return <main style={{ height: '100dvh', display: 'grid', gridTemplateRows: 'auto minmax(0,1fr)', background: '#e5ede1' }}>
    <div style={{ padding: 16, fontFamily: 'system-ui' }}><h1>Concert seating rehearsal</h1><p role="status">{report}</p>
      <button onClick={() => { setJoined(true); setStage(false) }}>Join as audience</button>
      <button disabled={!joined} onClick={() => setStage(true)}>Take the stage</button>
      <button disabled={!joined} onClick={() => setStage(false)}>Return to audience seat</button>
      <button onClick={() => { setJoined(false); setStage(false); setSpawn(n => n + 1) }}>Leave concert</button>
      <button onPointerDown={() => { input.current.forward = 1; input.current.jump = true; input.current.vehicle = 'buggy' }} onPointerUp={() => { input.current = emptyWalkInput() }}>Hold movement / jump / buggy input</button>
    </div>
    <Canvas camera={{ position: [layout.seats[1].x, layout.seats[1].y + 12, layout.seats[1].z + 12], fov: 60 }} dpr={1}>
      <color attach="background" args={['#dce8de']} /><ambientLight intensity={1.7} /><directionalLight position={[40, 80, 10]} intensity={2} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[twin.theatre.center.x, twin.theatre.elevation - .02, twin.theatre.center.z]}><planeGeometry args={[200, 200]} /><meshStandardMaterial color="#749269" /></mesh>
      <OpenAirTheatre theatre={twin.theatre} terrain={twin.terrain} night={false} selected={false} onSelect={() => {}} />
      <OatConcertScene theatre={twin.theatre} concert={concert} people={[]} session={session} selfId="you" />
      <AvatarExplorer avatarStyle="boy" concertJoined={joined} concertPose={placement} campusSession={session} campusPose={pose} onSocialStop={() => {}} onBuggyRide={() => {}} footballPitch={null} footballControls={football} footballLive={false} hostelPlan={null} gyanPlan={null} interiorPose={interior} processedSpawn={processed} twin={twin} paused={false} input={input} position={position} spawn={{ sequence: spawn, locationId: 'open-air-theatre' }} onStatus={() => {}} onInspect={() => {}} />
    </Canvas>
  </main>
}
async function run() {
  const [campus, roads] = await Promise.all(['campus', 'roads'].map(async kind => (await fetch(`/map/nit-goa-${kind}.json`)).json()))
  const boundary = campus.elements.find((e: { id: number }) => e.id === 1259742369).geometry, buildings = extractBuildingFootprints(campus.elements), segments = extractCampusRoads(roads.elements, boundary)
  const twin = createDigitalTwin({ buildings, boundary, source: 'campus-area', returnedBuildingCount: buildings.length }, { roads: segments, boundary, source: 'campus-area', returnedRoadCount: segments.length }, false, savedCampusOverrides)
  createRoot(document.getElementById('root')!).render(<Rehearsal twin={twin} />)
}
if (import.meta.env.DEV) void run()
