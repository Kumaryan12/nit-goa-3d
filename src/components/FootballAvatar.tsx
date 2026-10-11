import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group } from 'three'
import type { AvatarStyle } from '../lib/profile'
import type { AvatarMotion } from '../lib/avatarMotion'
import { motionDelta } from '../lib/avatarMotion'
import { createFootballAvatarGeometry } from '../lib/footballAvatarGeometry'

const assets=new Map<AvatarStyle,{geometry:ReturnType<typeof createFootballAvatarGeometry>;users:number}>()
export default function FootballAvatar({style='boy',motion,color}:{style?:AvatarStyle;motion:React.RefObject<AvatarMotion>;color:string}) {
  const shared=useMemo(()=>{let item=assets.get(style);if(!item){item={geometry:createFootballAvatarGeometry(style),users:0};assets.set(style,item)}return item},[style])
  useEffect(()=>{shared.users++;return()=>{shared.users--;queueMicrotask(()=>{if(!shared.users&&assets.get(style)===shared){Object.values(shared.geometry).forEach(g=>g.dispose());assets.delete(style)}})}},[shared,style])
  const root=useRef<Group>(null),leftArm=useRef<Group>(null),rightArm=useRef<Group>(null),leftLeg=useRef<Group>(null),rightLeg=useRef<Group>(null),kick=useRef(0),lastKick=useRef(motion.current.kick ?? 0)
  const reduce=useRef(false)
  useEffect(()=>{const q=matchMedia('(prefers-reduced-motion: reduce)'),update=()=>{reduce.current=q.matches};update();q.addEventListener('change',update);return()=>q.removeEventListener('change',update)},[])
  useFrame((_,delta)=>{
    const state=motion.current;if(state.paused)return
    const dt=motionDelta(delta),blend=1-Math.exp(-dt*22)
    if(lastKick.current!==(state.kick ?? 0)){lastKick.current=state.kick ?? 0;kick.current=.4}
    kick.current=Math.max(0,kick.current-dt)
    const stride=state.moving?Math.sin(state.phase)*Math.min(.8,(state.speed ?? 0)*.14):0,kicking=kick.current>0?Math.sin(kick.current/.4*Math.PI)*.95:0
    if(leftLeg.current)leftLeg.current.rotation.x+=(stride-leftLeg.current.rotation.x)*blend
    if(rightLeg.current)rightLeg.current.rotation.x+=(-stride-kicking-rightLeg.current.rotation.x)*blend
    if(leftArm.current)leftArm.current.rotation.x+=(-stride*.7-leftArm.current.rotation.x)*blend
    if(rightArm.current)rightArm.current.rotation.x+=(stride*.7-rightArm.current.rotation.x)*blend
    if(root.current)root.current.position.y=state.moving&&!reduce.current?Math.sin(state.phase*2)*.018:0
  })
  const g=shared.geometry
  return <group ref={root} name="football-athlete">
    <mesh position={[0,1.69,-.01]}><primitive object={g.head} attach="geometry"/><meshStandardMaterial vertexColors roughness={.9}/></mesh>
    <mesh position={[0,1.19,0]}><primitive object={g.body} attach="geometry"/><meshStandardMaterial color={color} roughness={.9}/></mesh>
    <group ref={leftArm} position={[-.29,1.4,0]}><mesh><primitive object={g.arm} attach="geometry"/><meshStandardMaterial vertexColors roughness={.9}/></mesh></group>
    <group ref={rightArm} position={[.29,1.4,0]}><mesh><primitive object={g.arm} attach="geometry"/><meshStandardMaterial vertexColors roughness={.9}/></mesh></group>
    <group ref={leftLeg} position={[-.12,.88,0]}><mesh><primitive object={g.leg} attach="geometry"/><meshStandardMaterial vertexColors roughness={.9}/></mesh></group>
    <group ref={rightLeg} position={[.12,.88,0]}><mesh><primitive object={g.leg} attach="geometry"/><meshStandardMaterial vertexColors roughness={.9}/></mesh></group>
  </group>
}
