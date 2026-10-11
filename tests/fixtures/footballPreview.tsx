// Development-only rehearsal: the actual controller, UI and room physics,
// with in-memory peers. No production sockets, identities or auth bypass.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Canvas } from '@react-three/fiber'
import { createDigitalTwin } from '../../src/lib/digitalTwin'
import type { DigitalTwin } from '../../src/lib/digitalTwin'
import { extractBuildingFootprints } from '../../src/lib/buildings'
import { extractCampusRoads } from '../../src/lib/roads'
import { savedCampusOverrides } from '../../src/data/campusOverrides'
import { createFootballControls, footballPitch, footballToLocal, footballToWorld } from '../../src/lib/football'
import type { FootballStatus } from '../../src/lib/football'
import type { FootballSession } from '../../src/lib/footballProtocol'
import type { CampusPose, CampusSession } from '../../src/lib/campusProtocol'
import type { WalkStatus } from '../../src/lib/walking'
import { emptyWalkInput } from '../../src/lib/walking'
import { FootballMotionBuffer } from '../../src/lib/footballMotion'
import { RemoteMotionBuffer } from '../../src/lib/remoteMotion'
import { createFootballRoom } from '../../server/footballRoom'
import AvatarExplorer from '../../src/components/AvatarExplorer'
import FootballScene from '../../src/components/FootballScene'
import FootballControls from '../../src/components/FootballControls'
import WalkControls from '../../src/components/WalkControls'
import POIObjects from '../../src/components/POIObjects'
import CampusScene from '../../src/components/CampusScene'
import type { SceneMetrics } from '../../src/components/CampusScene'
import '../../src/styles.css'

const noop=()=>{},emptyList=[],spawn={sequence:0,locationId:'sports-ground',football:true},playback={status:'stopped',sequence:0,speed:1} as const,cameraRequest={sequence:0,locationId:null}
const fullScene=new URLSearchParams(location.search).has('full'),movingPeers=new URLSearchParams(location.search).has('moving')

