// Development rendering review; actual WebSocket delivery is tested separately.
import { useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import type { Group } from 'three'
import CampusVehicle from '../../src/components/CampusVehicle'
import { advanceVehicle, applyBuggyImpact, freshVehicle, VEHICLES } from '../../src/lib/vehicles'
import { solveBuggyImpact, sweptBuggyContact } from '../../src/lib/buggyImpacts'
import { createWalkWorld } from '../../src/lib/walking'
import type { AvatarMotion } from '../../src/lib/avatarMotion'

const bounds=[{x:-50,z:-50},{x:50,z:-50},{x:50,z:50},{x:-50,z:50},{x:-50,z:-50}]
const world=createWalkWorld([],bounds,{size:200,segments:20,heights:new Float32Array(21**2),colors:new Float32Array(21**2*3)})
function Review({glance,slow}:{glance:boolean;slow:boolean}) {
 const roots=[useRef<Group>(null),useRef<Group>(null)]
 const motions=[useRef<AvatarMotion>({phase:0,moving:false}),useRef<AvatarMotion>({phase:0,moving:false})]
 const simulation=useRef({time:0,hit:false,points:[{x:glance?1.35:0,z:7},{x:0,z:0}],states:[{...freshVehicle(),speed:slow?3:VEHICLES.buggy.speed},freshVehicle()]})
 useFrame((_,delta)=>{
  const sim=simulation.current,dt=Math.min(delta,.05);sim.time+=dt
  for(let i=0;i<2;i++) {
   const before=sim.points[i],state=sim.states[i]
   sim.points[i]=advanceVehicle(state,before,'buggy',0,0,false,dt,world,[]).point
   if(i===0&&!sim.hit) {
    const body={...sim.points[0],yaw:state.yaw},other={...sim.points[1],yaw:sim.states[1].yaw}
    const contact=sweptBuggyContact({...before,yaw:state.yaw},body,other)
    const hit=contact&&solveBuggyImpact(contact.body,other,{x:-Math.sin(state.yaw)*state.speed,z:-Math.cos(state.yaw)*state.speed},{x:0,z:0},contact.normal)
    if(hit&&contact) {
     sim.hit=true;sim.points[0]={x:contact.body.x,z:contact.body.z}
     for(let j=0;j<2;j++)applyBuggyImpact(sim.states[j],{sequence:1,startedAt:0,until:1500,strength:hit.strength,...(j===0?hit.a:hit.b),anchor:{...sim.points[j],y:0,yaw:sim.states[j].yaw,epoch:1}})
    }
   }
   Object.assign(motions[i].current,{speed:state.speed,driveSpeed:state.speed,moving:Math.abs(state.speed)>.01,impactAge:state.impactAge??2,impactStrength:state.impactStrength??0})
   roots[i].current?.position.set(sim.points[i].x,.015,sim.points[i].z)
   if(roots[i].current)roots[i].current.rotation.y=state.yaw
  }
 })
 return <><color attach="background" args={['#15352b']}/><ambientLight intensity={1.7}/><directionalLight position={[-4,12,8]} intensity={2.5}/><mesh rotation={[-Math.PI/2,0,0]}><planeGeometry args={[100,100]}/><meshStandardMaterial color="#718b69"/></mesh>{roots.map((root,i)=><group key={i} ref={root}><CampusVehicle mode="buggy" style={i?'girl':'boy'} motion={motions[i]} jersey={i?'#ee9c54':'#58b6b9'} accent="#f7edc4"/></group>)}<OrbitControls target={[0,.6,1]} minDistance={4} maxDistance={30}/></>
}
function Preview(){
 const [glance,setGlance]=useState(false),[slow,setSlow]=useState(false),[replay,setReplay]=useState(0)
 return <><header><h1>Buggy impact review</h1><p>Production vehicles and physics · local visual simulation</p><button onClick={()=>setReplay(replay+1)}>Replay impact</button><button onClick={()=>setGlance(!glance)}>{glance?'Rear impact':'Glancing impact'}</button><button onClick={()=>setSlow(!slow)}>{slow?'Fast impact':'Gentle impact'}</button></header><Canvas camera={{position:[10,7,13],fov:45}} dpr={[1,1.5]}><Review key={`${glance}-${slow}-${replay}`} glance={glance} slow={slow}/></Canvas></>
}
if(import.meta.env.DEV)createRoot(document.getElementById('root')!).render(<Preview/> )
