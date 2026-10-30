// Synthetic visual rehearsal only. This creates no server identity or auth bypass.
import { StrictMode, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import StudentAvatar from '../../src/components/StudentAvatar'
import PhotoMode from '../../src/components/PhotoMode'
import ScenePhotoCapture from '../../src/components/ScenePhotoCapture'
import type { AvatarMotion } from '../../src/lib/avatarMotion'
import type { CampusPerson, CampusPose, CampusSession } from '../../src/lib/campusProtocol'
import type { CampusLiveSession } from '../../src/hooks/useCampusSession'
import type { ScenePhotoCapture as Capture } from '../../src/lib/postcard'
import { SOCIAL_DURATION } from '../../src/lib/social'
import type { SocialAction } from '../../src/lib/social'
import '../../src/styles.css'

function Actor({ id, session }: { id: string; session: React.RefObject<CampusSession> }) {
  const motion = useRef<AvatarMotion>({ phase: 0, moving: false })
  useFrame(() => { motion.current.social = session.current.snapshot?.people.find(person => person.id === id)?.social })
  const person = session.current.snapshot!.people.find(person => person.id === id)!
  return <group position={[person.pose!.x, 0, 0]} rotation={[0, Math.PI, 0]} userData={{ photoPersonId: id }}><StudentAvatar style={person.avatarStyle} motion={motion} jersey={id === 'aryan' ? '#b57735' : id === 'dev' ? '#426f9b' : '#845c8f'} /></group>
}
function Preview() {
  const capture = useRef<Capture | null>(null), [open, setOpen] = useState(true), [busy, setBusy] = useState(false)
  const base: CampusPose = { x: 0, y: 0, z: 0, yaw: Math.PI, moving: false, running: false, active: true, visible: true, space: 'outdoors', epoch: 1 }
  const local = useRef(base)
  const [people, setPeople] = useState<CampusPerson[]>(() => [
    { id: 'aryan', name: 'Aryan', x: 0, color: 'amber', avatarStyle: 'boy' },
    { id: 'dev', name: 'Dev', x: -.95, color: 'blue', avatarStyle: 'boy' },
    { id: 'riya', name: 'Riya', x: .95, color: 'rose', avatarStyle: 'girl' },
  ].map(person => ({ id: person.id, name: person.name, handle: null, color: person.color, avatarStyle: person.avatarStyle, activity: 'walk', pose: { ...base, x: person.x } })) as CampusPerson[])
  const session = useRef<CampusSession>({ id: 'aryan', snapshot: null })
  session.current.snapshot = { type: 'campus-state', sequence: 1, serverTime: Date.now(), people }
  useEffect(() => {
    const timer = setInterval(() => setPeople(previous => previous.map(person => ({ ...person, social: person.social && person.social.until > Date.now() ? person.social : undefined }))), 200)
    return () => clearInterval(timer)
  }, [])
  const socialAction = (action: SocialAction | 'stop') => {
    const now = Date.now()
    setPeople(previous => previous.map(person => person.id === 'aryan' ? { ...person, social: action === 'stop' ? undefined : { action, startedAt: now, until: now + SOCIAL_DURATION[action] } } : person))
    return true
  }
  const live = { people, session, connection: 'idle', socialPreview: true, socialPending: false, socialError: '', socialAction } as unknown as CampusLiveSession
  return <main className={`explorer ${open ? 'photo-mode' : ''}`}>
    <div className="scene-viewport"><Canvas camera={{ position: [0, 2.6, 7], fov: 40 }} dpr={1}>
      <color attach="background" args={['#dcebe3']} /><ambientLight intensity={1.7} /><directionalLight position={[3, 8, 5]} intensity={2.3} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -.01, 0]}><planeGeometry args={[80, 80]} /><meshStandardMaterial color="#9cb58c" /></mesh>
      {people.map(person => <Actor key={person.id} id={person.id} session={session} />)}
      <OrbitControls target={[0, 1, 0]} enabled={!busy} />
      <ScenePhotoCapture target={capture} session={session} localPose={local} walking />
    </Canvas></div>
    <button id="campus-photo-toggle" style={{ position: 'absolute', top: 20, left: 20 }} onClick={() => setOpen(true)}>Open photo mode</button>
    {open && <PhotoMode capture={capture} live={live} pose={local} walking place="NIT Goa · Group rehearsal" onClose={() => setOpen(false)} onPreviewChange={setBusy} />}
  </main>
}
if (import.meta.env.DEV) createRoot(document.getElementById('root')!).render(<StrictMode><Preview /></StrictMode>)