function Rehearsal({ twin }: {twin:DigitalTwin}) {
  const pitch=useMemo(()=>footballPitch(twin.locations.find(p=>p.id==='sports-ground')!),[twin])
  const input=useRef(emptyWalkInput()),football=useRef(createFootballControls()),position=useRef<{x:number;z:number}|null>(null),pose=useRef<CampusPose|null>(null),interior=useRef(null),processed=useRef(-1)
  const campus=useRef<CampusSession>({id:'you',snapshot:null}),session=useRef<FootballSession>({id:'you',snapshot:null,motion:new RemoteMotionBuffer(),ballMotion:new FootballMotionBuffer()})
  const room=useMemo(()=>{const r=createFootballRoom();const self=r.add('you')!;r.add('friend');for(let i=2;i<Math.min(24,Number(new URLSearchParams(location.search).get('players') ?? 2));i++)r.add(`peer-${i}`);position.current=footballToWorld(self,pitch);football.current.arrivalDirection=footballToWorld({x:self.dx,z:self.dz},{...pitch,center:{x:0,z:0}});return r},[pitch])
  const [status,setStatus]=useState<FootballStatus|null>(null),[walk,setWalk]=useState<WalkStatus|null>(null),[paused,setPaused]=useState(false),[latency,setLatency]=useState(false)
  const [metrics,setMetrics]=useState<SceneMetrics|null>(null)
  const peakSpeed=useRef(0),[visibility,setVisibility]=useState<string>(document.visibilityState)
  useEffect(()=>{const t=setInterval(()=>setVisibility(`${document.visibilityState} / ${document.hasFocus()?'focused':'unfocused'}`),1000);return()=>clearInterval(t)},[])
  const reportMetrics=useCallback((m:SceneMetrics)=>setMetrics(m),[])
  const reportFootball=useCallback((s:FootballStatus)=>setStatus(p=>p&&p.blue===s.blue&&p.gold===s.gold&&p.canKick===s.canKick&&p.event===s.event&&p.countdown===s.countdown?p:s),[])
  const reportWalk=useCallback((s:WalkStatus)=>setWalk(p=>p&&p.position.x===s.position.x&&p.position.z===s.position.z&&p.blocked===s.blocked&&p.canJump===s.canJump&&p.error===s.error?p:s),[])
  const players=useMemo(()=>room.snapshot().players,[room])
  useEffect(()=>{
    let kick=football.current.kick,reset=football.current.reset,sequence=room.snapshot().players.find(p=>p.id==='you')?.poseSequence ?? 0,poseAt=0,broadcastAt=0,previous=performance.now(),accumulator=0
    const origins=room.snapshot().players.filter(p=>p.id!=='you'),started=performance.now();let peerAt=0,peerSequence=0
    const deliveries:{at:number;snapshot:ReturnType<typeof room.snapshot>}[]=[]
    const timer=setInterval(()=>{
      const now=performance.now(),a=football.current.actor
      peakSpeed.current=Math.max(peakSpeed.current,a?.speed ?? 0)
      if(movingPeers&&now-peerAt>=100){peerAt=now;peerSequence++;const t=(now-started)/1000;origins.forEach((p,i)=>{const phase=i*.7,v=t+phase;room.handle(p.id,{type:'pose',sequence:peerSequence,x:p.x+2*(Math.cos(v)-Math.cos(phase)),z:p.z+2*(Math.sin(v)-Math.sin(phase)),dx:-Math.sin(v),dz:Math.cos(v),active:true,running:true})})}
      if(a && now-poseAt>=50) {
        const p=footballToLocal(a.position,pitch),d=footballToLocal(a.direction,{...pitch,center:{x:0,z:0}})
        room.handle('you',{type:'pose',sequence:++sequence,...p,dx:d.x,dz:d.z,active:a.active,running:a.running});poseAt=now
        if(kick!==football.current.kick){kick=football.current.kick;room.handle('you',{type:'kick',mode:football.current.action,running:a.running,dx:d.x,dz:d.z})}
      }
      if(reset!==football.current.reset){reset=football.current.reset;room.handle('you',{type:'reset'})}
      accumulator+=Math.min(.1,(now-previous)/1000);previous=now
      while(accumulator>=1/60){room.tick(1/60);accumulator-=1/60}
      if(now-broadcastAt>=50){deliveries.push({at:now+(latency?180:0),snapshot:room.snapshot()});broadcastAt=now-(now-broadcastAt)%50}
      while(deliveries[0]?.at<=now){const s=deliveries.shift()!.snapshot;session.current.snapshot=s;session.current.playerIndex=new Map(s.players.map(p=>[p.id,p]));session.current.ballMotion?.push(s,now);session.current.motion?.push({sequence:s.sequence,serverTime:s.serverTime!,people:s.players.map(p=>{const at=footballToWorld(p,pitch),d=footballToWorld({x:p.dx,z:p.dz},{...pitch,center:{x:0,z:0}});return{id:p.id,pose:{...at,y:pitch.elevation+.11,yaw:Math.atan2(-d.x,-d.z),epoch:0,space:'outdoors',visible:true,active:p.active,moving:p.moving,running:p.running}}})},now)}
    },1000/60)
    return()=>clearInterval(timer)
  },[room,pitch,latency])
  const campusLive={session:campus,ridePending:false,rideError:'',rideBuggy:()=>{}}
  return <main className="explorer walk-mode football-mode panels-hidden toolbar-hidden" style={{height:'100dvh'}}>
    {fullScene ? <CampusScene graphicsMode="auto" scenePrepared onSocialStop={noop} onBuggyRide={noop} campusPeople={emptyList} campusSession={campus} campusPose={pose} campusMessages={emptyList} avatarStyle="boy" oatConcert={null} oatSelfId={null} concertJoined={false} footballPitch={pitch} footballJoined footballLive footballSession={session} footballPlayers={players} footballInput={football} onFootballStatus={reportFootball} hostelPlan={twin.interiors?.hostel ?? null} gyanPlan={twin.interiors?.gyan ?? null} interiorBuildingId={null} interiorPose={interior} processedWalkSpawn={processed} hostelFloor={null} stairLowFloor={null} view="walk" walkPaused={paused} walkInput={input} avatarPosition={position} walkSpawn={spawn} onWalkStatus={reportWalk} onWalkInspect={noop} slopePreview={null} pickingPosition={false} pickedPosition={null} onPickPosition={noop} presentation={null} playback={playback} travelerPosition={position} onWalkComplete={noop} showGrid={false} showContours={false} night={false} twin={twin} cameraRequest={cameraRequest} onRenderedCount={noop} onTerrainReady={noop} onVegetationReady={noop} onMetrics={reportMetrics} selectedBuildingId={null} selectedLocationId={null} onSelectBuilding={noop} onClearSelection={noop}/> : <Canvas camera={{position:[pitch.center.x,pitch.elevation+5,pitch.center.z+7],fov:60}} dpr={1}>
      <color attach="background" args={['#c1d3bf']} /><ambientLight intensity={1.7}/><directionalLight position={[40,80,10]} intensity={2}/>
      <mesh rotation={[-Math.PI/2,0,0]} position={[pitch.center.x,pitch.elevation-.02,pitch.center.z]}><planeGeometry args={[220,220]}/><meshStandardMaterial color="#668b5e"/></mesh>
      <POIObjects locations={twin.locations} terrain={twin.terrain} night={false} />
      <FootballScene pitch={pitch} session={session} campusSession={campus} players={players} controls={football} live onStatus={reportFootball}/>
      <AvatarExplorer avatarStyle="boy" footballJersey="#388fc1" concertJoined={false} concertPose={null} campusSession={campus} campusPose={pose} onSocialStop={()=>{}} onBuggyRide={()=>{}} footballPitch={pitch} footballControls={football} footballLive hostelPlan={null} gyanPlan={null} interiorPose={interior} processedSpawn={processed} twin={twin} paused={paused} input={input} position={position} spawn={{sequence:0,locationId:'sports-ground',football:true}} onStatus={reportWalk} onInspect={()=>{}}/>
    </Canvas>}
    <FootballControls input={football} status={status} connection="live" players={players} selfId="you" paused={paused} onLeave={()=>setPaused(true)} onRetry={()=>{}}/>
    <WalkControls compact football={{input:football,live:true,restarting:!!status?.countdown}} campusLive={campusLive as unknown as React.ComponentProps<typeof WalkControls>['campusLive']} input={input} status={walk} paused={paused} ready locations={twin.locations} onPause={()=>setPaused(p=>!p)} onSpawn={()=>{}} onInspect={()=>{}} onOverview={()=>{}}/>
    <button type="button" onClick={()=>setLatency(p=>!p)} style={{position:'absolute',top:12,left:12,zIndex:50,padding:12}}>Delay packets: {latency?'180 ms':'off'}</button>
    <button type="button" onClick={()=>{
      const friend=room.snapshot().players.find(p=>p.id==='friend')!
      room.handle('friend',{type:'pose',sequence:(friend.poseSequence ?? 0)+1,x:1.4,z:0,dx:-1,dz:0,active:true,running:true})
      if(room.handle('friend',{type:'kick',mode:'shot',running:true}))for(let i=0;i<300;i++) {room.tick(1/60);if(room.snapshot().ball.event==='gold-goal')break}
    }} style={{position:'absolute',top:90,left:12,zIndex:50,padding:8}}>Preview goal</button>
    <output style={{position:'absolute',top:62,left:12,zIndex:50,fontSize:12,color:'#234638'}}>Ball {session.current.snapshot?.ball.x.toFixed(2)}, {session.current.snapshot?.ball.z.toFixed(2)} · {football.current.actor?.active?'active':'inactive'} · avatar {walk?.position.x.toFixed(1)}, {walk?.position.z.toFixed(1)} · visibility {visibility} · peak speed {peakSpeed.current.toFixed(1)}{metrics && ` · ${metrics.fps} fps · p95 ${metrics.p95Ms?.toFixed(1)} ms · worst ${metrics.worstMs?.toFixed(1)} ms · slow ${metrics.slowFrames} · ${metrics.calls} avg calls · ${metrics.triangles} avg triangles · ${metrics.peakCalls} peak calls · ${metrics.peakTriangles} peak triangles`}</output>
  </main>
}
async function run() {
  const [campus,roads]=await Promise.all(['campus','roads'].map(async kind=>(await fetch(`/map/nit-goa-${kind}.json`)).json()))
  const boundary=campus.elements.find((e:{id:number})=>e.id===1259742369).geometry,buildings=extractBuildingFootprints(campus.elements),segments=extractCampusRoads(roads.elements,boundary)
  const twin=createDigitalTwin({buildings,boundary,source:'campus-area',returnedBuildingCount:buildings.length},{roads:segments,boundary,source:'campus-area',returnedRoadCount:segments.length},false,savedCampusOverrides)
  createRoot(document.getElementById('root')!).render(<Rehearsal twin={twin}/>)
}
if(import.meta.env.DEV)void run()
