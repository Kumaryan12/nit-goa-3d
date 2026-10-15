import { Html } from '@react-three/drei'
import ScreeningPlayer from './ScreeningPlayer'
import type { ScreeningPlayerControls } from './ScreeningPlayer'
import type { ScreeningSession } from '../hooks/useScreening'
import { memo, useMemo } from 'react'
import { Boxes, Plaque } from './BuildingInterior'
import { seminarHallHeight } from '../lib/seminarInterior'
import type { SeminarHall } from '../lib/seminarInterior'
import type { HostelPlan } from '../lib/hostelInterior'
interface Box { x:number; y:number; z:number; width:number; height:number; depth:number; angle?:number }

function HallFloor({plan,hall}:{plan:HostelPlan;hall:SeminarHall}) {
  const {rearX,frontX,rise,steps}=plan.seminar!.rake,y=plan.base+.14,z=(hall.minZ+hall.maxZ)/2,depth=hall.maxZ-hall.minZ
  const run=frontX-rearX,angle=-Math.atan2(rise,run),color=hall.id==='seated'?'#464e4a':'#b2a18a'
  const treads=useMemo(()=>Array.from({length:steps},(_,i)=>{
    const x=rearX+(i+.5)*run/steps,elevation=seminarHallHeight(plan.seminar!,hall,x)
    return {x,z,y:y+elevation/2-.07,width:run/steps,height:elevation+.14,depth}
  }),[plan,hall,rearX,run,steps,z,y,depth])
  const nosings=useMemo(()=>treads.map(t=>({...t,x:t.x+t.width/2-.035,y:t.y+t.height/2+.009,width:.07,height:.018,depth:depth-.12})),[treads,depth])
  return <group name={`${hall.id}-${hall.floor}-floor`}>
    <mesh position={[(hall.minX+hall.rearDoor.x)/2,y-.07,z]} receiveShadow><boxGeometry args={[hall.rearDoor.x-hall.minX,.14,depth]}/><meshStandardMaterial color="#ded5c3" roughness={.95}/></mesh>
    <mesh position={[(hall.rearDoor.x+rearX)/2,y+rise-.07,z]} receiveShadow><boxGeometry args={[rearX-hall.rearDoor.x,.14,depth]}/><meshStandardMaterial color={color} roughness={.95}/></mesh>
    {hall.floor==='stepped'?<><Boxes boxes={treads} color={color}/><Boxes boxes={nosings} color="#d3c3a9"/></>:<mesh position={[(rearX+frontX)/2,y+rise/2-.07/Math.cos(angle),z]} rotation={[0,0,angle]} receiveShadow><boxGeometry args={[Math.hypot(run,rise),.14,depth]}/><meshStandardMaterial color={color} roughness={.95}/></mesh>}
    <mesh position={[(frontX+hall.maxX)/2,y-.07,z]} receiveShadow><boxGeometry args={[hall.maxX-frontX,.14,depth]}/><meshStandardMaterial color={color} roughness={.95}/></mesh>
  </group>
}
function SharedStairs({plan}:{plan:HostelPlan}) {
  const layout=plan.seminar!,s=layout.stairs,l=layout.landing,y=plan.base+.14,z=(l.minZ+l.maxZ)/2
  const fittings=useMemo(()=>{
    const steps:Box[]=[],rails:Box[]=[],decks:Box[]=[]
    for(const f of s.flights){
      const run=f.maxZ-f.minZ
      for(let i=0;i<s.steps;i++)steps.push({x:(f.minX+f.maxX)/2,z:f.direction===1?f.minZ+(i+.5)*run/s.steps:f.maxZ-(i+.5)*run/s.steps,y:y+(i+1)*s.rise/s.steps/2,width:f.maxX-f.minX,height:(i+1)*s.rise/s.steps,depth:run/s.steps})
      for(const x of [f.minX,f.maxX])for(let i=0;i<=s.steps;i+=2)rails.push({x,z:f.direction===1?f.minZ+i*run/s.steps:f.maxZ-i*run/s.steps,y:y+i*s.rise/s.steps+.53,width:.055,height:1.06,depth:.055})
    }
    for(const r of layout.landings)decks.push({x:(r.minX+r.maxX)/2,z:(r.minZ+r.maxZ)/2,y:y+s.rise-.08,width:r.maxX-r.minX,height:.16,depth:r.maxZ-r.minZ})
    for(const edge of layout.landingRails){
      const dx=edge.b.x-edge.a.x,dz=edge.b.z-edge.a.z,length=Math.hypot(dx,dz),count=Math.ceil(length/.55)
      rails.push({x:(edge.a.x+edge.b.x)/2,z:(edge.a.z+edge.b.z)/2,y:y+s.rise+1.06,width:length,height:.075,depth:.075,angle:-Math.atan2(dz,dx)})
      for(let i=0;i<=count;i++)rails.push({x:edge.a.x+dx*i/count,z:edge.a.z+dz*i/count,y:y+s.rise+.53,width:.055,height:1.06,depth:.055})
    }
    return {steps,rails,decks}
  },[layout,s,y])
  return <group name="entrance-stairs-rotated-180">
    <Boxes boxes={fittings.steps} color="#d9cdb6"/>
    <Boxes boxes={fittings.decks} color="#d9cdb6"/>
    <Boxes boxes={fittings.rails} color="#7e6847"/>
    {s.flights.flatMap(f=>[f.minX,f.maxX].map(x=><mesh key={`${x}-${f.direction}`} position={[x,y+s.rise/2+1.06,(f.minZ+f.maxZ)/2]} rotation={[-f.direction*Math.atan2(s.rise,f.maxZ-f.minZ),0,0]}><boxGeometry args={[.075,.075,Math.hypot(f.maxZ-f.minZ,s.rise)]}/><meshStandardMaterial color="#7e6847"/></mesh>))}
    <Plaque text="CHAPORA & SAL · REAR ENTRANCES" point={{x:l.minX-.08,z}} normal={{x:-1,z:0}} y={y+s.rise+.65} width={2.7}/>
  </group>
}
function SeminarInterior({screening,playerControls,plan,inside,night,onSelect}:{screening:ScreeningSession;playerControls:React.RefObject<ScreeningPlayerControls|null>;plan:HostelPlan;inside:boolean;night:boolean;onSelect:()=>void}) {
  const layout=plan.seminar!,y=plan.base+.14,h=plan.floorHeight,c=layout.courtyard
  const fittings=useMemo(()=>{
    const stone:Box[]=[],wood:Box[]=[],gold:Box[]=[],seats:Box[]=[],metal:Box[]=[],glass:Box[]=[],lights:Box[]=[],green:Box[]=[],walls:Box[]=[],ceilings:Box[]=[]
    for(const w of plan.walls)if(w.kind!=='rail'){const bottom=w.bottom??0,top=w.top??h;walls.push({x:(w.a.x+w.b.x)/2,z:(w.a.z+w.b.z)/2,y:y+(bottom+top)/2,width:Math.hypot(w.b.x-w.a.x,w.b.z-w.a.z),height:top-bottom,depth:.2,angle:-Math.atan2(w.b.z-w.a.z,w.b.x-w.a.x)})}
    // Pale stone in the court and a darker border leave its centre unobstructed.
    stone.push({x:(c.minX+c.maxX)/2,z:(c.minZ+c.maxZ)/2,y:y-.06,width:c.maxX-c.minX,height:.12,depth:c.maxZ-c.minZ})
    for(const z of [c.minZ+.3,c.maxZ-.3])gold.push({x:(c.minX+c.maxX)/2,z,y:y+.007,width:c.maxX-c.minX,height:.014,depth:.08})
    for(let x=c.minX+2;x<c.maxX;x+=2)metal.push({x,z:(c.minZ+c.maxZ)/2,y:y+.006,width:.015,height:.012,depth:c.maxZ-c.minZ})
    const rear=layout.halls[0].maxX-c.maxX
    stone.push({x:c.maxX+rear/2,z:(c.minZ+c.maxZ)/2,y:y-.06,width:rear,height:.12,depth:c.maxZ-c.minZ})
    ceilings.push({x:c.maxX+rear/2,z:(c.minZ+c.maxZ)/2,y:y+h,width:rear,height:.15,depth:c.maxZ-c.minZ})
    for(const p of layout.planters){stone.push({...p,y:y+p.height/2,height:p.height});wood.push({...p,y:y+p.height+.02,width:p.width-.15,depth:p.depth-.15,height:.05});for(let i=0;i<5;i++)green.push({x:p.x+(i-2)*.4,z:p.z,y:y+.9,width:.48,depth:.5,height:.5})}
    for(const hall of layout.halls){
      const center={x:(hall.minX+hall.maxX)/2,z:(hall.minZ+hall.maxZ)/2},w=hall.maxX-hall.minX,d=hall.maxZ-hall.minZ
      ceilings.push({...center,y:y+h,width:w,height:.15,depth:d})
      // Hall floors below share their exact sloped or stepped walking profile.
      wood.push({...hall.stage,y:y+hall.stage.height/2,height:hall.stage.height})
      // Acoustic timber around each stage; screen and lectern face the audience.
      wood.push({x:hall.maxX-.2,z:center.z,y:y+2.2,width:.15,height:4.4,depth:d-.5})
      metal.push({x:hall.maxX-.32,z:center.z,y:y+2.8,width:.09,height:2.75,depth:5.5})
      if(hall.id!=='seated'||!screening.joined)lights.push({x:hall.maxX-.39,z:center.z,y:y+2.8,width:.035,height:2.55,depth:5.2})
      wood.push({x:hall.stage.x-1,z:center.z+3.8,y:y+1,width:.65,height:1.1,depth:.8})
      for(const side of [-1,1]){
        metal.push({x:hall.stage.x-1,z:center.z+side*(d/2-2),y:y+.9,width:.65,height:.9,depth:.65})
        for(let x=hall.minX+2;x<hall.maxX-2;x+=2.8){
          const inner=side===(hall.id==='seated'?1:-1)
          if(inner&&(x<layout.landing.maxX||hall.doors.some(door=>!door.open&&Math.abs(door.x-x)<1.7)))continue
          const floor=seminarHallHeight(layout,hall,x)
          wood.push({x,z:center.z+side*(d/2-.15),y:y+floor+1.9,width:.12,height:3.5,depth:.12})
          glass.push({x,z:center.z+side*(d/2-.12),y:y+floor+2.3,width:1.5,height:1.7,depth:.035})
        }
      }
      for(const door of [...hall.doors.filter(d=>!d.open),hall.rearDoor]){
        const rear=door.axis==='z',width=rear?.2:2.7,depth=rear?3:.2
        for(const side of [-1,1])gold.push({x:door.x+(rear?0:side*1.4),z:door.z+(rear?side*1.55:0),y:y+door.elevation+1.5,width:rear?.3:.1,height:3,depth:rear?.1:.3})
        walls.push({...door,y:y+(door.elevation+3+h)/2,width,height:h-door.elevation-3,depth})
        gold.push({...door,y:y+door.elevation+3,width:rear?.3:2.9,height:.12,depth:rear?3.2:.3})
        lights.push({...door,y:y+door.elevation+3.2,width:rear?.18:2.2,height:.055,depth:rear?2.5:.18})
      }
      for(const p of hall.seats){
        // Rows face east toward the screen. Rounded upholstery is suggested by
        // layered cushions, with a darker base and short armrests.
        seats.push({...p,y:y+p.elevation+.48,width:.68,height:.16,depth:.66},{x:p.x-.29,z:p.z,y:y+p.elevation+.84,width:.16,height:.76,depth:.68})
        metal.push({...p,y:y+p.elevation+.23,width:.5,height:.46,depth:.52})
        for(const side of [-1,1])wood.push({x:p.x,z:p.z+side*.37,y:y+p.elevation+.66,width:.56,height:.08,depth:.085})
      }
      for(let x=hall.minX+5;x<hall.maxX-3;x+=5)for(const z of [center.z-4,center.z+4]){
        lights.push({x,z,y:y+h-.12,width:1.5,height:.045,depth:.65})
        gold.push({x,z,y:y+h-.06,width:1.65,height:.05,depth:.8})
      }
    }
    return {stone,wood,gold,seats,metal,glass,lights,green,walls,ceilings}
  },[plan,layout,y,h,c,screening.joined])
  return <group name="seminar-courtyard-and-two-halls" onClick={e=>{e.stopPropagation();if(e.delta<=2)onSelect()}}>
    <Boxes boxes={fittings.stone} color="#ded5c3"/>
    <group name="courtyard-entrance-frame">
      {[c.minZ+.2,c.maxZ-.2].map(z=><mesh key={z} position={[c.minX,y+1.6,z]} castShadow><boxGeometry args={[.4,3.2,.4]}/><meshStandardMaterial color="#ede3ce"/></mesh>)}
      <mesh position={[c.minX,y+3.3,(c.minZ+c.maxZ)/2]} castShadow><boxGeometry args={[.6,.3,c.maxZ-c.minZ]}/><meshStandardMaterial color="#bba174"/></mesh>
    </group>
    <SharedStairs plan={plan}/>
    <Boxes boxes={fittings.green} color="#49724d" rounded/>
    {inside&&<>
      <Boxes boxes={fittings.gold} color="#bba174"/>
      <Boxes boxes={fittings.walls} color={screening.joined?'#283239':'#ede3ce'}/>
      <Boxes boxes={fittings.ceilings} color={screening.joined?'#20292f':'#f4ebdd'}/>
      {layout.halls.map(hall=><HallFloor key={hall.id} plan={plan} hall={hall}/>)}
      <Boxes boxes={fittings.wood} color={screening.joined?'#493426':'#8e6445'}/>
      <Boxes boxes={fittings.seats} color={screening.joined?'#765238':'#bd8b56'} rounded/>
      <Boxes boxes={fittings.metal} color="#283e3b"/>
      <Boxes boxes={fittings.glass} color="#548d9a"/>
      <Boxes boxes={screening.joined?fittings.lights.filter(p=>p.z>layout.halls[0].maxZ):fittings.lights} color="#fff3d0" glow/>
      {layout.halls.map(hall=>{
        const normal={x:0,z:hall.id==='seated'?1:-1}
        return <group key={hall.id}>
          {hall.doors.filter(d=>!d.open).map((p,i)=><Plaque key={i} text={hall.id==='seated'?'CHAPORA HALL':'SAL SEMINAR HALL'} point={{x:p.x,z:p.z+normal.z*.16}} normal={normal} y={y+p.elevation+3.55} width={2.8}/>)}
          <Plaque text={hall.id==='seated'?'CHAPORA · REAR ENTRY':'SAL · REAR ENTRY'} point={{x:hall.rearDoor.x-.16,z:hall.rearDoor.z}} normal={{x:-1,z:0}} y={y+hall.rearDoor.elevation+3.55} width={3.1}/>
          {!(hall.id==='seated'&&screening.joined)&&<Plaque text={hall.id==='seated'?'CHAPORA · NIT GOA':'SAL · NIT GOA'} point={{x:hall.maxX-.44,z:hall.stage.z}} normal={{x:-1,z:0}} y={y+2.8} width={4.6}/>}
          {hall.id==='seated'&&screening.joined&&screening.room?.media&&<Html transform distanceFactor={2.1} position={[hall.maxX-.46,y+2.8,hall.stage.z]} rotation={[0,-Math.PI/2,0]} zIndexRange={[30,0]}><ScreeningPlayer muted={screening.muted} volume={screening.volume} setMuted={screening.setMuted} setVolume={screening.setVolume} onEnded={() => { if(screening.admin&&!screening.room?.loop)screening.command('pause') }} room={screening.room} serverNow={screening.serverNow} controls={playerControls}/></Html>}
          {<pointLight position={[hall.stage.x-8,y+4,hall.stage.z]} color="#ffe3b8" intensity={hall.id==='seated'&&screening.joined?12:night?170:90} distance={30} decay={2} castShadow={false}/>}
        </group>
      })}
      <Plaque text="LOWER ENTRANCES · COURTYARD" point={{x:c.maxX-.14,z:(c.minZ+c.maxZ)/2}} normal={{x:-1,z:0}} y={y+2.9} width={3}/>
      <ambientLight intensity={screening.joined?.08:night?.4:.2} color="#fff0d5"/>
    </>}
    <Plaque text={inside?'← CHAPORA   ·   SAL →':'SEMINAR COMPLEX · ENTER'} point={{x:plan.entrance.point.x-.18,z:plan.entrance.point.z}} normal={{x:-1,z:0}} y={y+3.2} width={4.5}/>
  </group>
}
export default memo(SeminarInterior)
