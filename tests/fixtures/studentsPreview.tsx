// Local rendering rehearsal. Synthetic viewer stays out of all network/auth APIs.
import { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { prepareDigitalTwin } from '../../src/lib/prepareDigitalTwin'
import { extractBuildingFootprints } from '../../src/lib/buildings'
import { extractCampusRoads } from '../../src/lib/roads'
import { savedCampusOverrides } from '../../src/data/campusOverrides'
import { defaultTerrainSettings } from '../../src/data/topography'
import { walkSurfaceHeightAt } from '../../src/lib/walking'
import type { CampusPose, CampusSession } from '../../src/lib/campusProtocol'
import type { AvatarMotion } from '../../src/lib/avatarMotion'
import type { SocialAction } from '../../src/lib/social'
import CampusStudents from '../../src/components/CampusStudents'
import StudentAvatar from '../../src/components/StudentAvatar'
import Terrain from '../../src/components/Terrain'
import OSMBuildings from '../../src/components/OSMBuildings'
import OSMRoads from '../../src/components/OSMRoads'
import Vegetation from '../../src/components/Vegetation'
import CampusCafe from '../../src/components/CampusCafe'
import OpenAirTheatre from '../../src/components/OpenAirTheatre'
import campus from './nit-goa-campus.json'
import roadData from './nit-goa-roads.json'
import '../../src/styles.css'
const boundary = campus.elements.find(e => e.id === 1259742369)!.geometry!
const twin = prepareDigitalTwin({ id: 1, settled: true, map: { buildings: extractBuildingFootprints(campus.elements), boundary, source: 'campus-area', returnedBuildingCount: 22 }, roads: { roads: extractCampusRoads(roadData.elements, boundary), boundary, source: 'campus-area', returnedRoadCount: 20 }, overrides: savedCampusOverrides, terrainSettings: defaultTerrainSettings })
const noop = () => {}
function View({ point }: { point: { x: number; z: number } }) {
  const { camera } = useThree(), y = walkSurfaceHeightAt(twin.terrain, point.x, point.z)
  useEffect(() => { camera.position.set(point.x + 5, y + 2.6, point.z + 7); camera.lookAt(point.x, y + 1, point.z) }, [point, camera, y])
  return <OrbitControls key={`${point.x}:${point.z}`} target={[point.x, y + 1, point.z]} minDistance={3} maxDistance={35} />
}
function Preview() {
  const [place, setPlace] = useState('cafe'), [near, setNear] = useState(false), [enabled, setEnabled] = useState(true), [night, setNight] = useState(false)
  const npc = twin.students!.find(p => place === 'cafe' ? p.role === 'chat' && p.id === 'npc-student-10' : place === 'oat' ? p.seat?.id.startsWith('oat-') : place === 'gyan' ? p.role === 'chat' : p.role === 'walker')!
  const point = npc.point, y = walkSurfaceHeightAt(twin.terrain, point.x, point.z)
  const session = useRef<CampusSession>({ id: 'local-reviewer', snapshot: { type: 'campus-state', sequence: 0, serverTime: Date.now(), people: [] } })
  const pose = useRef<CampusPose | null>(null), motion = useRef<AvatarMotion>({ phase: 0, moving: false })
  const local = { x: point.x + (near ? 2.7 : 9), z: point.z + 2, y, yaw: Math.PI / 2, epoch: 1, active: true, visible: true, moving: false, running: false, vehicle: 'walk' as const, space: 'outdoors' }
  pose.current = local
  const act = (action: SocialAction) => {
    const social = { action, startedAt: Date.now(), until: Date.now() + 5000 }; motion.current.social = social
    session.current.snapshot!.people = [{ id: 'local-reviewer', name: 'Rehearsal visitor', color: 'forest', handle: null, avatarStyle: 'boy', activity: 'walk', pose: local, social }]
  }
  return <main className="explorer"><Canvas camera={{ fov: 55 }} dpr={1}>
    <color attach="background" args={[night ? '#142439' : '#dcebe9']} /><ambientLight intensity={night ? .8 : 1.7} /><directionalLight position={[-80, 200, -140]} intensity={night ? .5 : 2.4} />
    <Terrain model={twin.terrain} patches={twin.terrainPatches} onReady={noop} /><OSMRoads roads={twin.roads} terrain={twin.terrain} night={night} />
    <OSMBuildings buildings={twin.buildings} assignments={twin.selections} onRenderedCount={noop} selectedBuildingId={null} onSelectBuilding={noop} night={night} />
    <Vegetation trees={twin.trees} onReady={noop} />
    {twin.terrain.cafe && <CampusCafe cafe={twin.terrain.cafe} terrain={twin.terrain} night={night} />}
    <OpenAirTheatre theatre={twin.theatre} terrain={twin.terrain} night={night} selected={false} onSelect={noop} />
    {enabled && <CampusStudents twin={twin} session={session} localPose={pose} walking outdoors />}
    <group position={[local.x, local.y, local.z]} rotation={[0, local.yaw, 0]}><StudentAvatar motion={motion} /></group>
    <View point={point} />
  </Canvas><section aria-label="NPC rehearsal controls" style={{ position: 'absolute', top: 15, left: 15, zIndex: 30, maxWidth: 'min(400px,calc(100vw - 30px))', background: '#11382be8', color: '#f3ebd3', padding: 16, borderRadius: 14, fontSize: 12 }}>
    <strong>NPC STUDENTS · LOCAL REHEARSAL</strong><p>16 fictional students · no accounts, microphone or server connection</p>
    <div style={{display:'flex',flexWrap:'wrap',gap:6}}>{[['cafe','Nescafé'],['gyan','Gyan Mandir'],['oat','OAT seats'],['walk','Walking route']].map(([id,name]) => <button key={id} onClick={() => setPlace(id)}>{name}</button>)}</div>
    <div style={{display:'flex',flexWrap:'wrap',gap:6,marginTop:10}}><button onClick={() => setNear(v => !v)}>{near ? 'Give them space' : 'Approach students'}</button><button onClick={() => act('wave')}>Wave</button><button onClick={() => act('dance')}>Dance</button><button aria-pressed={enabled} onClick={() => setEnabled(v => !v)}>Campus life</button><button onClick={() => setNight(v => !v)}>{night ? 'Day' : 'Night'}</button></div>
  </section></main>
}
if (import.meta.env.DEV) createRoot(document.getElementById('root')!).render(<Preview />)
