import { gpsToLocal } from './geo.ts'
import type { LocalCoordinate as Point } from './geo.ts'
import type { BuildingFootprint } from '../types/osm.ts'
import type { HostelPlan, InteriorWall } from './hostelInterior.ts'

export const SEMINAR_ID = 'way/1423803680'
export interface SeminarBox { x:number; z:number; width:number; depth:number; height:number; elevation?:number }
export interface SeminarDoor extends Point { elevation:number; route:'upper'|'lower'; axis?:'x'|'z'; open?:boolean }
export interface SeminarHall { id:'seated'|'open'; name:string; floor:'sloped'|'stepped'; minX:number; maxX:number; minZ:number; maxZ:number; doors:SeminarDoor[]; rearDoor:SeminarDoor; stage:SeminarBox; seats:(Point & { elevation:number })[] }
export interface SeminarRect { minX:number; maxX:number; minZ:number; maxZ:number }
export interface SeminarFlight extends SeminarRect { direction:1|-1 }
export interface SeminarLayout { courtyard:SeminarRect; halls:SeminarHall[]; planters:SeminarBox[]; stairs:SeminarRect & { rise:number; steps:number; flights:SeminarFlight[] }; landing:SeminarRect; landings:SeminarRect[]; landingRails:{a:Point;b:Point}[]; rake:{ rearX:number; frontX:number; rise:number; steps:number } }
const rectangle=(x0:number,z0:number,x1:number,z1:number):Point[]=>[{x:x0,z:z0},{x:x1,z:z0},{x:x1,z:z1},{x:x0,z:z1},{x:x0,z:z0}]
const inRect=(p:Point,r:SeminarRect,pad=0)=>p.x>=r.minX-pad&&p.x<=r.maxX+pad&&p.z>=r.minZ-pad&&p.z<=r.maxZ+pad
const clamp=(v:number)=>Math.max(0,Math.min(1,v))
export const seminarRakeHeight=(layout:SeminarLayout,x:number)=>layout.rake.rise*(1-clamp((x-layout.rake.rearX)/(layout.rake.frontX-layout.rake.rearX)))
export function seminarHallHeight(layout:SeminarLayout,hall:SeminarHall,x:number):number {
  if(hall.floor==='sloped')return seminarRakeHeight(layout,x)
  const {rearX,frontX,rise,steps}=layout.rake,t=clamp((x-rearX)/(frontX-rearX))
  // Broad 1.5 m terraces with 30 cm risers, including a flat upper approach and
  // a flat lower approach. Rendering and walking use this same profile.
  return rise*(1-Math.floor(t*steps)/steps)
}

