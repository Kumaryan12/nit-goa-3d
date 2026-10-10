// Development-only visual rehearsal of the real people renderer and seat sampler.
import {useRef, useState} from 'react'
import {createRoot} from 'react-dom/client'
import {Canvas, useFrame} from '@react-three/fiber'
import type {Group} from 'three'
import CampusPeopleScene from '../../src/components/CampusPeopleScene'
import CampusVehicle from '../../src/components/CampusVehicle'
import StudentAvatar from '../../src/components/StudentAvatar'
import {buggySeatPose} from '../../src/lib/campusProtocol'
import type {CampusPerson, CampusPose, CampusSession} from '../../src/lib/campusProtocol'
import type {AvatarMotion} from '../../src/lib/avatarMotion'
import {sampleCampusPerson} from '../../src/lib/buggyRide'
import {RemoteMotionBuffer} from '../../src/lib/remoteMotion'

type View='driver'|'passenger'|'observer'
const makePose=(time:number):CampusPose=>{const angle=time*.65;return {x:8*Math.sin(angle),z:8*(Math.cos(angle)-1),y:.2+.15*Math.sin(angle),yaw:Math.atan2(-Math.cos(angle),Math.sin(angle)),pitch:.2*Math.sin(angle),epoch:1,vehicle:'buggy',visible:true,active:true,moving:true,running:false,space:'outdoors'}}
const peopleAt=(p:CampusPose):CampusPerson[]=>[
  {id:'driver',name:'Driver',avatarStyle:'boy',handle:null,color:'teal',activity:'walk',pose:p},
  ...([1,2,3] as const).map(seat=>({id:`rider-${seat}`,name:`Rider ${seat}`,avatarStyle:seat===2?'boy' as const:'girl' as const,handle:null,color:seat===1?'plum' as const:seat===2?'sunflower' as const:'coral' as const,activity:'walk' as const,ride:{driverId:'driver',seat},pose:buggySeatPose(p,seat,2)})),
]
function Ride({view,late}:{view:View;late:boolean}) {
 const [people]=useState(()=>peopleAt(makePose(0))),session=useRef<CampusSession>({id:null,snapshot:null,motion:new RemoteMotionBuffer()})
 session.current.id=view==='observer'?null:view==='driver'?'driver':'rider-1'
 const root=useRef<Group>(null),localPose=useRef<CampusPose|null>(null),motion=useRef<AvatarMotion>({phase:0,moving:false,vehicle:'buggy'})
 const simulation=useRef({time:0,tick:-1,sequence:0})
 useFrame(({camera},delta)=>{
  const sim=simulation.current;sim.time+=Math.min(delta,.05);localPose.current=makePose(sim.time)
  const now=performance.now(),tick=Math.floor(sim.time*(late?3:10))
  if(tick!==sim.tick) {
   sim.tick=tick;const members=peopleAt(localPose.current)
   const snapshot={type:'campus-state' as const,sequence:++sim.sequence,serverTime:Date.now(),people:members}
   session.current.snapshot=snapshot;session.current.peopleById=new Map(members.map(p=>[p.id,p]));session.current.motion!.push(snapshot,now)
  }
  const driver=session.current.snapshot!.people[0]
  const renderedDriver=view==='driver'?localPose.current:sampleCampusPerson(session.current,driver,now)!
  const self=view==='driver'?renderedDriver:sampleCampusPerson(session.current,session.current.snapshot!.people[1],now)!
  if(root.current){root.current.position.set(self.x,self.y,self.z);root.current.rotation.set(self.pitch??0,self.yaw,0,'YXZ')}
  motion.current.passenger=view==='passenger';motion.current.speed=5.2;motion.current.driveSpeed=5.2;motion.current.moving=true
  camera.position.set(renderedDriver.x+5,renderedDriver.y+3.5,renderedDriver.z+5);camera.lookAt(renderedDriver.x,renderedDriver.y+1,renderedDriver.z)
 })
 return <><color attach="background" args={['#b5cec2']}/><ambientLight intensity={1.7}/><directionalLight position={[-4,12,8]} intensity={2.5}/><mesh rotation={[-Math.PI/2,0,0]}><planeGeometry args={[150,150]}/><meshStandardMaterial color="#718b69"/></mesh>
  {view!=='observer'&&<group ref={root}>{view==='driver'?<CampusVehicle style="boy" mode="buggy" motion={motion} jersey="#46a88c"/>:<StudentAvatar style="girl" motion={motion} jersey="#956bba"/>}</group>}
  <CampusPeopleScene people={people} session={session} localPose={view==='driver'?localPose:undefined} messages={[]} excludedIds={[]} walking={false} space="outdoors"/>
 </>
}
function Preview(){const [view,setView]=useState<View>('observer'),[late,setLate]=useState(false);return <><header><h1>Shared buggy · four seats</h1><p>Production avatars, people renderer and motion buffer. Local rendering simulation; authenticated boarding is tested separately.</p>{(['driver','passenger','observer'] as const).map(value=><button key={value} aria-pressed={view===value} onClick={()=>setView(value)}>{value}</button>)}<button aria-pressed={late} onClick={()=>setLate(!late)}>{late?'Late packets · 3 Hz':'Normal updates · 10 Hz'}</button></header><Canvas camera={{position:[5,4,5]}} dpr={[1,1.5]}><Ride key={`${view}-${late}`} view={view} late={late}/></Canvas></>}
if(import.meta.env.DEV)createRoot(document.getElementById('root')!).render(<Preview/> )
