import { useRef } from 'react'
import { Html } from '@react-three/drei'
import { theatreSurfaceHeightAt, theatreToWorld } from '../lib/theatre'
import type { TheatreLayout } from '../lib/theatre'
import type { OatSnapshot } from '../lib/oatProtocol'
import { CAMPUS_COLORS } from '../lib/campusProtocol'
import type { CampusPerson } from '../lib/campusProtocol'
import { allocateAvatarColor } from '../lib/profile'
import type { AvatarColor } from '../lib/profile'
import StudentAvatar from './StudentAvatar'

function ConcertVisitor({ theatre, x, z, name, performer, color }: { theatre: TheatreLayout; x: number; z: number; name: string; performer: boolean; color: string }) {
  const point = theatreToWorld({ x, z }, theatre), motion = useRef({ phase: 0, moving: false })
  const height = theatreSurfaceHeightAt(point, theatre) ?? theatre.elevation
  return <group position={[point.x, height + (performer ? 0 : .22), point.z]} rotation={[0, theatre.rotation + (performer ? Math.PI : Math.atan2(x, z + 2)), 0]}>
    {performer ? <StudentAvatar motion={motion} jersey={color} /> : <group name="seated-concert-visitor">
      <mesh position={[0, .42, 0]} castShadow><boxGeometry args={[.44, .58, .27]} /><meshStandardMaterial color={color} /></mesh>
      <mesh position={[0, .88, -.01]} castShadow><sphereGeometry args={[.18, 12, 8]} /><meshStandardMaterial color="#c99066" /></mesh>
      <mesh position={[0, .98, .025]} castShadow><sphereGeometry args={[.17, 12, 8]} /><meshStandardMaterial color="#2e2926" /></mesh>
      {[-.12, .12].map(x => <group key={x}>
        <mesh position={[x, .08, -.17]} castShadow><boxGeometry args={[.16, .15, .4]} /><meshStandardMaterial color="#27394d" /></mesh>
        <mesh position={[x, -.065, -.33]} castShadow><boxGeometry args={[.14, .27, .14]} /><meshStandardMaterial color="#27394d" /></mesh>
        <mesh position={[x, -.19, -.4]} castShadow><boxGeometry args={[.18, .1, .26]} /><meshStandardMaterial color="#e7ede4" /></mesh>
      </group>)}
    </group>}
    {performer && <Html center position={[0, 2.35, 0]} distanceFactor={35} style={{ pointerEvents: 'none' }}><span className="oat-performer-label">🎤 {name}</span></Html>}
  </group>
}
export default function OatConcertScene({ theatre, concert, people }: { theatre: TheatreLayout; concert: OatSnapshot | null; people: CampusPerson[] }) {
  const stage = theatreToWorld({ x: 0, z: -2 }, theatre), performer = concert?.participants.find(p => p.id === concert.performerId)
  const audience = concert?.participants.filter(p => p.id !== concert.performerId) ?? []
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
    {performer && <ConcertVisitor theatre={theatre} x={0} z={-2} name={performer.name} color={CAMPUS_COLORS[colors.get(performer.id)!]} performer />}
    {audience.map((person, index) => {
      const row = Math.floor(index / 8), slot = index % 8
      const angle = [.25, .55, .85, 1.15, Math.PI - 1.15, Math.PI - .85, Math.PI - .55, Math.PI - .25][slot]
      const radius = 5.25 + row * 1.8
      return <ConcertVisitor key={person.id} theatre={theatre} x={Math.cos(angle) * radius} z={Math.sin(angle) * radius} name={person.name} color={CAMPUS_COLORS[colors.get(person.id)!]} performer={false} />
    })}
  </group>
}