// The owner confirms two approaches to both halls: lower courtyard doors and
// left/right stair flights joining one upper landing behind the halls. Chapora slopes toward its stage; Sal descends
// in broad steps, as clarified by the owner.
// The U footprint is mapped; detailed run/rise dimensions remain illustrative.
export function createSeminarPlan(building:BuildingFootprint,safe:(point:Point)=>boolean):HostelPlan|null {
  if(building.id!==SEMINAR_ID)return null
  const ring=building.outer.map(gpsToLocal),xs=[...new Set(ring.map(p=>p.x))].sort((a,b)=>a-b),zs=[...new Set(ring.map(p=>p.z))].sort((a,b)=>a-b)
  if(xs.length!==3||zs.length!==4)return null
  const [x0,join,x1]=xs,[z0,north,south,z1]=zs
  if(x1-x0<25||join-x0<20||south-north<5||north-z0<12||z1-south<12)return null
  const midZ=(north+south)/2,point={x:x0,z:midZ},inward={x:1,z:0},along={x:0,z:1},outside={x:x0-2.4,z:midZ},inside={x:x0+1.2,z:midZ}
  if(!safe(outside))return null
  const flights:SeminarFlight[]=[{minX:x0,maxX:x0+2.4,minZ:midZ-9,maxZ:midZ-1.5,direction:-1},{minX:x0,maxX:x0+2.4,minZ:midZ+1.5,maxZ:midZ+9,direction:1}]
  const stairs={minX:flights[0].minX,maxX:flights[0].maxX,minZ:flights[0].minZ,maxZ:flights[1].maxZ,rise:3,steps:20,flights}
  const landing={minX:stairs.maxX+.8,maxX:x0+13.5,minZ:north,maxZ:south}
  // Each flight is rotated 180 degrees within its existing footprint.
  // Reconnect its high end to the same rear gallery.
  const approaches=[{minX:stairs.minX,maxX:landing.minX,minZ:midZ-11.8,maxZ:midZ-9},{minX:stairs.minX,maxX:landing.minX,minZ:midZ+9,maxZ:midZ+11.8}]
  const landings=[landing,...approaches,{minX:landing.minX,maxX:x0+13.5,minZ:z0,maxZ:north},{minX:landing.minX,maxX:x0+13.5,minZ:south,maxZ:z1}]
  const landingRails=[
    ...approaches.flatMap((r,i)=>[
      {a:{x:r.minX,z:r.minZ},b:{x:r.minX,z:r.maxZ}},
      {a:{x:stairs.maxX,z:i===0?r.maxZ:r.minZ},b:{x:r.maxX,z:i===0?r.maxZ:r.minZ}},
      {a:{x:r.minX,z:i===0?r.minZ:r.maxZ},b:{x:r.maxX,z:i===0?r.minZ:r.maxZ}},
    ]),
    ...[[z0,approaches[0].minZ],[approaches[0].maxZ,approaches[1].minZ],[approaches[1].maxZ,z1]].map(([lo,hi])=>({a:{x:landing.minX,z:lo},b:{x:landing.minX,z:hi}})),
    {a:{x:landing.maxX,z:north},b:{x:landing.maxX,z:south}},
  ]
  const courtyard={minX:x0,maxX:join,minZ:north,maxZ:south}
  const rake={rearX:x0+14.2,frontX:join-4.8,rise:stairs.rise,steps:10}
  const wall=(a:Point,b:Point,kind:InteriorWall['kind']='outer',bottom?:number,top?:number):InteriorWall=>({a,b,kind,...(bottom===undefined?{}:{bottom}),...(top===undefined?{}:{top})})
  const walls:InteriorWall[]=[wall({x:x0,z:z0},{x:x1,z:z0}),wall({x:x1,z:z0},{x:x1,z:z1}),wall({x:x1,z:z1},{x:x0,z:z1}),wall({x:x0,z:z0},{x:x0,z:north}),wall({x:x0,z:south},{x:x0,z:z1})]
  const halls:SeminarHall[]=[['seated',z0,north],['open',south,z1]].map(([id,lo,hi])=>{
    const minZ=Number(lo),maxZ=Number(hi),inner=id==='seated'?maxZ:minZ
    const doors:SeminarDoor[]=[{x:(landing.minX+landing.maxX)/2,z:inner,elevation:stairs.rise,route:'upper',open:true},{x:join-3.4,z:inner,elevation:0,route:'lower'}]
    // The upper foyer opens across its full width into the shared concourse.
    // Solid courtyard walls begin only beyond the rear hall partitions.
    let from=landing.maxX
    for(const door of doors.filter(d=>!d.open)){
      walls.push(wall({x:from,z:inner},{x:door.x-1.35,z:inner}));from=door.x+1.35
      if(door.elevation)walls.push(wall({x:door.x-1.35,z:inner},{x:door.x+1.35,z:inner},'outer',0,door.elevation))
    }
    walls.push(wall({x:from,z:inner},{x:x1,z:inner}))
    const rearDoor:SeminarDoor={x:rake.rearX-.7,z:(minZ+maxZ)/2,elevation:stairs.rise,route:'upper',axis:'z'}
    walls.push(wall({x:rearDoor.x,z:minZ},{x:rearDoor.x,z:rearDoor.z-1.5}),wall({x:rearDoor.x,z:rearDoor.z+1.5},{x:rearDoor.x,z:maxZ}),wall({x:rearDoor.x,z:rearDoor.z-1.5},{x:rearDoor.x,z:rearDoor.z+1.5},'outer',0,stairs.rise))
    const stage={x:x1-3.2,z:(minZ+maxZ)/2,width:4.2,depth:maxZ-minZ-3,height:.45,elevation:0}
    const seats:(Point&{elevation:number})[]=[]
    if(id==='seated')for(let row=0;row<15;row++)for(const side of [-1,1])for(let col=0;col<7;col++){
      const x=x0+14.5+row
      seats.push({x,z:stage.z+side*(1.35+col*.87),elevation:rake.rise*(1-clamp((x-rake.rearX)/(rake.frontX-rake.rearX)))})
    }
    return {id:id as SeminarHall['id'],name:id==='seated'?'Chapora Hall':'Sal Seminar Hall',floor:id==='seated'?'sloped' as const:'stepped' as const,minX:x0,maxX:x1,minZ,maxZ,doors,rearDoor,stage,seats}
  })
  // Rail collision has an explicit height, allowing the courtyard passage
  // underneath the upper landing instead of sealing it with an invisible wall.
  for(const flight of flights)for(const x of [flight.minX,flight.maxX])for(let i=0;i<stairs.steps;i++){
    const z=(step:number)=>flight.direction===1?flight.minZ+step*(flight.maxZ-flight.minZ)/stairs.steps:flight.maxZ-step*(flight.maxZ-flight.minZ)/stairs.steps,top=(i+1)*stairs.rise/stairs.steps
    walls.push(wall({x,z:z(i)},{x,z:z(i+1)},'rail',top-.15,top+1.1))
  }
  for(const edge of landingRails)walls.push(wall(edge.a,edge.b,'rail',stairs.rise,stairs.rise+1.1))
  const planters:SeminarBox[]=[north+1,south-1].flatMap(z=>[x0+18,x0+25].map(x=>({x,z,width:2.4,depth:.8,height:.7})))
  const obstacles=[...halls.flatMap(h=>[h.stage,...h.seats.map(p=>({...p,width:.78,depth:.72,height:1.15}))]),...planters].map(p=>({center:{x:p.x,z:p.z},along:{x:1,z:0},inward:{x:0,z:1},width:p.width,depth:p.depth,height:p.height,elevation:p.elevation??0}))
  const unused={x:x1+20,z:z1+20}
  return {kind:'seminar',name:'Seminar Complex',locationId:SEMINAR_ID,buildingId:building.id,building,outer:rectangle(x0,z0,x1,z1),holes:[],walls,rooms:[],obstacles,seminar:{courtyard,halls,planters,stairs,landing,landings,landingRails,rake},entrance:{point,inside,outside,inward,along},stairs:{start:unused,end:unused,along:inward,across:along,length:0,width:0,hole:[]},base:building.baseElevation??0,floorHeight:Math.max(7.5,building.height),levels:1}
}
export function seminarFlightHeight(layout:SeminarLayout,flight:SeminarFlight,z:number):number {
  const t=clamp((flight.direction===1?z-flight.minZ:flight.maxZ-z)/(flight.maxZ-flight.minZ))
  return Math.ceil(t*layout.stairs.steps-1e-8)*layout.stairs.rise/layout.stairs.steps
}
export const seminarDoors=(plan:HostelPlan)=>plan.seminar?.halls.flatMap(h=>[...h.doors.filter(d=>!d.open),h.rearDoor])??[]
export function nearSeminarDoor(p:Point,d:SeminarDoor,halfWidth:number,depth:number):boolean {return d.axis==='z'?Math.abs(p.z-d.z)<halfWidth&&Math.abs(p.x-d.x)<depth:Math.abs(p.x-d.x)<halfWidth&&Math.abs(p.z-d.z)<depth}
export function seminarInCourtyard(plan:HostelPlan,p:Point):boolean {return !!plan.seminar&&inRect(p,plan.seminar.courtyard)}
export function seminarOnLanding(plan:HostelPlan,p:Point):boolean {return !!plan.seminar?.landings.some(r=>inRect(p,r))}
export function seminarOnStairs(plan:HostelPlan,p:Point):boolean {return !!plan.seminar?.stairs.flights.some(f=>inRect(p,f))}
export function seminarStepHeightAt(plan:HostelPlan,p:Point):number {
  const layout=plan.seminar
  return layout?.halls.some(h=>h.floor==='stepped'&&inRect(p,h))?Math.min(.35,Math.max(.23,layout.rake.rise/layout.rake.steps+.02)):.23
}
export function seminarSurfaceHeightAt(plan:HostelPlan,p:Point,previousFeetY?:number):number {
  const base=plan.base+.14,l=plan.seminar
  if(!l)return base
  const flight=l.stairs.flights.find(f=>inRect(p,f))
  if(flight)return base+seminarFlightHeight(l,flight,p.z)
  if(seminarOnLanding(plan,p))return base+(previousFeetY===undefined||previousFeetY>=base+l.stairs.rise-.35?l.stairs.rise:0)
  const hall=l.halls.find(h=>p.x>=h.rearDoor.x&&p.x<=h.maxX&&p.z>=h.minZ&&p.z<=h.maxZ)
  if(hall)return base+seminarHallHeight(l,hall,p.x)
  return base
}
export function seminarAreaLabel(plan:HostelPlan,p:Point,feetY?:number):string|null {
  const l=plan.seminar;if(!l)return null
  const hall=l.halls.find(h=>p.x>=h.minX&&p.x<=h.maxX&&p.z>=h.minZ&&p.z<=h.maxZ)
  const flight=l.stairs.flights.findIndex(f=>inRect(p,f))
  return flight>=0?`${flight===0?'Left':'Right'} entrance stairs`:seminarOnLanding(plan,p)&&seminarSurfaceHeightAt(plan,p,feetY)>plan.base+1?'Rear entrances · Chapora & Sal':hall&&p.x>=hall.rearDoor.x?hall.name:hall?'Entrance foyer':'Entrance courtyard'
}
export function seminarOpenSky(plan:HostelPlan,p:Point):boolean {return seminarInCourtyard(plan,p)&&!seminarOnLanding(plan,p)}
export function seminarCeilingAt(plan:HostelPlan,p:Point,feetY?:number):number {
  if(seminarOnLanding(plan,p)&&seminarSurfaceHeightAt(plan,p,feetY)<plan.base+1)return plan.base+.14+plan.seminar!.stairs.rise-.16
  if(seminarInCourtyard(plan,p))return Infinity
  return plan.base+plan.floorHeight
}
export function seminarDestination(plan:HostelPlan,area:string):Point|null {
  const l=plan.seminar;if(!l)return null
  if(area==='courtyard')return {...plan.entrance.inside}
  if(area==='upper')return {x:(l.landing.minX+l.landing.maxX)/2,z:(l.landing.minZ+l.landing.maxZ)/2}
  const hall=l.halls.find(h=>h.id===area)
  return hall?{x:hall.rearDoor.x+.6,z:(hall.minZ+hall.maxZ)/2}:null
}
