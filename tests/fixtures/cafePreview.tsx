import CafeCounter from '../../src/components/CafeCounter'
import CampusUpdateNotice from '../../src/components/CampusUpdateNotice'
import { cafeCounters } from '../../src/lib/cafe'
// Development-only rendering rehearsal, using the actual café meshes, avatar
// controller and local social preview. Never connects to production rooms.
import { useCallback, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { createDigitalTwin } from '../../src/lib/digitalTwin'
import type { DigitalTwin } from '../../src/lib/digitalTwin'
import { extractBuildingFootprints } from '../../src/lib/buildings'
import { extractCampusRoads } from '../../src/lib/roads'
import { savedCampusOverrides } from '../../src/data/campusOverrides'
import { cafePoint } from '../../src/lib/cafe'
import { emptyWalkInput } from '../../src/lib/walking'
import type { WalkStatus } from '../../src/lib/walking'
import { createFootballControls } from '../../src/lib/football'
import { nearbySeat } from '../../src/lib/social'
import { useCampusSession } from '../../src/hooks/useCampusSession'
import type { CampusPose } from '../../src/lib/campusProtocol'
import CampusCafe from '../../src/components/CampusCafe'
import OSMBuildings from '../../src/components/OSMBuildings'
import Vegetation from '../../src/components/Vegetation'
import Terrain from '../../src/components/Terrain'
import AvatarExplorer from '../../src/components/AvatarExplorer'
import StudentAvatar from '../../src/components/StudentAvatar'
import type { AvatarMotion } from '../../src/lib/avatarMotion'
import { createTerrainPatches } from '../../src/lib/terrainPatches'

function Friend({ twin, slot }: { twin: DigitalTwin; slot: number }) {
  const seat = twin.terrain.cafe!.seats[slot]
  const motion = useRef<AvatarMotion>({ phase: 0, moving: false, speed: 0, social: { action: 'sit', seatId: seat.id, seatHeight: .44, startedAt: Date.now() - 1000, until: Date.now() + 1200000 } })
  return <group position={[seat.x, seat.y, seat.z]} rotation={[0, seat.yaw, 0]}><StudentAvatar style={slot % 2 ? 'girl' : 'boy'} motion={motion} jersey={slot % 2 ? '#996147' : '#367064'} /></group>
}
function Metrics({ report }: { report: (value: string) => void }) {
  const elapsed = useRef(0), frames = useRef(0)
  useFrame(({ gl }, dt) => { elapsed.current += dt; frames.current++; if (elapsed.current > 2) { report(`${Math.round(frames.current / elapsed.current)} fps · ${gl.info.render.calls} draw calls`); elapsed.current = 0; frames.current = 0 } })
  return null
}
function Rehearsal({ twin }: { twin: DigitalTwin }) {
  const [night, setNight] = useState(false), [walking, setWalking] = useState(false), [metrics, setMetrics] = useState('Loading'), [status, setStatus] = useState('Drag to look around')
  const [updatesOpen, setUpdatesOpen] = useState(false), [voicePreview, setVoicePreview] = useState(false)
  const voiceListeners = useRef(new Set<(event: unknown) => void>()), voiceSession = useRef<string | null>(null)
  const subscribeVoicePreview = useCallback((listener: (event: unknown) => void) => { voiceListeners.current.add(listener); return () => { voiceListeners.current.delete(listener) } }, [])
  // One local listening-only caller exercises the real confirmation hook.
  // No peer links, production identity or real microphone are needed.
  const sendVoicePreview = useCallback((value: unknown) => {
    const message = value as { type: string }
    queueMicrotask(() => {
      const publish = (event: unknown) => voiceListeners.current.forEach(listener => listener(event))
      if (message.type === 'cafe-voice-join') {
        voiceSession.current = crypto.randomUUID()
        publish({ type: 'cafe-voice-state', table: 0, sessionId: voiceSession.current, members: [{ id: 'local-preview', name: 'Preview', sessionId: voiceSession.current, mic: false }] })
        publish({ type: 'cafe-voice-ice', sessionId: voiceSession.current, configuration: { iceServers: [{ urls: ['stun:stun.cloudflare.com:3478'] }], expiresAt: Date.now() + 600000 } })
      }
      if (message.type === 'cafe-voice-leave') { voiceSession.current = null; publish({ type: 'cafe-voice-state', table: null, sessionId: null, members: [] }) }
    })
    return true
  }, [])
  const closeUpdates = useCallback(() => setUpdatesOpen(false), [])
  const input = useRef(emptyWalkInput()), position = useRef<{ x: number; z: number } | null>(cafePoint(twin.terrain.cafe!, 0, 5.25)), pose = useRef<CampusPose | null>(null), interior = useRef(null), processed = useRef(0), football = useRef(createFootballControls())
  const cafe = twin.terrain.cafe!, counters = useMemo(() => cafeCounters(cafe, twin.terrain), [cafe, twin]), live = useCampusSession(false, pose, walking, 'walk', true, cafe.seats, counters)
  const cafeLive = { ...live, connection: voicePreview ? 'live' as const : live.connection, subscribeCafeVoice: subscribeVoicePreview, sendCafeVoice: sendVoicePreview }
  const patches = useMemo(() => createTerrainPatches(twin.terrain), [twin])
  const center = cafePoint(cafe, 0, 5)
  // Show both owner-confirmed serving sides together: counter and shared tables.
  const camera = { x: cafe.front.center.x + cafe.front.outward.x * 24 + cafe.terrace.outward.x * 18, z: cafe.front.center.z + cafe.front.outward.z * 24 + cafe.terrace.outward.z * 18 }
  const seated = live.people[0]?.social?.action === 'sit'
  const spawn = useMemo(() => ({ sequence: 0, locationId: cafe.buildingId }), [cafe])
  const onStatus = useCallback((s: WalkStatus) => setStatus(s.blocked ? 'Furniture is solid · walk around the chairs' : 'WASD to move · walk beside a chair to sit'), [])
  const sit = () => { const seat = nearbySeat(cafe.seats, pose.current); if (seat) live.socialAction('sit', seat.id); else setStatus('Move closer to a chair first') }
  return <main style={{ position: 'relative', height: '100dvh', background: '#172d27', color: '#f4ead7', fontFamily: 'system-ui', display: 'grid', gridTemplateRows: 'auto 1fr' }}>
    <CampusUpdateNotice ready={true} busy={walking} open={updatesOpen} onOpen={() => setUpdatesOpen(true)} onClose={closeUpdates} onExplore={destination => { if (destination === 'nescafe') { position.current = cafePoint(cafe, -1.55, 3); setWalking(true) } else window.location.assign('/campus') }} />
    <header style={{ padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
      <strong style={{ marginRight: 'auto' }}>NESCAFÉ <small style={{ opacity: .6 }}>terrace rehearsal</small></strong>
      <span role="status" style={{ fontSize: 12 }}>{status} · {metrics}</span>
      <button onClick={() => setNight(n => !n)}>{night ? 'Daylight' : 'Evening'}</button>
      <button aria-expanded={updatesOpen} onClick={() => setUpdatesOpen(value => !value)}>What’s new</button>
      <button onClick={() => { if (!walking) position.current = cafePoint(cafe, -1.55, 3); setWalking(w => !w); setStatus('WASD · Shift to run · Space to jump') }}>{walking ? 'Overview' : 'Walk around'}</button>
      <button disabled={!walking} onClick={() => seated ? live.socialAction('stop') : sit()}>{seated ? 'Stand up' : 'Sit on nearby chair'}</button>
      <button disabled={!seated} onClick={() => setVoicePreview(true)}>Preview table voice</button>
      <CafeCounter live={cafeLive} pose={pose} counters={counters} seats={cafe.seats} walking={walking} disabled={false} />
      {live.socialError && <span>{live.socialError}</span>}
    </header>
    <Canvas shadows dpr={1} camera={{ position: [camera.x, cafe.base + 13, camera.z], fov: 48 }}>
      <color attach="background" args={[night ? '#122331' : '#dfe8dc']} />
      <hemisphereLight args={[night ? '#abc1d5' : '#f8f1df', '#4b6343', night ? 1.2 : 2]} />
      <directionalLight position={[center.x - 20, cafe.base + 38, center.z - 25]} intensity={night ? .7 : 2.3} castShadow shadow-mapSize={[1024, 1024]} shadow-camera-left={-40} shadow-camera-right={40} shadow-camera-top={40} shadow-camera-bottom={-40} target-position={[center.x, cafe.base, center.z]} />
      <Terrain model={twin.terrain} patches={patches} onReady={() => {}} />
      <OSMBuildings buildings={twin.buildings.filter(b => b.id === cafe.buildingId)} assignments={twin.selections.filter(s => s.buildingId === cafe.buildingId)} onRenderedCount={() => {}} selectedBuildingId={null} onSelectBuilding={() => {}} night={night} />
      <CampusCafe cafe={cafe} terrain={twin.terrain} night={night} />
      <Vegetation trees={twin.trees.filter(t => Math.hypot(t.x - center.x, t.z - center.z) < 45)} onReady={() => {}} />
      {!walking && <><OrbitControls target={[center.x, cafe.base + 1.5, center.z]} minDistance={5} maxDistance={80} /><Friend twin={twin} slot={0} /><Friend twin={twin} slot={4} /></>}
      {walking && <AvatarExplorer avatarStyle="boy" concertJoined={false} concertPose={null} campusSession={live.session} campusPose={pose} onSocialStop={() => live.socialAction('stop')} onBuggyRide={() => {}} footballPitch={null} footballControls={football} footballLive={false} hostelPlan={null} gyanPlan={null} interiorPose={interior} processedSpawn={processed} twin={twin} paused={false} input={input} position={position} spawn={spawn} onStatus={onStatus} onInspect={() => {}} />}
      <Metrics report={setMetrics} />
    </Canvas>
  </main>
}
async function run() {
  const [campus, roadData] = await Promise.all(['campus', 'roads'].map(async kind => (await fetch(`/map/nit-goa-${kind}.json`)).json()))
  const boundary = campus.elements.find((e: { id: number }) => e.id === 1259742369).geometry, buildings = extractBuildingFootprints(campus.elements), roads = extractCampusRoads(roadData.elements, boundary)
  const twin = createDigitalTwin({ buildings, boundary, source: 'campus-area', returnedBuildingCount: buildings.length }, { roads, boundary, source: 'campus-area', returnedRoadCount: roads.length }, true, savedCampusOverrides)
  if (!twin.terrain.cafe) throw new Error('Café layout unavailable')
  const root = import.meta.hot?.data.root ?? createRoot(document.getElementById('root')!)
  if (import.meta.hot) import.meta.hot.data.root = root
  root.render(<Rehearsal twin={twin} />)
}
if (import.meta.env.DEV) void run()
