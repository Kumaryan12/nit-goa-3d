import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { localToGps } from '../src/lib/geo.ts'
import { createWalkWorld, isWalkable } from '../src/lib/walking.ts'
import { advanceVehicle, canRideAt, findVehicleMount, findVehicleDismount, freshVehicle, VEHICLES } from '../src/lib/vehicles.ts'
import { parseCampusPose } from '../src/lib/campusProtocol.ts'
import { createCampusRoom } from '../server/campusRoom.ts'
import { extractBuildingFootprints } from '../src/lib/buildings.ts'
import { extractCampusRoads } from '../src/lib/roads.ts'
import { createDigitalTwin } from '../src/lib/digitalTwin.ts'
import { savedCampusOverrides } from '../src/data/campusOverrides.ts'
const ring = (a,b,c,d) => [{x:a,z:b},{x:c,z:b},{x:c,z:d},{x:a,z:d},{x:a,z:b}]
const boundary=ring(-100,-100,100,100), flat={size:400,segments:40,heights:new Float32Array(41**2),colors:new Float32Array(41**2*3)}
const roads=[{id:'road',kind:'road',tags:{},width:8,paths:[[{x:0,z:-90},{x:0,z:90}]]}]
const world=createWalkWorld([],boundary,flat)
const pose=(extra={})=>({x:0,y:0,z:0,yaw:0,moving:false,running:false,active:true,visible:true,space:'outdoors',epoch:1,...extra})
const drive=(kind,hz,seconds,throttle=1)=>{const state=freshVehicle();let p={x:0,z:40};for(let i=0;i<hz*seconds;i++)p=advanceVehicle(state,p,kind,throttle,0,false,1/hz,world,roads).point;return {state,p}}

