import { BOYS_HOSTEL_BUILDING_ID, hostelBadmintonCourt } from './boysHostelGeometry.ts'
import { pointInCampus } from './roads.ts'
import { distanceToSegment } from './terrain.ts'
import type { LocalCoordinate as Point } from './geo.ts'
import type { HostelPlan, InteriorWall } from './hostelInterior.ts'

export interface HostelLift { id: string; bank: 'plain' | 'badminton'; center: Point; along: Point; facing: Point; landing: Point; width: number; depth: number }
export interface HostelCourtyardEntry { id: 'plain' | 'badminton'; ring: Point[]; point: Point; along: Point; inward: Point; inside: Point; outside: Point; width: number }
export interface HostelCorridor { id: string; name: string; points: Point[]; width: number }
const add=(p:Point,v:Point,d:number):Point=>({x:p.x+v.x*d,z:p.z+v.z*d})
const distance=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.z-b.z)
const center=(ring:Point[])=>ring.slice(0,-1).reduce((p,q)=>({x:p.x+q.x/(ring.length-1),z:p.z+q.z/(ring.length-1)}),{x:0,z:0})
const rectangle=(p:Point,a:Point,b:Point,w:number,d:number)=>[[-1,-1],[1,-1],[1,1],[-1,1]].map(([u,v])=>add(add(p,a,u*w),b,v*d))
const solid=(p:Point,plan:HostelPlan,radius=0)=>pointInCampus(p,plan.outer)&&!plan.holes.some(h=>pointInCampus(p,h)||h.some((a,i)=>distanceToSegment(p,a,h[(i+1)%h.length])<radius))&&plan.outer.every((a,i)=>distanceToSegment(p,a,plan.outer[(i+1)%plan.outer.length])>=radius)

// Relative positions follow the owner's walkthrough; dimensions and exact
// coordinates remain editable approximations within the mapped footprint.
export function refineBoysHostelPlan(plan:HostelPlan,isOutdoorSafe:(p:Point)=>boolean):HostelPlan {
  if(plan.buildingId!==BOYS_HOSTEL_BUILDING_ID||plan.holes.length!==2)return plan
  const rings=[...plan.holes].sort((a,b)=>center(a).z-center(b).z)
  const plain=center(rings[0]),badminton=center(rings[1])
  const edges=plan.outer.slice(1).map((b,i)=>{
    const a=plan.outer[i],length=distance(a,b),along={x:(b.x-a.x)/length,z:(b.z-a.z)/length}
    let inward={x:-along.z,z:along.x};if(!solid(add(add(a,along,length/2),inward,.25),plan))inward={x:-inward.x,z:-inward.z}
    return {a,b,length,along,inward}
  })
  // Entrance at the inner elbow between the two hostel wings, facing the
  // northwest courtyard; the southeast court is reached by turning right.
  const candidates=edges.filter(e=>e.length>15).flatMap(e=>Array.from({length:19},(_,i)=>{
    const point=add(e.a,e.along,e.length*(i+1)/20),inside=add(point,e.inward,2.4),outside=add(point,e.inward,-2.4)
    const toPlain={x:plain.x-inside.x,z:plain.z-inside.z},toCourt={x:badminton.x-inside.x,z:badminton.z-inside.z},right={x:-e.inward.z,z:e.inward.x}
    return {point,inside,outside,inward:e.inward,along:e.along,score:distance(point,{x:12,z:-370}),forward:toPlain.x*e.inward.x+toPlain.z*e.inward.z,right:toCourt.x*right.x+toCourt.z*right.z}
  })).filter(e=>e.forward>5&&e.right>5&&solid(e.inside,plan,.6)&&isOutdoorSafe(e.outside)).sort((a,b)=>a.score-b.score)
  const selected=candidates[0];if(!selected)return plan
  const {point,inside,outside,inward,along}=selected
  const entrance={point,inside,outside,inward,along}
  const forward=entrance.inward,right={x:-forward.z,z:forward.x}
  const stairsCenter=add(add(entrance.inside,forward,5.2),right,-4)
  const stairs={start:add(stairsCenter,right,-3.2),end:add(stairsCenter,right,3.2),along:right,across:forward,length:6.4,width:2.6,hole:rectangle(stairsCenter,right,forward,3.2,1.3)}
  if(!stairs.hole.every(p=>solid(p,plan,.3))||![add(stairs.start,right,-1.2),add(stairs.end,right,1.2)].every(p=>solid(p,plan,.5)))return plan
  const gate=(ring:Point[],id:'plain'|'badminton'):HostelCourtyardEntry=>{
    const edge=ring.slice(1).map((b,i)=>({a:ring[i],b,length:distance(ring[i],b)})).filter(e=>e.length>10).sort((a,b)=>id==='plain'?(b.a.z+b.b.z)-(a.a.z+a.b.z):(a.a.z+a.b.z)-(b.a.z+b.b.z))[0]
    const along={x:(edge.b.x-edge.a.x)/edge.length,z:(edge.b.z-edge.a.z)/edge.length},point=add(edge.a,along,edge.length*(id==='plain'?.12:.5))
    let inward={x:-along.z,z:along.x};if(!pointInCampus(add(point,inward,.2),ring))inward={x:-inward.x,z:-inward.z}
    return {id,ring,point,along,inward,inside:add(point,inward,2.4),outside:add(point,inward,-2.4),width:2.4}
  }
  const courtyards=[gate(rings[0],'plain'),gate(rings[1],'badminton')]
  const facing={x:-forward.x,z:-forward.z}
  const lifts:HostelLift[]=[{bank:'plain' as const,center:{x:16.5,z:-379.4}},{bank:'badminton' as const,center:{x:27.5,z:-373.4}}].flatMap((bank,index)=>[0,1].map(i=>{
    const p=add(bank.center,right,i*2.5)
    return {id:String(index*2+i+1),bank:bank.bank,center:p,along:right,facing,landing:add(p,facing,2.6),width:2,depth:2}
  }))
  if(lifts.some(l=>!rectangle(l.center,l.along,l.facing,1.1,1.1).every(p=>solid(p,plan,.3))||!solid(l.landing,plan,.6)))return plan
  const corridors:HostelCorridor[]=[
    {id:'left',name:'Left corridor',points:[add(add(entrance.inside,forward,1),right,-4),{x:-15,z:-377},{x:-16,z:-394}],width:3.2},
    {id:'plain-end',name:'Plain courtyard wing',points:[{x:21,z:-377},{x:23,z:-386},{x:25,z:-405}],width:3.2},
    {id:'south',name:'South corridor',points:[{x:24,z:-373},{x:17,z:-363},{x:15,z:-333}],width:3.2},
    {id:'badminton-end',name:'Badminton courtyard wing',points:[{x:32,z:-371},{x:49,z:-369},{x:49,z:-337}],width:3.2},
  ]
  const accessPaths=[...corridors.map(c=>c.points),[entrance.inside,{x:12,z:-377},courtyards[0].outside],[entrance.inside,{x:23,z:-374},courtyards[1].outside],...lifts.map(l=>[l.landing,add(l.landing,facing,1.5)])]
  const rooms=plan.rooms.filter(room=>{
    const reach=Math.hypot(room.width,room.depth)/2+1.6
    return distance(room.center,stairsCenter)>8&&!lifts.some(l=>distance(room.center,l.center)<reach+1.5)&&!accessPaths.some(path=>path.slice(1).some((b,i)=>distanceToSegment(room.center,path[i],b)<reach))
  })
  const rails=[-1,1].map(side=>({a:add(stairs.start,stairs.across,side*stairs.width/2),b:add(stairs.end,stairs.across,side*stairs.width/2),kind:'rail' as const}))
  const shell=(ground:boolean)=>[...hostelBoundaryWalls(plan.outer,[{...entrance,width:2.4}]),...courtyards.flatMap(c=>hostelBoundaryWalls(c.ring,ground?[c]:[])),...rails]
  const root={...plan,entrance,stairs,rooms,lifts,corridors,courtyards,badmintonCourt:hostelBadmintonCourt(plan.building)??undefined,courtyardWalkable:true,walls:shell(true)}
  return {...root,floors:Array.from({length:plan.levels},(_,floor)=>({...root,courtyardWalkable:floor===0,walls:shell(floor===0)}))}
}

