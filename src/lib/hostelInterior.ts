import { gpsToLocal } from './geo.ts'
import type { LocalCoordinate as Point } from './geo.ts'
import { pointInCampus } from './roads.ts'
import { distanceToSegment } from './terrain.ts'
import type { BuildingFootprint, RoadFootprint } from '../types/osm.ts'
import { boysHostelDetails } from '../data/buildingDetails.ts'

export interface InteriorWall { a: Point; b: Point; kind: 'outer' | 'room' | 'rail' }
export interface DemoRoom { id: string; center: Point; along: Point; inward: Point; width: number; depth: number; door: Point; bed: Point; desk: Point }
export interface HostelPlan {
  kind?: 'classroom'; floors?: HostelPlan[]; readingRoom?: DemoRoom; locationId?: string; name?: string;
  buildingId: string; building: BuildingFootprint; outer: Point[]; holes: Point[][]; walls: InteriorWall[]; rooms: DemoRoom[];
  entrance: { point: Point; inside: Point; outside: Point; inward: Point; along: Point };
  stairs: { start: Point; end: Point; along: Point; across: Point; length: number; width: number; hole: Point[] };
  base: number; floorHeight: number; levels: number;
}
export interface InteriorPose { buildingId: string; floor: number }
export interface StairJourney { lowFloor: number; up: boolean; progress: number }
export type HostelAction = 'enter-hostel' | 'enter-gyan' | 'exit-hostel' | 'find-stairs' | 'find-reading-room' | 'stairs-up' | 'stairs-down'
const add = (p: Point, v: Point, distance: number): Point => ({ x: p.x + v.x * distance, z: p.z + v.z * distance })
const dot = (a: Point, b: Point) => a.x * b.x + a.z * b.z
export const pointDistance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.z - b.z)
const ringDistance = (point: Point, ring: Point[]) => ring.reduce((distance, a, i) => Math.min(distance, distanceToSegment(point, a, ring[(i + 1) % ring.length])), Infinity)
export function insideHostelFootprint(point: Point, outer: Point[], holes: Point[][], clearance = 0): boolean {
  return pointInCampus(point, outer) && !holes.some(hole => pointInCampus(point, hole)) && ringDistance(point, outer) >= clearance && holes.every(hole => ringDistance(point, hole) >= clearance)
}
function rectangle(center: Point, along: Point, inward: Point, halfWidth: number, halfDepth: number): Point[] {
  return [[-1,-1],[1,-1],[1,1],[-1,1]].map(([u,v]) => add(add(center, along, u * halfWidth), inward, v * halfDepth))
}
// Check a dense rectangle grid, not just corners: an OSM courtyard or notch can
// cross its center while all four corners remain inside the outside polygon.
function fits(center: Point, along: Point, across: Point, halfLength: number, halfWidth: number, outer: Point[], holes: Point[][]): boolean {
  const rows = Math.ceil(halfLength * 2 / 0.5), columns = Math.ceil(halfWidth * 2 / 0.5)
  for (let i = 0; i <= rows; i++) for (let j = 0; j <= columns; j++) {
    if (!insideHostelFootprint(add(add(center, along, -halfLength + i / rows * halfLength * 2), across, -halfWidth + j / columns * halfWidth * 2), outer, holes, 0.12)) return false
  }
  return true
}
function coordinatesInRoom(point: Point, room: DemoRoom): Point {
  const delta = { x: point.x - room.center.x, z: point.z - room.center.z }
  return { x: dot(delta, room.along), z: dot(delta, room.inward) }
}
export function roomAtPoint(plan: HostelPlan, point: Point): DemoRoom | null {
  return [...plan.rooms,...(plan.readingRoom?[plan.readingRoom]:[])].find(room => { const local = coordinatesInRoom(point, room); return Math.abs(local.x) < room.width / 2 && Math.abs(local.z) < room.depth / 2 }) ?? null
}
export const demoRoomNumber = (floor: number, roomId: string) => `DEMO ${floor === 0 ? 'G' : floor}-${roomId.padStart(2, '0')}`

