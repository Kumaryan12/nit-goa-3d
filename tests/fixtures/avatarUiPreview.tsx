// Local rendering fixture only; no server identity or authentication bypass.
import { StrictMode, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Canvas } from '@react-three/fiber'
import AvatarChoice from '../../src/components/AvatarChoice'
import AvatarStylePicker from '../../src/components/AvatarStylePicker'
import StudentAvatar from '../../src/components/StudentAvatar'
import type { AvatarStyle } from '../../src/lib/profile'
import type { AvatarMotion } from '../../src/lib/avatarMotion'
import '../../src/styles.css'
import '../../src/components/community.css'
import '../../src/components/landing.css'

function Showcase() {
 const [style,setStyle]=useState<AvatarStyle>('girl'),motion=useRef<AvatarMotion>({phase:0,moving:false})
 return <main style={{height:'100dvh',display:'grid',gridTemplateRows:'minmax(200px,1fr) auto',background:'#e5ede1'}}>
   <Canvas camera={{position:[.6,1.4,3.5],fov:38}} dpr={[1,1.3]} onCreated={({camera})=>camera.lookAt(0,.35,0)}><ambientLight intensity={1.8}/><directionalLight position={[3,5,4]} intensity={3}/><group position={[0,-.65,0]} rotation={[0,Math.PI+.25,0]}><StudentAvatar style={style} motion={motion}/></group></Canvas>
   <div style={{width:'min(420px,calc(100% - 40px))',margin:'0 auto 24px'}}><AvatarStylePicker value={style} onChange={setStyle}/></div>
 </main>
}
if(import.meta.env.DEV&&!import.meta.env.VITE_FIREBASE_API_KEY) createRoot(document.getElementById('root')!).render(<StrictMode>{new URL(location.href).searchParams.get('view')==='model'?<Showcase/>:<AvatarChoice onSaved={()=>{}} onBack={()=>{location.href='/tests/fixtures/campus-ui-preview.html?view=walk'}}/>}</StrictMode>)
