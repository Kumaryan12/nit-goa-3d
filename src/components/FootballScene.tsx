import { useEffect, useMemo, useRef } from 'react'
import { Html } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { Quaternion, Vector3 } from 'three'
import type { Group } from 'three'
import { FOOTBALL_RADIUS, footballStatus, footballToWorld } from '../lib/football'
import type { FootballControls, FootballPitch, FootballStatus } from '../lib/football'
import type { CampusSession } from '../lib/campusProtocol'
import { CAMPUS_COLORS } from '../lib/campusProtocol'
import { defaultAvatarColor } from '../lib/profile'
import type { FootballPlayer, FootballSession } from '../lib/footballProtocol'
import StudentAvatar from './StudentAvatar'
import { motionDelta, stridePhase } from '../lib/avatarMotion'
import type { AvatarMotion } from '../lib/avatarMotion'
const ignoreRaycast = () => undefined
function RemotePlayer({ player, session, campusSession, pitch }: { player: FootballPlayer; session: React.RefObject<FootballSession>; campusSession: React.RefObject<CampusSession>; pitch: FootballPitch }) {
  const group = useRef<Group>(null), motion = useRef<AvatarMotion>({ phase: 0, moving: false, speed: 0, running: false })
  const gl = useThree(state => state.gl), portal = useRef(gl.domElement.parentElement!)
  useFrame((_, delta) => {
    const current = session.current.snapshot?.players.find(item => item.id === player.id)
    if (!current || !group.current) return
    delta = motionDelta(delta)
    const beforeX = group.current.position.x, beforeZ = group.current.position.z
    const sampled = session.current.motion?.sample(player.id, performance.now())
    const point = sampled ?? footballToWorld(current, pitch), blend = 1 - Math.exp(-delta * 15)
    if (sampled) { group.current.position.x = point.x; group.current.position.z = point.z }
    else { group.current.position.x += (point.x - group.current.position.x) * blend; group.current.position.z += (point.z - group.current.position.z) * blend }
    // Shared campus presence carries verified world-space jump height. Keep
    // football's authoritative X/Z and ignore unrelated indoor/teleport poses.
    const pose = campusSession.current.motion?.sample(player.id, performance.now()) ?? campusSession.current.snapshot?.people.find(person => person.id === player.id)?.pose
    const ground = pitch.elevation + .11
    const y = pose?.space === 'outdoors' && Math.hypot(pose.x - point.x, pose.z - point.z) < 3 ? Math.max(ground, Math.min(ground + .8, pose.y)) : ground
    group.current.position.y += (y - group.current.position.y) * blend
    motion.current.airborne = group.current.position.y > ground + .08
    const direction = footballToWorld({ x:current.dx,z:current.dz }, { ...pitch, center:{x:0,z:0} })
    const yaw = sampled?.yaw ?? Math.atan2(-direction.x, -direction.z)
    group.current.rotation.y += Math.atan2(Math.sin(yaw-group.current.rotation.y),Math.cos(yaw-group.current.rotation.y)) * blend
    const distance = Math.hypot(group.current.position.x - beforeX, group.current.position.z - beforeZ)
    motion.current.moving = current.active && distance > .001
    motion.current.running = current.running
    motion.current.speed = motion.current.moving && delta > 0 ? Math.min(5.5, distance / delta) : 0
    if (motion.current.moving) motion.current.phase = stridePhase(motion.current.phase, distance, current.running)
  })
  const initial = footballToWorld(player, pitch)
  const color = campusSession.current.snapshot?.people.find(person => person.id === player.id)?.color ?? defaultAvatarColor(player.id)
  return <group ref={group} position={[initial.x,pitch.elevation+.11,initial.z]} name={`football-player-${player.number}`}>
    <StudentAvatar motion={motion} jersey={player.team === 'blue' ? '#388fc1' : '#d2a345'} accent={CAMPUS_COLORS[color]} />
    <Html portal={portal} position={[0,2.2,0]} center pointerEvents="none" zIndexRange={[15,0]}><span className={`football-player-label ${player.team}`}>Player {player.number}</span></Html>
  </group>
}
export default function FootballScene({ pitch, session, campusSession, players, controls, live, onStatus }: {
  pitch: FootballPitch; session: React.RefObject<FootballSession>; campusSession: React.RefObject<CampusSession>; players: FootballPlayer[]; controls: React.RefObject<FootballControls>; live: boolean; onStatus: (status: FootballStatus) => void
}) {
  const ball = useRef<Group>(null), elapsed = useRef(0), last = useRef({ x:0,z:0,sequence:-1,age:0 })
  const panels = useMemo(() => {
    const points = [{x:0,y:1,z:0},{x:0,y:-1,z:0}]
    for(const y of [-.45,.45])for(let i=0;i<5;i++){const a=i/5*Math.PI*2+(y>0?0:Math.PI/5);points.push({x:Math.cos(a)*Math.sqrt(1-y*y),y,z:Math.sin(a)*Math.sqrt(1-y*y)})}
    return points.map(point => ({ ...point, quaternion: new Quaternion().setFromUnitVectors(new Vector3(0,0,1),new Vector3(point.x,point.y,point.z)) }))
  }, [])
  useEffect(() => { last.current = { x:0,z:0,sequence:-1,age:0 } }, [pitch.center.x,pitch.center.z,pitch.rotation])
  useFrame((_, delta) => {
    const snapshot = session.current.snapshot, state = snapshot?.ball
    if (ball.current) {
      if (snapshot && snapshot.sequence !== last.current.sequence) { last.current.sequence=snapshot.sequence; last.current.age=0 }
      else last.current.age = Math.min(.1,last.current.age+delta)
      const x = state ? state.x + state.vx*last.current.age : 0, z = state ? state.z + state.vz*last.current.age : 0
      ball.current.position.set(x,FOOTBALL_RADIUS+.11,z)
      ball.current.rotation.z -= (x-last.current.x)/FOOTBALL_RADIUS; ball.current.rotation.x += (z-last.current.z)/FOOTBALL_RADIUS
      last.current.x=x;last.current.z=z
    }
    elapsed.current += delta
    if(elapsed.current>=.1){elapsed.current=0;if(state)onStatus(footballStatus(state,live?controls.current.actor:null,pitch))}
  })
  return <>
    <group position={[pitch.center.x,pitch.elevation,pitch.center.z]} rotation={[0,pitch.rotation,0]} name="campus-football">
      <group ref={ball} position={[0,FOOTBALL_RADIUS+.11,0]}>
        <mesh castShadow raycast={ignoreRaycast}><sphereGeometry args={[FOOTBALL_RADIUS,24,16]} /><meshStandardMaterial color="#fbfaf2" roughness={.65} /></mesh>
        {panels.map((point,i)=><mesh key={i} position={[point.x*(FOOTBALL_RADIUS+.002),point.y*(FOOTBALL_RADIUS+.002),point.z*(FOOTBALL_RADIUS+.002)]} quaternion={point.quaternion} raycast={ignoreRaycast}><circleGeometry args={[.072,5]} /><meshStandardMaterial color="#202b30" roughness={.8} /></mesh>)}
      </group>
      <mesh rotation={[-Math.PI/2,0,0]} position={[0,.145,0]} raycast={ignoreRaycast}><ringGeometry args={[1.1,1.18,32]} /><meshBasicMaterial color="#f3d777" transparent opacity={.5} /></mesh>
    </group>
    {live && players.filter(player=>player.id!==session.current.id).map(player=><RemotePlayer key={player.id} player={player} session={session} campusSession={campusSession} pitch={pitch} />)}
  </>
}
