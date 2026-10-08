import { useContext, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import { theatreToWorld } from '../lib/theatre'
import type { TheatreLayout } from '../lib/theatre'
import type { OatSnapshot } from '../lib/oatProtocol'
import { CAMPUS_COLORS } from '../lib/campusProtocol'
import type { CampusPerson, CampusSession } from '../lib/campusProtocol'
import { allocateAvatarColor } from '../lib/profile'
import type { AvatarColor, AvatarStyle } from '../lib/profile'
import StudentAvatar from './StudentAvatar'
import CrowdAvatar from './CrowdAvatar'
import { GraphicsContext } from './ScenePerformance'
import { chooseCrowd } from '../lib/crowdRendering'
import SocialBubble from './SocialBubble'
import { theatreSeats } from '../lib/social'
import type { SocialSeat } from '../lib/social'
import type { AvatarMotion } from '../lib/avatarMotion'

function ConcertVisitor({ style, point, id, name, performer, color, session, detailed, label }: { style?: AvatarStyle; point: Pick<SocialSeat, 'x' | 'y' | 'z' | 'yaw'>; id: string; name: string; performer: boolean; color: string; session: React.RefObject<CampusSession>; detailed: boolean; label: boolean }) {
  const motion = useRef<AvatarMotion>({ phase: 0, moving: false, seated: !performer })
  useFrame(() => { motion.current.seated = !performer; motion.current.social = session.current.snapshot?.people.find(p => p.id === id)?.social })
  return <group position={[point.x, point.y, point.z]} rotation={[0, point.yaw, 0]} name={performer ? 'concert-performer' : 'seated-concert-visitor'}>
    {detailed || performer ? <StudentAvatar style={style} motion={motion} jersey={color} /> : <CrowdAvatar style={style} motion={motion} color={color} seated />}
    {(label || performer) && <SocialBubble session={session} personId={id} height={performer ? 2.9 : 1.5} />}
    {performer && <Html center position={[0, 2.1, 0]} distanceFactor={35} style={{ pointerEvents: 'none' }}><span className="oat-performer-label">🎤 {name}</span></Html>}
  </group>
}
export default function OatConcertScene({ theatre, concert, people, session }: { theatre: TheatreLayout; concert: OatSnapshot | null; people: CampusPerson[]; session: React.RefObject<CampusSession> }) {
  const stage = theatreToWorld({ x: 0, z: -2 }, theatre), performer = concert?.participants.find(p => p.id === concert.performerId)
  const audience = concert?.participants.filter(p => p.id !== concert.performerId) ?? []
  const seats = useMemo(() => theatreSeats(theatre).filter(seat => seat.row < 3), [theatre])
  const profile = useContext(GraphicsContext), elapsed = useRef(1), choiceKey = useRef(''), [detail, setDetail] = useState<{ detailed: Set<string>; labels: Set<string> }>({ detailed: new Set(), labels: new Set() })
  useFrame(({ camera }, delta) => {
    elapsed.current += delta
    if (elapsed.current < .25) return
    elapsed.current = 0
    const visitors: CampusPerson[] = audience.map((person, index) => ({ id: person.id, name: person.name, handle: null, color: 'teal', activity: 'concert', pose: { ...seats[index], epoch: 0, moving: false, running: false, active: true, visible: true, space: 'outdoors' } }))
    const choices = chooseCrowd(visitors, camera.position, 'outdoors', false, [], profile.dpr <= .85 ? 'smooth' : profile.dpr >= 1.5 ? 'detailed' : 'balanced')
    const key = choices.map(person => `${person.id}:${person.detailed}:${person.label}`).join('|')
    if (key !== choiceKey.current) { choiceKey.current = key; setDetail({ detailed: new Set(choices.filter(p => p.detailed).map(p => p.id)), labels: new Set(choices.filter(p => p.label).map(p => p.id)) }) }
  })
  const colors = new Map<string, AvatarColor>()
  for (const participant of concert?.participants ?? []) {
    const color = people.find(person => person.id === participant.id)?.color
    if (color) colors.set(participant.id, color)
  }
  for (const participant of concert?.participants ?? []) if (!colors.has(participant.id)) colors.set(participant.id, allocateAvatarColor(participant.id, undefined, colors.values()))
  return <group name="oat-concert-equipment">
    <group position={[stage.x, theatre.elevation + .53, stage.z]} rotation={[0, theatre.rotation, 0]}>
      {[-6.6, 6.6].map(x => <group key={x} position={[x, 0, 0]}>
        <mesh position={[0, .85, 0]} castShadow><boxGeometry args={[.85, 1.7, .7]} /><meshStandardMaterial color="#2d3735" /></mesh>
        {[.5, 1.13].map(y => <mesh key={y} position={[0, y, .36]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[.23, .23, .03, 16]} /><meshStandardMaterial color="#111b1a" /></mesh>)}
      </group>)}
      <group position={[0, 0, 1.5]}>
        <mesh position={[0, .035, 0]}><cylinderGeometry args={[.24, .24, .07, 16]} /><meshStandardMaterial color="#333d38" /></mesh>
        <mesh position={[0, .73, 0]}><cylinderGeometry args={[.022, .03, 1.45, 8]} /><meshStandardMaterial color="#444e48" metalness={.6} roughness={.4} /></mesh>
        <mesh position={[0, 1.46, 0]} rotation={[Math.PI / 2, 0, 0]}><capsuleGeometry args={[.045, .14, 4, 8]} /><meshStandardMaterial color="#1b2823" emissive="#e26f40" emissiveIntensity={concert?.micOn ? .6 : 0} /></mesh>
      </group>
    </group>
    {performer && <ConcertVisitor style={people.find(p => p.id === performer.id)?.avatarStyle} point={{ ...stage, y: theatre.elevation + .53, yaw: theatre.rotation + Math.PI }} id={performer.id} session={session} name={performer.name} color={CAMPUS_COLORS[colors.get(performer.id)!]} performer detailed label />}
    {audience.map((person, index) => <ConcertVisitor style={people.find(p => p.id === person.id)?.avatarStyle} key={person.id} point={seats[index]} id={person.id} session={session} name={person.name} color={CAMPUS_COLORS[colors.get(person.id)!]} performer={false} detailed={detail.detailed.has(person.id)} label={detail.labels.has(person.id)} />)}
  </group>
}
