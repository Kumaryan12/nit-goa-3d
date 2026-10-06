import { useContext, useMemo, useRef, useState } from 'react'
import { Html } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import type { Group } from 'three'
import StudentAvatar from './StudentAvatar'
import CampusVehicle from './CampusVehicle'
import SocialBubble from './SocialBubble'
import CrowdAvatar from './CrowdAvatar'
import { GraphicsContext } from './ScenePerformance'
import { chooseCrowd } from '../lib/crowdRendering'
import type { CrowdChoice } from '../lib/crowdRendering'
import { motionDelta, stridePhase } from '../lib/avatarMotion'
import type { AvatarMotion } from '../lib/avatarMotion'
import { CAMPUS_COLORS } from '../lib/campusProtocol'
import { PRESENCE_SPEED_LIMITS } from '../lib/movementLimits'
import type { CampusChat, CampusPerson, CampusSession } from '../lib/campusProtocol'

function Visitor({ person, session, messages, space, walking, detailed, label }: { person: CampusPerson; session: React.RefObject<CampusSession>; messages: CampusChat[]; space: string; walking: boolean; detailed: boolean; label: boolean }) {
  const root = useRef<Group>(null), motion = useRef<AvatarMotion>({ phase: 0, moving: false, speed: 0 }), epoch = useRef(-1), bubble = useRef<HTMLSpanElement>(null)
  const camera = useThree(state => state.camera)
  const message = useMemo(() => [...messages].reverse().find(m => m.sender === person.id && m.scope === 'nearby'), [messages, person.id])
  useFrame((_, delta) => {
    const group = root.current, currentPerson = session.current.snapshot?.people.find(p => p.id === person.id), pose = currentPerson?.pose
    if (!group || !pose) { if (group) group.visible = false; return }
    const allowedSpace = walking ? pose.space === space : pose.space === 'outdoors'
    group.visible = pose.visible && allowedSpace && camera.position.distanceToSquared(group.position) < (walking ? 160 ** 2 : 1200 ** 2)
    motion.current.paused = !group.visible
    const dt = motionDelta(delta), blend = 1 - Math.exp(-dt * 15), beforeX = group.position.x, beforeZ = group.position.z
    const snap = epoch.current !== pose.epoch || Math.hypot(group.position.x - pose.x, group.position.z - pose.z) > 8
    if (snap) { group.position.set(pose.x, pose.y, pose.z); group.rotation.y = pose.yaw; epoch.current = pose.epoch }
    else { group.position.x += (pose.x - group.position.x) * blend; group.position.y += (pose.y - group.position.y) * blend; group.position.z += (pose.z - group.position.z) * blend }
    group.rotation.order = 'YXZ'
    group.rotation.x += ((pose.pitch ?? 0) - group.rotation.x) * blend
    group.rotation.y += Math.atan2(Math.sin(pose.yaw - group.rotation.y), Math.cos(pose.yaw - group.rotation.y)) * blend
    const distance = snap ? 0 : Math.hypot(group.position.x - beforeX, group.position.z - beforeZ)
    motion.current.moving = pose.active && distance > .001; motion.current.running = pose.running; motion.current.speed = motion.current.moving && dt ? Math.min(PRESENCE_SPEED_LIMITS[person.ride ? 'buggy' : pose.vehicle ?? 'walk'], distance / dt) : 0
    const forwardTravel = -(group.position.x - beforeX) * Math.sin(pose.yaw) - (group.position.z - beforeZ) * Math.cos(pose.yaw)
    motion.current.driveSpeed = (motion.current.speed ?? 0) * (forwardTravel < 0 ? -1 : 1)
    motion.current.vehicle = person.ride ? 'buggy' : pose.vehicle ?? 'walk'
    motion.current.phase = stridePhase(motion.current.phase, distance, pose.running)
    motion.current.social = currentPerson?.social; motion.current.airborne = pose.airborne
    if (bubble.current) bubble.current.hidden = !message || Date.now() - message.time > 8000
  })
  return <group ref={root} position={person.pose ? [person.pose.x, person.pose.y, person.pose.z] : [0, 0, 0]} name="shared-campus-visitor">
    {!detailed ? <CrowdAvatar motion={motion} color={CAMPUS_COLORS[person.color]} seated={person.social?.action === 'sit' || !!person.ride} passenger={!!person.ride} vehicle={person.ride ? 'walk' : person.pose?.vehicle ?? 'walk'} /> : person.ride ? <StudentAvatar motion={motion} jersey={CAMPUS_COLORS[person.color]} /> : <CampusVehicle mode={person.pose?.vehicle ?? 'walk'} motion={motion} jersey={CAMPUS_COLORS[person.color]} />}
    {label && <SocialBubble session={session} personId={person.id} />}
    {label && <Html center position={[0, 2.25, 0]} zIndexRange={[20, 0]} distanceFactor={12}>
      <div className="campus-avatar-caption"><span ref={bubble} className="campus-speech" hidden>{message?.text}</span>{person.handle ? <a href={`/people/${person.handle}`} target="_blank" rel="noopener noreferrer" className="campus-avatar-name" onPointerDown={event => event.stopPropagation()}>{person.name}</a> : <span className="campus-avatar-name">{person.name}</span>}</div>
    </Html>}
  </group>
}
export default function CampusPeopleScene({ people, session, messages, excludedIds, space, walking }: { people: CampusPerson[]; session: React.RefObject<CampusSession>; messages: CampusChat[]; excludedIds: string[]; space: string; walking: boolean }) {
  const profile = useContext(GraphicsContext), elapsed = useRef(1), key = useRef(''), [choices, setChoices] = useState<CrowdChoice[]>([])
  useFrame(({ camera }, delta) => {
    elapsed.current += delta
    if (elapsed.current < .25) return
    elapsed.current = 0
    const next = chooseCrowd(session.current.snapshot?.people ?? people, camera.position, space, walking, [...excludedIds, ...(session.current.id ? [session.current.id] : [])], profile.dpr <= .85 ? 'smooth' : profile.dpr >= 1.5 ? 'detailed' : 'balanced')
    const nextKey = next.map(person => `${person.id}:${person.detailed}:${person.label}`).join('|')
    if (nextKey !== key.current) { key.current = nextKey; setChoices(next) }
  })
  return <>{choices.map(choice => { const person = people.find(person => person.id === choice.id); return person && <Visitor key={person.id} person={person} session={session} messages={messages} space={space} walking={walking} detailed={choice.detailed} label={choice.label} /> })}</>
}