// Exterior shape comes from OSM. Everything inside, including this entrance,
// room arrangement and staircase, is a deterministic editable approximation.
export function createHostelPlan(building: BuildingFootprint, roads: RoadFootprint[], isOutdoorSafe: (point: Point) => boolean, options?: { kind: 'classroom'; locationId: string; name: string; levels: number; floorHeight: number; entryHint?: Point }): HostelPlan | null {
  const outer = building.outer.map(gpsToLocal), holes = building.holes.map(ring => ring.map(gpsToLocal))
  const edges = outer.slice(1).map((b,i) => {
    const a = outer[i], length = pointDistance(a,b), along = { x: (b.x-a.x)/length, z: (b.z-a.z)/length }, mid = add(a,along,length/2)
    let inward = { x: -along.z, z: along.x }
    if (!insideHostelFootprint(add(mid,inward,0.3),outer,holes)) inward = {x:-inward.x,z:-inward.z}
    return { a,b,length,along,inward,mid }
  }).filter(edge => Number.isFinite(edge.length) && edge.length > 0.1)
  const roadLines = roads.flatMap(road => road.paths.flatMap(path => path.slice(1).map((b,i) => [path[i],b])))
  const entrances = edges.filter(edge => edge.length >= 8).flatMap(edge => [0.25,0.5,0.75].map(t => {
    const point=add(edge.a,edge.along,edge.length*t), inside=add(point,edge.inward,2.4), outside=add(point,edge.inward,-2.4)
    const score=options?.entryHint ? pointDistance(outside,options.entryHint) : roadLines.reduce((distance,[a,b])=>Math.min(distance,distanceToSegment(outside,a,b)),Infinity)
    return { point,inside,outside,inward:edge.inward,along:edge.along,score,edge }
  })).filter(entry => insideHostelFootprint(entry.inside,outer,holes,0.6) && isOutdoorSafe(entry.outside))
  entrances.sort((a,b)=>(a.score-b.score)||a.point.x-b.point.x||a.point.z-b.point.z)
  const entry=entrances[0]; if (!entry) return null
  const mainEdge=[...edges].sort((a,b)=>b.length-a.length)[0], axis=mainEdge.along, across={x:-axis.z,z:axis.x}
  const minX=Math.min(...outer.map(p=>p.x)),maxX=Math.max(...outer.map(p=>p.x)),minZ=Math.min(...outer.map(p=>p.z)),maxZ=Math.max(...outer.map(p=>p.z))
  const candidates: {center:Point; along:Point; across:Point; score:number}[]=[]
  for(let x=minX+2;x<maxX-2;x+=2) for(let z=minZ+2;z<maxZ-2;z+=2) for(const along of [axis,across]) {
    const sideways={x:-along.z,z:along.x}, center={x,z}
    if(pointDistance(center,entry.inside)<7 || !fits(center,along,sideways,5,1.7,outer,holes)) continue
    candidates.push({center,along,across:sideways,score:pointDistance(center,entry.inside)})
  }
  candidates.sort((a,b)=>a.score-b.score); const candidate=candidates[0]; if (!candidate) return null
  const stairs={ start:add(candidate.center,candidate.along,-3.2), end:add(candidate.center,candidate.along,3.2), along:candidate.along, across:candidate.across, length:6.4,width:2.6,hole:rectangle(candidate.center,candidate.along,candidate.across,3.2,1.3) }
  const walls:InteriorWall[]=edges.flatMap(edge => {
    if(edge!==entry.edge) return [{a:edge.a,b:edge.b,kind:'outer' as const}]
    return [{a:edge.a,b:add(entry.point,edge.along,-1.1),kind:'outer' as const},{a:add(entry.point,edge.along,1.1),b:edge.b,kind:'outer' as const}]
  })
  holes.forEach(ring=>ring.slice(1).forEach((b,i)=>walls.push({a:ring[i],b,kind:'outer'})))
  const rooms:DemoRoom[]=[]
  const width=options ? 4.8 : 4, depth=4.2
  const roomEdges=options?[...edges,...holes.flatMap(ring=>ring.slice(1).map((b,i)=>{const a=ring[i],length=pointDistance(a,b),along={x:(b.x-a.x)/length,z:(b.z-a.z)/length},mid=add(a,along,length/2);let inward={x:-along.z,z:along.x};if(!insideHostelFootprint(add(mid,inward,.3),outer,holes))inward={x:-inward.x,z:-inward.z};return {a,b,length,along,inward,mid}}))]:edges
  for(const edge of roomEdges.filter(edge=>edge.length>=width+6)) for(let d=options ? width/2+1 : 3;d<edge.length-width/2;d+=width+.6) {
    const center=add(add(edge.a,edge.along,d),edge.inward,depth/2+.5)
    if(!fits(center,edge.along,edge.inward,width/2,depth/2,outer,holes)) continue
    if(pointDistance(center,entry.inside)<7 || distanceToSegment(center,stairs.start,stairs.end)<5.5 || rooms.some(room=>pointDistance(center,room.center)<(options ? width+.4 : 5.3))) continue
    const door=add(center,edge.inward,depth/2), back=add(center,edge.inward,-depth/2)
    if(!insideHostelFootprint(add(door,edge.inward,1.2),outer,holes,0.55)) continue
    const room:DemoRoom={id:String(rooms.length+1),center,along:edge.along,inward:edge.inward,width,depth,door,bed:add(add(center,edge.along,-1.1),edge.inward,-0.4),desk:add(add(center,edge.along,1.3),edge.inward,-1)}
    rooms.push(room)
    walls.push({a:add(back,edge.along,-width/2),b:add(door,edge.along,-width/2),kind:'room'},{a:add(back,edge.along,width/2),b:add(door,edge.along,width/2),kind:'room'},
      {a:add(back,edge.along,-width/2),b:add(back,edge.along,width/2),kind:'room'},
      {a:add(door,edge.along,-width/2),b:add(door,edge.along,-0.72),kind:'room'},{a:add(door,edge.along,0.72),b:add(door,edge.along,width/2),kind:'room'})
  }
  for(const side of [-1,1]) walls.push({a:add(stairs.start,stairs.across,side*stairs.width/2),b:add(stairs.end,stairs.across,side*stairs.width/2),kind:'rail'})
  return {...options,buildingId:building.id,building,outer,holes,walls,rooms,entrance:{point:entry.point,inside:entry.inside,outside:entry.outside,inward:entry.inward,along:entry.along},stairs,base:building.baseElevation??0,floorHeight:options?.floorHeight ?? boysHostelDetails.floorHeightMeters,levels:options?.levels ?? boysHostelDetails.floors.length}
}
export function isInteriorWalkable(point: Point, plan: HostelPlan, radius=0.42): boolean {
  if(!Number.isFinite(point.x)||!Number.isFinite(point.z)||!insideHostelFootprint(point,plan.outer,plan.holes,radius)) return false
  if(plan.walls.some(wall=>distanceToSegment(point,wall.a,wall.b)<radius+0.09)) return false
  // Furniture is tangible; leave the 1.44 m door openings unobstructed.
  return ![...plan.rooms,...(plan.readingRoom?[plan.readingRoom]:[])].some(room=> {
    if(plan.kind==='classroom') {
      const local=coordinatesInRoom(point,room)
      if(Math.abs(local.x)>room.width/2+radius||Math.abs(local.z)>room.depth/2+radius)return false
      return (room.id==='reading'?readingFurniture(room):classroomFurniture(room)).some(item=>{const p=coordinatesInRoom(point,{...room,center:item.point});return Math.abs(p.x)<item.width/2+radius&&Math.abs(p.z)<item.depth/2+radius})
    }
    const bed=coordinatesInRoom(point,{...room,center:room.bed}), desk=coordinatesInRoom(point,{...room,center:room.desk}), local=coordinatesInRoom(point,room)
    return (Math.abs(bed.x)<0.5+radius&&Math.abs(bed.z)<1+radius)||(Math.abs(desk.x)<0.4+radius&&Math.abs(desk.z)<0.55+radius)||(Math.abs(local.x-1.35)<.325+radius&&Math.abs(local.z-1.1)<.375+radius)
  })
}
export function stepInterior(point: Point,direction:Point,speed:number,delta:number,plan:HostelPlan):Point {
  const length=Math.hypot(direction.x,direction.z)
  if(!length||!Number.isFinite(length)||!Number.isFinite(speed)||!Number.isFinite(delta))return point
  const distance=Math.max(0,Math.min(5.5,speed))*Math.max(0,Math.min(.1,delta)),steps=Math.max(1,Math.ceil(distance/.12)),dx=direction.x/length*distance/steps,dz=direction.z/length*distance/steps
  let p={...point}
  for(let i=0;i<steps;i++) {
    const next={x:p.x+dx,z:p.z+dz}
    if(isInteriorWalkable(next,plan))p=next
    else {const a={x:p.x+dx,z:p.z};if(isInteriorWalkable(a,plan))p=a;const b={x:p.x,z:p.z+dz};if(isInteriorWalkable(b,plan))p=b}
  }
  // Stair flights are traversed with E / the stair buttons so a floor cannot
  // change accidentally while strafing past a landing.
  if(distanceToSegment(p,plan.stairs.start,plan.stairs.end)<plan.stairs.width/2+.42) {
    const relative={x:p.x-plan.stairs.start.x,z:p.z-plan.stairs.start.z}, t=dot(relative,plan.stairs.along)
    if(t>0.15&&t<plan.stairs.length-.15)return point
  }
  return p
}
export function stairLanding(plan:HostelPlan,up:boolean):Point {return add(up?plan.stairs.start:plan.stairs.end,plan.stairs.along,up?-1.2:1.2)}
// Turn toward an open corridor on arrival rather than facing a nearby wall.
export function landingLookDirection(plan:HostelPlan,point:Point):Point {
  let best={x:plan.stairs.across.x,z:plan.stairs.across.z}, bestDistance=-1
  for(let i=0;i<8;i++) {
    const angle=i*Math.PI/4, direction={x:Math.sin(angle),z:Math.cos(angle)}
    let p=point, distance=0
    for(let j=0;j<15;j++) {const next=stepInterior(p,direction,4,.1,plan);if(pointDistance(next,add(p,direction,.4))>.01)break;p=next;distance+=.4}
    if(distance>bestDistance){bestDistance=distance;best=direction}
  }
  return best
}
export function canUseStairs(plan:HostelPlan,point:Point,floor:number,up:boolean):boolean {
  return Number.isInteger(floor)&&floor>=0&&floor<plan.levels&&(up?floor<plan.levels-1:floor>0)&&pointDistance(point,stairLanding(plan,up))<=3
}
export function stairSample(plan:HostelPlan,journey:StairJourney):{point:Point;y:number;floor:number;complete:boolean} {
  const progress=Math.max(0,Math.min(1,journey.progress)),t=journey.up?progress:1-progress
  const start=stairLanding(plan,true),end=stairLanding(plan,false),point={x:start.x+(end.x-start.x)*t,z:start.z+(end.z-start.z)*t}
  const run=Math.max(0,Math.min(1,(t*(plan.stairs.length+2.4)-1.2)/plan.stairs.length))
  // Feet match rendered step tops; the first/last landing remains level.
  const height=Math.min(plan.floorHeight,Math.ceil(run*20)*plan.floorHeight/20)
  return {point,y:plan.base+.14+journey.lowFloor*plan.floorHeight+height,floor:progress>=1?(journey.up?journey.lowFloor+1:journey.lowFloor):(journey.up?journey.lowFloor:journey.lowFloor+1),complete:progress>=1}
}
export function interiorCameraFraction(origin:{x:number;y:number;z:number},end:{x:number;y:number;z:number},plan:HostelPlan,floor=0,stairLowFloor:number|null=null):number {
  const steps=Math.max(1,Math.ceil(Math.hypot(end.x-origin.x,end.y-origin.y,end.z-origin.z)/.15))
  const levels=stairLowFloor===null?[floor]:[stairLowFloor,stairLowFloor+1]
  const flights=[...new Set(levels.flatMap(level=>[level-1,level]))].filter(level=>level>=0&&level<plan.levels-1)
  for(let i=1;i<=steps;i++) {const t=i/steps,p={x:origin.x+(end.x-origin.x)*t,z:origin.z+(end.z-origin.z)*t}, y=origin.y+(end.y-origin.y)*t
    const relative={x:p.x-plan.stairs.start.x,z:p.z-plan.stairs.start.z}, run=dot(relative,plan.stairs.along), side=Math.abs(dot(relative,plan.stairs.across))
    const stepHeight=Math.ceil(Math.max(0,Math.min(1,run/plan.stairs.length))*20)*plan.floorHeight/20
    const inSteps=run>=0&&run<=plan.stairs.length&&side<=plan.stairs.width/2+.15&&flights.some(level=>{const top=plan.base+.14+level*plan.floorHeight+stepHeight;return y>=top-plan.floorHeight/20-.15&&y<=top+.15})
    const atHeaderHeight=levels.some(level=>{const height=y-plan.base-.14-level*plan.floorHeight;return height>=1.95&&height<=2.85})
    const inHeader=atHeaderHeight&&[...plan.rooms,...(plan.readingRoom?[plan.readingRoom]:[])].some(room=>{const offset={x:p.x-room.door.x,z:p.z-room.door.z};return Math.abs(dot(offset,room.along))<.87&&Math.abs(dot(offset,room.inward))<.25})
    if(inSteps||inHeader||!insideHostelFootprint(p,plan.outer,plan.holes,.2)||plan.walls.some(wall=>distanceToSegment(p,wall.a,wall.b)<.25))return Math.max(.04,(i-1)/steps)
  }
  return 1
}