export function hostelBoundaryWalls(ring:Point[],openings:{point:Point;width:number}[]):InteriorWall[] {
  return ring.slice(1).flatMap((b,i)=>{
    const a=ring[i],length=distance(a,b),along={x:(b.x-a.x)/length,z:(b.z-a.z)/length}
    const gate=openings.find(g=>distanceToSegment(g.point,a,b)<.1)
    if(!gate)return [{a,b,kind:'outer' as const}]
    const t=(gate.point.x-a.x)*along.x+(gate.point.z-a.z)*along.z
    return [{a,b:add(a,along,Math.max(0,t-gate.width/2)),kind:'outer' as const},{a:add(a,along,Math.min(length,t+gate.width/2)),b,kind:'outer' as const}]
  })
}
export function insideHostelLift(p:Point,lift:HostelLift,radius=.42) {
  const dx=p.x-lift.center.x,dz=p.z-lift.center.z
  return Math.abs(dx*lift.along.x+dz*lift.along.z)<lift.width/2+radius&&Math.abs(dx*lift.facing.x+dz*lift.facing.z)<lift.depth/2+radius
}
export function nearestHostelLift(plan:HostelPlan,p:Point) {
  return plan.lifts?.filter(l=>distance(p,l.landing)<=2.2).sort((a,b)=>distance(p,a.landing)-distance(p,b.landing))[0]??null
}
export function hostelLiftArrival(plan:HostelPlan,p:Point,floor:number) {
  if(!Number.isInteger(floor)||floor<0||floor>=plan.levels)return null
  const lift=nearestHostelLift(plan,p)
  return lift?{point:{...lift.landing},floor,lift}:null
}
export function hostelAreaLabel(plan:HostelPlan,p:Point):string|null {
  const courtyard=plan.courtyardWalkable&&plan.courtyards?.find(c=>pointInCampus(p,c.ring))
  if(courtyard)return courtyard.id==='plain'?'Plain courtyard':'Badminton courtyard'
  const lift=nearestHostelLift(plan,p);if(lift)return `Lift ${lift.id}`
  const corridor=plan.corridors?.find(c=>c.points.slice(1).some((b,i)=>distanceToSegment(p,c.points[i],b)<c.width/2))
  return corridor?.name??null
}
export function hostelCourtSurface(plan:HostelPlan,p:Point,floor:number) {
  const base=plan.base+floor*plan.floorHeight+.14
  if(!plan.courtyardWalkable)return base
  const court=plan.badmintonCourt;if(!court)return base
  const dx=p.x-court.center.x,dz=p.z-court.center.z
  return Math.abs(dx*court.across.x+dz*court.across.z)<court.width/2+2&&Math.abs(dx*court.along.x+dz*court.along.z)<court.length/2+2?base+.04:base
}
