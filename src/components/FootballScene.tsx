import { memo, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { Html } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import type { Group } from 'three'
import { FOOTBALL_RADIUS, footballStatus, footballToLocal, footballToWorld } from '../lib/football'
import type { FootballControls, FootballPitch, FootballStatus } from '../lib/football'
import type { CampusSession } from '../lib/campusProtocol'
import { CAMPUS_COLORS } from '../lib/campusProtocol'
import { defaultAvatarColor } from '../lib/profile'
import type { AvatarStyle } from '../lib/profile'
import type { FootballPlayer, FootballSession } from '../lib/footballProtocol'
import StudentAvatar from './StudentAvatar'
import CrowdAvatar from './CrowdAvatar'
import FootballAvatar from './FootballAvatar'
import FootballContactShadows from './FootballContactShadows'
import { GraphicsContext } from './ScenePerformance'
import { chooseFootballCrowd } from '../lib/footballMotion'
import { motionDelta, stridePhase } from '../lib/avatarMotion'
import type { AvatarMotion } from '../lib/avatarMotion'
import FootballCelebration from './FootballCelebration'
import { createFootballBallGeometry } from '../lib/footballBallGeometry'
const ignoreRaycast = () => undefined
const RemotePlayer=memo(function RemotePlayer({ player, session, campusSession, pitch, detailed, label,style,color,lightweight }: { player: FootballPlayer; session: React.RefObject<FootballSession>; campusSession: React.RefObject<CampusSession>; pitch: FootballPitch; detailed:boolean; label:boolean;style?:AvatarStyle;color:string;lightweight:boolean }) {
  const group = useRef<Group>(null), motion = useRef<AvatarMotion>({ phase: 0, moving: false, speed: 0, running: false })
  const initial=useMemo(()=>{const p=footballToWorld(player,pitch);return [p.x,pitch.elevation+.11,p.z] as [number,number,number]},[player.id,pitch])
  const gl = useThree(state => state.gl), portal = useRef(gl.domElement.parentElement!)
  useFrame((_, delta) => {
    const current = session.current.playerIndex?.get(player.id) ?? session.current.snapshot?.players.find(item => item.id === player.id)
    if (!current || !group.current) return
    delta = motionDelta(delta)
    const beforeX = group.current.position.x, beforeZ = group.current.position.z
    const sampled = session.current.motion?.sample(player.id, performance.now())
    const point = sampled ?? footballToWorld(current, pitch), blend = 1 - Math.exp(-delta * 15)
    if (sampled) { group.current.position.x = point.x; group.current.position.z = point.z }
    else { group.current.position.x += (point.x - group.current.position.x) * blend; group.current.position.z += (point.z - group.current.position.z) * blend }
    // Shared campus presence carries verified world-space jump height. Keep
    // football's authoritative X/Z and ignore unrelated indoor/teleport poses.
    const currentPerson=campusSession.current.peopleById?.get(player.id) ?? campusSession.current.snapshot?.people.find(person=>person.id===player.id)
    const pose=currentPerson?.pose?.airborne?campusSession.current.motion?.sample(player.id,performance.now()) ?? currentPerson.pose:currentPerson?.pose
    const ground = pitch.elevation + .11
    const y = pose?.space === 'outdoors' && Math.hypot(pose.x - point.x, pose.z - point.z) < 3 ? Math.max(ground, Math.min(ground + .8, pose.y)) : ground
    group.current.position.y += (y - group.current.position.y) * blend
    motion.current.airborne = group.current.position.y > ground + .08
    const c=Math.cos(pitch.rotation),s=Math.sin(pitch.rotation)
    const yaw = sampled?.yaw ?? Math.atan2(-(current.dx*c+current.dz*s),-(-current.dx*s+current.dz*c))
    group.current.rotation.y += Math.atan2(Math.sin(yaw-group.current.rotation.y),Math.cos(yaw-group.current.rotation.y)) * blend
    const distance = Math.hypot(group.current.position.x - beforeX, group.current.position.z - beforeZ)
    motion.current.moving = current.active && distance > .001
    motion.current.running = current.running
    motion.current.kick = current.kick
    motion.current.speed = motion.current.moving && delta > 0 ? Math.min(5.5, distance / delta) : 0
    if (motion.current.moving) motion.current.phase = stridePhase(motion.current.phase, distance, current.running)
  })
  return <group ref={group} position={initial} name={`football-player-${player.number}`}>
    {lightweight ? <FootballAvatar style={style} motion={motion} color={player.team==='blue'?'#388fc1':'#d2a345'}/> : detailed ? <StudentAvatar style={style} motion={motion} jersey={player.team === 'blue' ? '#388fc1' : '#d2a345'} accent={color} /> : <CrowdAvatar style={style} motion={motion} color={player.team==='blue'?'#388fc1':'#d2a345'}/>}
    {label && <Html portal={portal} position={[0,2.2,0]} center pointerEvents="none" zIndexRange={[15,0]}><span className={`football-player-label ${player.team}`}>Player {player.number}</span></Html>}
  </group>
})
export default function FootballScene({ pitch, session, campusSession, players, controls, live, onStatus }: {
  pitch: FootballPitch; session: React.RefObject<FootballSession>; campusSession: React.RefObject<CampusSession>; players: FootballPlayer[]; controls: React.RefObject<FootballControls>; live: boolean; onStatus: (status: FootballStatus) => void
}) {
  const ball = useRef<Group>(null), aim=useRef<Group>(null), ballMarker=useRef<Group>(null), elapsed = useRef(0), last = useRef({ x:0,z:0,revision:-1 })
  const profile=useContext(GraphicsContext),crowdElapsed=useRef(1),crowdKey=useRef(''),[crowd,setCrowd]=useState<ReturnType<typeof chooseFootballCrowd>>([])
  const ballGeometry=useMemo(createFootballBallGeometry,[])
  useEffect(()=>()=>ballGeometry.dispose(),[ballGeometry])
  useEffect(() => { last.current = { x:0,z:0,revision:-1 } }, [pitch.center.x,pitch.center.z,pitch.rotation])
  useFrame(({camera}, delta) => {
    const snapshot = session.current.snapshot, state = snapshot?.ball
    crowdElapsed.current+=delta
    if(crowdElapsed.current>=.25) {
      crowdElapsed.current=0
      let next=live?chooseFootballCrowd(snapshot?.players ?? players,session.current.id,pitch,camera.position,profile.dpr<=.85?'smooth':profile.dpr>=1.5?'detailed':'balanced'):[]
      if(profile.avatarShadows===false){const labels=new Set(players.filter(p=>p.id!==session.current.id).slice(0,4).map(p=>p.id));next=next.map(p=>({...p,detailed:false,label:labels.has(p.id)}))}
      const key=next.map(p=>`${p.id}:${p.detailed}:${p.label}`).sort().join('|')
      if(key!==crowdKey.current){crowdKey.current=key;setCrowd(next)}
    }
    const sample=session.current.ballMotion?.sample(performance.now())
    if (ball.current) {
      const target=sample ?? state ?? {x:0,z:0,revision:0}, changed=(target.revision ?? 0)!==last.current.revision
      const blend=changed || state?.resetSeconds ? 1 : 1-Math.exp(-24*motionDelta(delta))
      const x=last.current.x+(target.x-last.current.x)*blend,z=last.current.z+(target.z-last.current.z)*blend
      ball.current.position.set(x,FOOTBALL_RADIUS+.11,z)
      if(!changed) {ball.current.rotation.z -= (x-last.current.x)/FOOTBALL_RADIUS; ball.current.rotation.x += (z-last.current.z)/FOOTBALL_RADIUS}
      last.current={x,z,revision:target.revision ?? 0}
      if(ballMarker.current) {ballMarker.current.position.set(x,.145,z);ballMarker.current.visible=live}
    }
    const actor=controls.current.actor
    if(aim.current) {
      aim.current.visible=live&&!!actor?.active&&!state?.resetSeconds
      if(actor) {
        const p=footballToLocal(actor.position,pitch),d=footballToLocal(actor.direction,{...pitch,center:{x:0,z:0}})
        aim.current.position.set(p.x+d.z*.6,.15,p.z-d.x*.6);aim.current.rotation.y=Math.atan2(-d.x,-d.z)
      }
    }
    elapsed.current += delta
    if(elapsed.current>=.1){elapsed.current=0;if(state)onStatus(footballStatus(state,live?controls.current.actor:null,pitch))}
  })
  return <>
    <group position={[pitch.center.x,pitch.elevation,pitch.center.z]} rotation={[0,pitch.rotation,0]} name="campus-football">
      <FootballContactShadows session={session} controls={controls} pitch={pitch} live={live} enabled={profile.avatarShadows===false}/>
      <FootballCelebration session={session} controls={controls} pitch={pitch} live={live}/>
      <group ref={ball} position={[0,FOOTBALL_RADIUS+.11,0]}>
        <mesh geometry={ballGeometry} castShadow={profile.avatarShadows!==false} raycast={ignoreRaycast}><meshStandardMaterial vertexColors roughness={.65} /></mesh>
      </group>
      <group ref={ballMarker} visible={false}>
        <mesh rotation={[-Math.PI/2,0,0]} raycast={ignoreRaycast}><ringGeometry args={[.43,.49,24]} /><meshBasicMaterial color="#f3d777" transparent opacity={.65} depthWrite={false} /></mesh>
      </group>
      <group ref={aim} visible={false}>
        <mesh position={[0,0,-1.25]} rotation={[-Math.PI/2,0,0]} raycast={ignoreRaycast}><planeGeometry args={[.07,1.2]} /><meshBasicMaterial color="#f5df99" transparent opacity={.8} depthWrite={false} /></mesh>
        <mesh position={[0,0,-1.95]} rotation={[-Math.PI/2,0,0]} raycast={ignoreRaycast}><circleGeometry args={[.22,3,Math.PI/2]} /><meshBasicMaterial color="#f5df99" transparent opacity={.9} depthWrite={false} /></mesh>
      </group>
    </group>
    {live && crowd.map(choice=>{const player=players.find(p=>p.id===choice.id),person=campusSession.current.peopleById?.get(choice.id) ?? campusSession.current.snapshot?.people.find(p=>p.id===choice.id);return player&&<RemotePlayer key={player.id} player={player} session={session} campusSession={campusSession} pitch={pitch} detailed={choice.detailed} label={choice.label} lightweight={profile.avatarShadows===false} style={person?.avatarStyle} color={CAMPUS_COLORS[person?.color ?? defaultAvatarColor(choice.id)]}/>})}
  </>
}