export const GYAN_MANDIR_ID = 'relation/19505813/0'
export function createGyanMandirPlan(building: BuildingFootprint, roads: RoadFootprint[], isOutdoorSafe: (point: Point) => boolean, seminarSide?:Point): HostelPlan | null {
  const plan=createHostelPlan(building,roads,isOutdoorSafe,{kind:'classroom',locationId:GYAN_MANDIR_ID,name:'Gyan Mandir',levels:3,floorHeight:building.height/3,entryHint:seminarSide})
  if(!plan)return null
  const outerWalls=plan.walls.filter(w=>w.kind!=='room')
  const minX=Math.min(...plan.outer.map(p=>p.x)),maxX=Math.max(...plan.outer.map(p=>p.x)),minZ=Math.min(...plan.outer.map(p=>p.z))
  // Reserve a large first-floor reading room at the true north end (-Z).
  const along={x:1,z:0},inward={x:0,z:1},width=18,depth=8
  let readingRoom:DemoRoom|null=null
  for(let z=minZ+depth/2+1;z<minZ+18&&!readingRoom;z+=.5)for(let x=minX+width/2+1;x<maxX-width/2-1;x+=.5) {
    const center={x,z},door=add(center,inward,depth/2)
    if(!fits(center,along,inward,width/2,depth/2,plan.outer,plan.holes)||!insideHostelFootprint(add(door,inward,1.2),plan.outer,plan.holes,.55))continue
    readingRoom={id:'reading',center,along,inward,width,depth,door,bed:center,desk:center};break
  }
  if(!readingRoom)return null
  const center={x:(minX+maxX)/2,z:(minZ+Math.max(...plan.outer.map(p=>p.z)))/2}
  const start=Math.atan2(plan.entrance.inside.z-center.z,plan.entrance.inside.x-center.x)
  const order=(r:DemoRoom)=>(Math.atan2(r.center.z-center.z,r.center.x-center.x)-start+Math.PI*2)%(Math.PI*2)
  const candidates=[...plan.rooms].sort((a,b)=>order(a)-order(b)||pointDistance(a.center,center)-pointDistance(b.center,center))
  const excludesReading=(r:DemoRoom)=>!rectanglesOverlap(r,readingRoom!,1.1)
  const floorCounts=[15,30,30],offsets=[0,15,45]
  const floors=floorCounts.map((count,floor)=> {
    const rooms=(floor===1?candidates.filter(excludesReading):candidates).slice(0,count).map((r,i)=>({...r,id:String(offsets[floor]+i+1)}))
    const reading=floor===1?readingRoom!:undefined
    return {...plan,rooms,readingRoom:reading,walls:[...outerWalls,...rooms.flatMap(roomWalls),...(reading?roomWalls(reading):[])]}
  })
  if(floors.some((p,i)=>p.rooms.length!==floorCounts[i]))return null
  return {...floors[0],floors}
}
function rectanglesOverlap(a:DemoRoom,b:DemoRoom,clearance=0) {
  // SAT with both rectangles' local axes keeps doors/corridors clear.
  const delta={x:b.center.x-a.center.x,z:b.center.z-a.center.z}
  return [a.along,a.inward,b.along,b.inward].every(axis=> {
    const radius=(r:DemoRoom)=>Math.abs(dot(r.along,axis))*r.width/2+Math.abs(dot(r.inward,axis))*r.depth/2
    return Math.abs(dot(delta,axis))<radius(a)+radius(b)+clearance
  })
}
function roomWalls(room:DemoRoom):InteriorWall[] {
  const back=add(room.center,room.inward,-room.depth/2),door=room.door,w=room.width/2
  return [
    {a:add(back,room.along,-w),b:add(door,room.along,-w),kind:'room'},
    {a:add(back,room.along,w),b:add(door,room.along,w),kind:'room'},
    {a:add(back,room.along,-w),b:add(back,room.along,w),kind:'room'},
    {a:add(door,room.along,-w),b:add(door,room.along,-.72),kind:'room'},
    {a:add(door,room.along,.72),b:add(door,room.along,w),kind:'room'},
  ]
}
export const interiorFloorPlan=(plan:HostelPlan,floor:number)=>plan.floors?.[floor]??plan
export function readingFurniture(room:DemoRoom) {
  const pieces:{kind:'desk'|'chair'|'shelf';point:Point;width:number;depth:number}[]=[]
  for(const x of [-5,0,5])for(const z of [-1.8,.8]) {
    pieces.push({kind:'desk',point:add(add(room.center,room.along,x),room.inward,z),width:2.6,depth:.9})
    for(const u of [-.8,.8])pieces.push({kind:'chair',point:add(add(room.center,room.along,x+u),room.inward,z+.85),width:.5,depth:.5})
  }
  for(const x of [-8.1,8.1])pieces.push({kind:'shelf',point:add(room.center,room.along,x),width:.55,depth:5.5})
  return pieces
}
export function classroomFurniture(room: DemoRoom) {
  const pieces: {kind:'desk'|'chair'|'lectern';point:Point;width:number;depth:number}[]=[]
  for(const x of [-1.45,1.45])for(const z of [-.4,.8]) {
    pieces.push({kind:'desk',point:add(add(room.center,room.along,x),room.inward,z),width:.9,depth:.5})
    pieces.push({kind:'chair',point:add(add(room.center,room.along,x),room.inward,z+.5),width:.48,depth:.48})
  }
  pieces.push({kind:'lectern',point:add(add(room.center,room.along,1.45),room.inward,-1.55),width:.9,depth:.5})
  return pieces
}
export const interiorLocationId=(plan:HostelPlan)=>plan.locationId??'boys-hostel'
export const interiorSpace=(plan:HostelPlan,floor:number)=>`${plan.kind==='classroom'?'gyan':'hostel'}:${floor}`
export const interiorRoomLabel=(plan:HostelPlan,floor:number,id:string)=>plan.kind==='classroom'?id==='reading'?'Reading room':`Classroom ${id.padStart(2,'0')}`:demoRoomNumber(floor,id)
