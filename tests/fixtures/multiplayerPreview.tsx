// Local rendering QA only. This fixture is excluded from production builds.
import { StrictMode, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import CampusPeopleScene from '../../src/components/CampusPeopleScene'
import { GraphicsContext } from '../../src/components/ScenePerformance'
import { GRAPHICS_PROFILES } from '../../src/lib/graphics'
import { PROFILE_COLORS } from '../../src/lib/profile'
import type { CampusPerson, CampusSession } from '../../src/lib/campusProtocol'
import '../../src/components/SocialActions.css'
function Check({ people, wide, report }: { people: CampusPerson[]; wide: boolean; report: (text:string)=>void }) {
  const session = useRef<CampusSession>({id:'host',snapshot:null}), elapsed=useRef(0),frames=useRef(0)
  const camera=useThree(s=>s.camera), prior=useRef<boolean|null>(null)
  useFrame((_,delta)=>{
    if(prior.current!==wide){prior.current=wide;camera.position.set(0,wide?180:12,wide?280:36);camera.lookAt(0,0,0)}
    session.current.snapshot={type:'campus-state',sequence:1,serverTime:Date.now(),people}
    elapsed.current+=delta;frames.current++
    if(elapsed.current>=1){report(`${people.length} simulated visitors · ${Math.round(frames.current/elapsed.current)} fps · ${_.gl.info.render.calls} draw calls`);elapsed.current=0;frames.current=0}
  })
  return <><ambientLight intensity={1.5}/><directionalLight position={[10,20,10]} intensity={2}/><mesh rotation={[-Math.PI/2,0,0]} position={[0,-.02,0]}><planeGeometry args={[150,150]}/><meshStandardMaterial color="#bbcca9"/></mesh><CampusPeopleScene people={people} session={session} messages={[]} excludedIds={[]} space="outdoors" walking={false}/><OrbitControls target={[0,0,0]}/></>
}
function Preview(){
 const [count,setCount]=useState(32),[wide,setWide]=useState(false),[report,setReport]=useState('Preparing crowd…')
 const people=useMemo<CampusPerson[]>(()=>Array.from({length:count},(_,i)=>({id:`visitor_${i}`,name:`Visitor ${i+1}`,handle:null,color:PROFILE_COLORS[i],activity:'walk',pose:{x:(i%8-3.5)*4,y:0,z:-Math.floor(i/8)*6,yaw:0,epoch:1,moving:false,running:false,active:true,visible:true,space:'outdoors',vehicle:i===0?'bicycle':i===1?'buggy':'walk'}})),[count])
 return <><header><h1>Campus crowd rendering check</h1><p>{report}</p><p>Simulated rendering only; authentication is tested separately.</p><button onClick={()=>setCount(count===32?2:32)}>{count===32?'Show 2 visitors':'Show 32 visitors'}</button><button onClick={()=>setWide(!wide)}>{wide?'Near view':'Wide view'}</button></header><Canvas camera={{position:[0,12,36],far:1500}} dpr={1}><GraphicsContext.Provider value={GRAPHICS_PROFILES[0]}><Check people={people} wide={wide} report={setReport}/></GraphicsContext.Provider></Canvas></>
}
createRoot(document.getElementById('root')!).render(<StrictMode><Preview/></StrictMode>)