test('vehicles accelerate gently, stay within presence speed limits, and agree across frame rates',()=>{
 for(const kind of ['bicycle','buggy']){
  const slow=drive(kind,30,5),fast=drive(kind,120,5)
  assert.ok(Math.abs(slow.p.z-fast.p.z)<.04)
  assert.equal(slow.state.speed,VEHICLES[kind].speed)
  assert.ok(VEHICLES[kind].speed<(kind==='buggy'?8.1:5.8))
  assert.ok(drive(kind,60,.5).state.speed<1.2)
 }
})
test('braking, reverse, coasting, blur/pause and frame stalls remain controlled',()=>{
 const state=freshVehicle(); state.speed=5.2
 let p={x:0,z:40};for(let i=0;i<60;i++)p=advanceVehicle(state,p,'buggy',0,0,true,1/60,world,roads).point
 assert.equal(state.speed,0);assert.ok(40-p.z<2.4)
 const reverse=drive('buggy',60,2,-1);assert.equal(reverse.state.speed,-1.4);assert.ok(reverse.p.z>40)
 assert.equal(drive('bicycle',60,2,-1).state.speed,0)
 state.speed=5.2;const paused=advanceVehicle(state,p,'buggy',1,1,false,.1,world,roads,false);assert.deepEqual(paused.point,p);assert.equal(state.speed,0)
 const a=freshVehicle(),b=freshVehicle();assert.deepEqual(advanceVehicle(a,p,'buggy',1,0,false,10,world,roads),advanceVehicle(b,p,'buggy',1,0,false,.1,world,roads))
 state.speed=2;for(let i=0;i<60;i++)advanceVehicle(state,p,'buggy',0,0,false,1/60,world,roads);assert.equal(state.speed,0)
})
test('both vehicles mount and travel across open ground without mapped roads',()=>{
 for(const kind of ['bicycle','buggy']){
  const start={x:20,z:40},mount=findVehicleMount(start,0,kind,world,[])
  assert.deepEqual(mount,{point:start,yaw:0});assert.ok(canRideAt(start,Math.PI/2,kind,world,[]))
  const state=freshVehicle();let p=start
  for(let i=0;i<300;i++)p=advanceVehicle(state,p,kind,1,0,false,1/60,world,[]).point
  assert.ok(p.z<30);assert.equal(state.speed,VEHICLES[kind].speed);assert.ok(canRideAt(p,state.yaw,kind,world,[]))
 }
 const state=freshVehicle();state.speed=5.2;let p={x:2,z:0}
 for(let i=0;i<100;i++)p=advanceVehicle(state,p,'buggy',1,1,false,1/60,world,roads).point
 assert.ok(p.x>4,'right input can steer clear of the road');assert.ok(canRideAt(p,state.yaw,'buggy',world,[]));assert.ok(state.speed>0)
})
test('the full vehicle blocks thin walls, tree trunks, streetlights and unsafe turns',()=>{
 const building={id:'wall',outer:ring(-20,-.02,20,.02).map(localToGps),holes:[],height:10}
 for(const blocker of ['wall','tree','lamp']){
  const w=createWalkWorld(blocker==='wall'?[building]:[],boundary,flat,blocker==='tree'?[{x:0,z:0,y:0,scale:1,palm:true}]:[],blocker==='lamp'?[{x:0,z:0,height:6}]:[])
  const state=freshVehicle();state.speed=5.2;let p={x:0,z:3}
  for(let i=0;i<180;i++)p=advanceVehicle(state,p,'buggy',1,0,false,1/60,w,roads).point
  assert.ok(p.z>1.75);assert.ok(canRideAt(p,state.yaw,'buggy',w,roads));assert.equal(state.speed,0)
 }
 assert.equal(canRideAt({x:98.5,z:0},Math.PI/2,'buggy',world,roads),false,'nose cannot rotate outside the campus')
})
test('mounting and dismounting find safe nearby positions without crossing solids',()=>{
 const mount=findVehicleMount({x:4.5,z:0},0,'buggy',world,roads);assert.ok(mount);assert.ok(canRideAt(mount.point,mount.yaw,'buggy',world,roads))
 assert.ok(findVehicleMount({x:20,z:0},0,'buggy',world,roads))
 assert.equal(findVehicleMount({x:105,z:0},0,'buggy',world,[]),null)
 const wall={id:'wall',outer:ring(2,-20,2.1,20).map(localToGps),holes:[],height:10}
 const w=createWalkWorld([wall],boundary,flat)
 const beside=findVehicleMount({x:2.6,z:0},0,'buggy',w,[]);assert.ok(beside);assert.ok(beside.point.x>3,'mount stays on the reachable side of the wall')
 const dismount=findVehicleDismount({x:0,z:0},0,'buggy',w);assert.ok(isWalkable(dismount,w));assert.ok(dismount.x<2)
})
test('shared presence validates vehicle modes, excludes interiors, and keeps speed enforcement',()=>{
 for(const vehicle of ['walk','bicycle','buggy'])assert.equal(parseCampusPose(pose({vehicle})).vehicle,vehicle)
 assert.equal(parseCampusPose(pose({vehicle:'plane'})),null)
 assert.equal(parseCampusPose(pose({vehicle:'buggy',space:'gyan:0'})),null)
 assert.equal(parseCampusPose(pose({vehicle:'bicycle',space:'hostel:1'})),null)
 assert.ok(parseCampusPose(pose()),'older walking clients remain compatible')
 const room=createCampusRoom(boundary);room.add({id:'alice',name:'Alice',role:'member',expiresAt:Date.now()+3600000})
 assert.ok(room.pose('alice',pose({vehicle:'buggy'}),'walk',1000))
 assert.ok(room.pose('alice',pose({vehicle:'buggy',z:-.52}),'walk',1100))
 assert.equal(room.snapshot(1100).people[0].pose.vehicle,'buggy')
 assert.equal(room.pose('alice',pose({vehicle:'buggy',z:-10}),'walk',1200),false)
})
test('full-speed riding shares every step without granting walking or unknown modes the buggy allowance',()=>{
 for(const kind of ['bicycle','buggy']) {
  const room=createCampusRoom(boundary);room.add({id:'driver',name:'Driver',role:'member',expiresAt:Date.now()+60000})
  const state=freshVehicle();let p={x:20,z:40};assert.ok(room.pose('driver',pose({...p,vehicle:kind}),'walk',1000))
  for(let i=0;i<60;i++) {
   p=advanceVehicle(state,p,kind,1,0,false,.1,world,[]).point
   assert.ok(room.pose('driver',pose({...p,vehicle:kind}),'walk',1100+i*100))
  }
  assert.equal(state.speed,VEHICLES[kind].speed)
 }
 for(const [vehicle,space,activity,accepted] of [['buggy','outdoors','walk',true],['walk','outdoors','walk',false],['bicycle','outdoors','walk',false],['plane','outdoors','walk',false],['buggy','gyan:0','walk',false],['buggy','outdoors','football',false]]) {
  const room=createCampusRoom(boundary);room.add({id:'alice',name:'Alice',role:'member',expiresAt:Date.now()+60000});room.pose('alice',pose(),'walk',1000)
  assert.equal(room.pose('alice',pose({vehicle,space,x:3.75}),activity,1500),accepted,vehicle+'/'+space+'/'+activity)
 }
})
test('off-road freedom still blocks the canal, bridge parapets and unsafe grades',()=>{
 const model={...flat,canal:{center:{x:0,z:0},along:{x:1,z:0},across:{x:0,z:1},length:80,width:3,bankWidth:1,depth:1.2,bridge:{width:12,length:7,roadIds:[]}}}
 const w=createWalkWorld([],boundary,model)
 for(const kind of ['bicycle','buggy']) {
  assert.ok(canRideAt({x:0,z:0},0,kind,w,[]),'bridge stays usable')
  assert.equal(canRideAt({x:20,z:0},0,kind,w,[]),false,'water is blocked')
  assert.equal(canRideAt({x:5.8,z:0},0,kind,w,[]),false,'parapet is blocked')
  const steep={...flat,heights:Float32Array.from(flat.heights,(_,i)=>Math.floor(i/41)*20)}
  const state=freshVehicle();state.speed=2;const start={x:20,z:40}
  assert.ok(advanceVehicle(state,start,kind,1,0,false,.1,createWalkWorld([],boundary,steep),[]).blocked)
 }
})
test('real campus has legal bicycle and buggy routes and safe movement',()=>{
 const elements=JSON.parse(readFileSync(new URL('./fixtures/nit-goa-campus.json',import.meta.url))).elements
 const ways=JSON.parse(readFileSync(new URL('./fixtures/nit-goa-roads.json',import.meta.url))).elements
 const gpsBoundary=ways.find(e=>e.id===1259742369).geometry
 const map={buildings:extractBuildingFootprints(elements),boundary:gpsBoundary}
 const roadData={roads:extractCampusRoads(ways,gpsBoundary),boundary:gpsBoundary}
 const twin=createDigitalTwin(map,roadData,true,savedCampusOverrides), w=createWalkWorld(twin.buildings,twin.boundary,twin.terrain,twin.trees,twin.lamps)
 const candidates=twin.roads.flatMap(r=>r.paths.flatMap(p=>p.slice(1).map((b,i)=>({point:{x:(p[i].x+b.x)/2,z:(p[i].z+b.z)/2},yaw:Math.atan2(p[i].x-b.x,p[i].z-b.z)}))))
 for(const kind of ['bicycle','buggy']){
  const start=candidates.find(p=>canRideAt(p.point,p.yaw,kind,w,twin.roads));assert.ok(start,kind+' has a valid campus road')
  const state=freshVehicle(start.yaw);let p=start.point
  for(let i=0;i<60;i++)p=advanceVehicle(state,p,kind,1,0,false,1/60,w,twin.roads).point
  assert.ok(canRideAt(p,state.yaw,kind,w,twin.roads))
 }
})
