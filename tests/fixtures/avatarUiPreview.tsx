// Local rendering fixture only; no server identity or authentication bypass.
import { StrictMode, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { OrbitControls } from '@react-three/drei'
import { stridePhase, motionDelta } from '../../src/lib/avatarMotion'
import { advanceJump, freshJump } from '../../src/lib/avatarJump'
import { useFrame, Canvas } from '@react-three/fiber'
import AvatarChoice from '../../src/components/AvatarChoice'
import AvatarStylePicker from '../../src/components/AvatarStylePicker'
import StudentAvatar from '../../src/components/StudentAvatar'
import type { AvatarStyle } from '../../src/lib/profile'
import type { AvatarMotion } from '../../src/lib/avatarMotion'
import '../../src/styles.css'
import '../../src/components/community.css'
import '../../src/components/landing.css'

type PreviewAction = 'idle' | 'walk' | 'run' | 'jump' | 'wave' | 'dance' | 'sit' | 'bicycle' | 'buggy'
function AnimatedModel({ style, action, back }: { style: AvatarStyle; action: PreviewAction; back: boolean }) {
 const motion = useRef<AvatarMotion>({phase:0,moving:false}), jump = useRef(freshJump()), elapsed=useRef(0)
 const root=useRef<import('three').Group>(null), last=useRef(action)
 useFrame((_,delta)=>{
  const dt=motionDelta(delta);elapsed.current+=dt
  if(last.current!==action){elapsed.current=0;jump.current=freshJump();last.current=action;motion.current.social=undefined}
  const moving=['walk','run','bicycle'].includes(action), speed=action==='run'?5.5:moving?2.3:0
  const airborne=action==='jump'
  advanceJump(jump.current,0,dt,airborne&&elapsed.current%1.6<dt)
  Object.assign(motion.current,{moving,speed,running:action==='run',airborne:!jump.current.grounded,verticalVelocity:jump.current.velocity,phase:stridePhase(motion.current.phase,speed*dt,action==='run'),vehicle:action==='bicycle'||action==='buggy'?action:'walk',seated:action==='sit'})
  if(action==='wave'||action==='dance')motion.current.social={action,startedAt:Date.now()-elapsed.current*1000,until:Date.now()+60000}
  if(root.current)root.current.position.y=-.65+(airborne?jump.current.y??0:0)
 })
 return <group ref={root} position={[0,-.65,0]} rotation={[0,back?.25:Math.PI+.25,0]}><StudentAvatar style={style} motion={motion}/></group>
}
function Showcase() {
 const [style,setStyle]=useState<AvatarStyle>('girl'), [action,setAction]=useState<PreviewAction>('idle'),[back,setBack]=useState(false)
 return <main style={{height:'100dvh',display:'grid',gridTemplateRows:'minmax(220px,1fr) auto',background:'#e5ede1'}}>
   <Canvas shadows camera={{position:[.5,1.5,5],fov:38}} dpr={[1,1.3]} onCreated={({camera})=>camera.lookAt(0,.65,0)}>
    <color attach="background" args={['#e5ede1']}/><ambientLight intensity={1.4}/><directionalLight position={[-3,5,4]} intensity={2.5}/><directionalLight position={[3,2,-4]} intensity={1.2}/>
    <AnimatedModel style={style} action={action} back={back}/><OrbitControls target={[0,.65,0]} enablePan={false} minDistance={2.5} maxDistance={6}/>
   </Canvas>
   <div style={{width:'min(420px,calc(100% - 24px))',margin:'0 auto 12px'}}>
    <div style={{display:'flex',flexWrap:'wrap',gap:6,marginBottom:12}}>{(['idle','walk','run','jump','wave','dance','sit','bicycle','buggy'] as PreviewAction[]).map(value=><button key={value} onClick={()=>setAction(value)} aria-pressed={action===value}>{value}</button>)}<button onClick={()=>setBack(!back)}>Turn around</button></div>
    <AvatarStylePicker value={style} onChange={setStyle}/>
   </div>
 </main>
}

if(import.meta.env.DEV&&!import.meta.env.VITE_FIREBASE_API_KEY) createRoot(document.getElementById('root')!).render(<StrictMode>{new URL(location.href).searchParams.get('view')==='model'?<Showcase/>:<AvatarChoice onSaved={()=>{}} onBack={()=>{location.href='/tests/fixtures/campus-ui-preview.html?view=walk'}}/>}</StrictMode>)
