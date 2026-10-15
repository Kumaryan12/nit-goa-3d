import { useCallback, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Canvas, useThree } from '@react-three/fiber'
import SeminarInterior from '../../src/components/SeminarInterior'
import ScreeningControls from '../../src/components/ScreeningControls'
import type { ScreeningPlayerControls } from '../../src/components/ScreeningPlayer'
import StudentAvatar from '../../src/components/StudentAvatar'
import CampusPeopleScene from '../../src/components/CampusPeopleScene'
import { createScreeningLayout } from '../../src/lib/screening'
import type { HostelPlan } from '../../src/lib/hostelInterior'
import { prepareDigitalTwin } from '../../src/lib/prepareDigitalTwin'
import { extractBuildingFootprints } from '../../src/lib/buildings'
import { extractCampusRoads } from '../../src/lib/roads'
import { savedCampusOverrides } from '../../src/data/campusOverrides'
import { defaultTerrainSettings } from '../../src/data/topography'
import { parseCampusSnapshot } from '../../src/lib/campusProtocol'
import type { CampusSession, CampusPerson } from '../../src/lib/campusProtocol'
import { useScreening } from '../../src/hooks/useScreening'
import type { CampusConnection } from '../../src/hooks/useCampusSession'
import { liveRetryDelay } from '../../src/lib/liveRecovery'
import '../../src/styles.css'
import '../../src/components/screening.css'
const who = new URL(location.href).searchParams.get('who') === 'alice' ? 'alice' : new URL(location.href).searchParams.get('who') === 'bob' ? 'bob' : 'owner'
function View({plan,seat}:{plan:HostelPlan;seat:number|undefined}) {
  const camera=useThree(s=>s.camera)
  useEffect(()=>{const hall=plan.seminar!.halls[0],p=seat===undefined?null:createScreeningLayout(plan).seats[seat];camera.position.set(p?p.x-4:hall.minX+17,p?p.y+2.3:plan.base+5,p?p.z+.2:hall.stage.z);camera.lookAt(hall.maxX-.5,plan.base+2.94,hall.stage.z)},[camera,plan,seat])
  return null
}
function Preview() {
  const [retry,setRetry]=useState(0),[transportError,setTransportError]=useState('')
  const attempts=useRef(0)
  const [connection,setConnection]=useState<CampusConnection>('connecting'),[people,setPeople]=useState<CampusPerson[]>([]),[plan,setPlan]=useState<HostelPlan|null>(null)
  const session=useRef<CampusSession>({id:null,snapshot:null}),socket=useRef<WebSocket|null>(null),listeners=useRef(new Set<(v:unknown)=>void>())
  const sendScreening=useCallback((v:unknown)=>{if(socket.current?.readyState!==WebSocket.OPEN)return false;socket.current.send(JSON.stringify(v));return true},[])
  const subscribeScreening=useCallback((fn:(v:unknown)=>void)=>{listeners.current.add(fn);return()=>{listeners.current.delete(fn)}},[])
  const rejoin=useCallback(()=>{attempts.current=0;setRetry(n=>n+1)},[])
  const screening=useScreening({connection,session,sendScreening,subscribeScreening,error:transportError,queue:0,rejoin},who==='owner'),player=useRef<ScreeningPlayerControls|null>(null),motion=useRef({phase:0,moving:false,speed:0,seated:true})
  useEffect(()=>{
    let active=true,lastError='',timer:number|undefined
    setConnection('connecting');setTransportError('');session.current={id:null,snapshot:null}
    const ws=new WebSocket('ws://127.0.0.1:5182/presence');socket.current=ws
    ws.onmessage=e=>{
      if(!active)return
      const v=JSON.parse(e.data)
      if(v.type==='auth-required')ws.send(JSON.stringify({type:'authenticate',token:'screening-'+who}))
      if(v.type==='error'&&typeof v.message==='string'){lastError=v.message;setTransportError(v.message)}
      if(v.type==='campus-welcome'){session.current.id=v.id;attempts.current=0;setConnection('live');setTransportError('')}
      for(const fn of listeners.current)fn(v)
      const snapshot=parseCampusSnapshot(v);if(snapshot){session.current.snapshot=snapshot;session.current.peopleById=new Map(snapshot.people.map(p=>[p.id,p]));setPeople(snapshot.people)}
    }
    ws.onerror=()=>{if(active){lastError='The local screening server is unavailable. Reconnect after it starts.';setTransportError(lastError)}}
    ws.onclose=event=>{
      if(!active)return
      session.current={id:null,snapshot:null};setPeople([])
      for(const fn of listeners.current)fn({type:'cafe-voice-reset'})
      // A hot reload can authenticate before its previous close handshake
      // reaches the server. Retry that short race, but keep real duplicate
      // tabs rejected rather than taking over another viewer’s session.
      const attempt=attempts.current++
      const delay=lastError.includes('already joined')&&attempt<2?350:liveRetryDelay(event.code,attempt)
      setConnection(delay===null?'offline':'reconnecting')
      setTransportError(lastError||event.reason||'The local screening connection was interrupted.')
      if(delay!==null)timer=window.setTimeout(()=>setRetry(n=>n+1),delay)
    }
    const deadline=window.setTimeout(()=>{if(active&&ws.readyState!==WebSocket.OPEN)ws.close(4000,'Connection timeout')},10000)
    return()=>{active=false;clearTimeout(timer);clearTimeout(deadline);ws.close();socket.current=null}
  },[retry])
  useEffect(()=>{
    void Promise.all(['campus','roads'].map(kind=>fetch(`/map/nit-goa-${kind}.json`).then(r=>r.json()))).then(([map,roads])=>{
      const boundary=map.elements.find((e:{id:number})=>e.id===1259742369).geometry
      const twin=prepareDigitalTwin({id:1,map:{buildings:extractBuildingFootprints(map.elements),boundary,source:'campus-area',returnedBuildingCount:22},roads:{roads:extractCampusRoads(roads.elements,boundary),boundary,source:'campus-area',returnedRoadCount:20},settled:true,overrides:savedCampusOverrides,terrainSettings:defaultTerrainSettings})
      setPlan(twin.interiors!.seminar!)
    })
  },[])
  const place=plan&&screening.seat!==undefined?createScreeningLayout(plan).seats[screening.seat]:null
  return <main className="explorer" style={{height:'100dvh'}}>
    <div style={{position:'absolute',top:20,left:20,zIndex:100,color:'#f5ecd9',background:'#17221fec',padding:14,borderRadius:12,fontSize:12}}>LOCAL REHEARSAL · {who} · {connection} · {screening.room?.participants.length??0} seated <a style={{color:'#e9cb90',marginLeft:16}} href="?who=owner">Host tab</a> <a style={{color:'#e9cb90',marginLeft:8}} href="?who=alice">Audience tab</a></div>
    <Canvas dpr={[1,1.25]} camera={{position:[0,50,50],fov:60}}><color attach="background" args={['#b7c4bf']}/><ambientLight intensity={.8}/><directionalLight position={[20,50,30]} intensity={1.2}/>{plan&&<><View plan={plan} seat={screening.seat}/><SeminarInterior plan={plan} inside night={false} onSelect={()=>{}} screening={screening} playerControls={player}/>{place&&<group position={[place.x,place.y,place.z]} rotation={[0,place.yaw,0]}><StudentAvatar motion={motion} jersey="#367f73"/></group>}<CampusPeopleScene people={people} session={session} messages={[]} excludedIds={[]} space="seminar:0" walking/></>}</Canvas>
    <ScreeningControls session={screening} admin={who==='owner'} onJoin={screening.join} onClose={()=>{}} player={player}/>
  </main>
}
if(import.meta.env.DEV){
  const root=createRoot(document.getElementById('root')!)
  root.render(<Preview/>)
  import.meta.hot?.dispose(()=>root.unmount())
}
