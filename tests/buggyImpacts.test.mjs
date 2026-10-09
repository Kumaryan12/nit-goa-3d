import test from 'node:test'
import assert from 'node:assert/strict'
import { BUGGY_BODY, BUGGY_IMPACT_MS, BuggyImpactInbox, buggyContact, sweptBuggyContact, solveBuggyImpact, parseBuggyImpact, buggySuspension } from '../src/lib/buggyImpacts.ts'
import { advanceVehicle, applyBuggyImpact, canReconcileBuggy, canRideAt, freshVehicle } from '../src/lib/vehicles.ts'
import { createWalkWorld } from '../src/lib/walking.ts'
import { localToGps } from '../src/lib/geo.ts'
import { createCampusRoom } from '../server/campusRoom.ts'
import { MOVEMENT_SPEEDS, PRESENCE_SPEED_LIMITS } from '../src/lib/movementLimits.ts'
import { parseCampusPose, parseCampusSnapshot } from '../src/lib/campusProtocol.ts'

const ring=(a,b,c,d)=>[{x:a,z:b},{x:c,z:b},{x:c,z:d},{x:a,z:d},{x:a,z:b}]
const boundary=ring(-100,-100,100,100),flat={size:400,segments:40,heights:new Float32Array(41**2),colors:new Float32Array(41**2*3)}
const world=createWalkWorld([],boundary,flat)
const pose=(extra={})=>({x:0,y:0,z:0,yaw:0,vehicle:'buggy',moving:false,running:false,active:true,visible:true,space:'outdoors',epoch:1,...extra})
const impact=(extra={})=>({sequence:1,startedAt:1000,until:1000+BUGGY_IMPACT_MS,strength:.8,velocity:{x:3,z:2},yawKick:.25,anchor:{x:0,y:0,z:0,yaw:0,epoch:1},...extra})
const magnitude=v=>Math.hypot(v.x,v.z)
function collisionRoom(target={}) {
 const room=createCampusRoom(boundary)
 for(const id of ['a','b'])room.add({id,name:id,role:'member',expiresAt:Date.now()+60000})
 room.pose('a',pose({z:5}),'walk',1000)
 room.pose('b',pose(target),'walk',1000)
 room.pose('a',pose({z:4.1}),'walk',1100)
 room.pose('b',pose(target),'walk',1100)
 assert.ok(room.pose('a',pose({z:3.2}),'walk',1200))
 return room
}

test('head-on and rear impacts transfer momentum without adding energy; faster hits push harder',()=>{
 const a={x:0,z:3.6,yaw:0},b={x:0,z:0,yaw:Math.PI}
 const speed=MOVEMENT_SPEEDS.buggy
 const head=solveBuggyImpact(a,b,{x:0,z:-speed},{x:0,z:speed})
 assert.ok(head.a.velocity.z>0&&head.b.velocity.z<0,'both rebound')
 assert.ok(Math.abs(head.a.velocity.z+head.b.velocity.z)<1e-8)
 assert.ok(magnitude(head.a.velocity)**2+magnitude(head.b.velocity)**2<2*speed**2)
 const slow=solveBuggyImpact(a,b,{x:0,z:-3},{x:0,z:0}),fast=solveBuggyImpact(a,b,{x:0,z:-speed},{x:0,z:0})
 assert.ok(magnitude(fast.b.velocity)>magnitude(slow.b.velocity)*2.9)
 assert.ok(fast.strength>slow.strength)
 assert.equal(solveBuggyImpact(a,b,{x:0,z:0},{x:0,z:0}),null)
 assert.equal(solveBuggyImpact(a,b,{x:0,z:2},{x:0,z:-2}),null,'separating bodies do not bounce again')
})
test('glancing hits preserve tangential travel and clamp linear and angular impulses',()=>{
 const a={x:0,z:0,yaw:0},b={x:1.8,z:0,yaw:0}
 const hit=solveBuggyImpact(a,b,{x:4,z:-8},{x:0,z:0},{x:1,z:0})
 assert.ok(Math.abs(hit.a.velocity.z+8)<1e-8)
 assert.ok(hit.b.velocity.x>0&&hit.a.velocity.x<4)
 for(const yaw of [0,.3,Math.PI/2,Math.PI])for(const velocity of [{x:100,z:100},{x:0,z:-9},{x:9,z:0}]) {
  const result=solveBuggyImpact({...a,yaw},b,velocity,{x:-9,z:0},{x:1,z:0})
  if(result)for(const body of [result.a,result.b]) {assert.ok(magnitude(body.velocity)<=PRESENCE_SPEED_LIMITS.buggy+1e-8);assert.ok(Math.abs(body.yawKick)<=.55)}
 }
})
test('capsule contacts use the full body and swept samples catch a delayed crossing',()=>{
 const other={x:0,z:0,yaw:0}
 assert.ok(buggyContact({x:1.7,z:1,yaw:Math.PI/2},other).distance<BUGGY_BODY.radius*2)
 assert.ok(buggyContact({x:10,z:0,yaw:0},other).distance>BUGGY_BODY.radius*2)
 const swept=sweptBuggyContact({x:0,z:10,yaw:0},{x:0,z:-10,yaw:0},other)
 assert.ok(swept&&swept.body.z>3.6&&swept.normal.z<0,'first contact before tunnelling through')
 assert.equal(sweptBuggyContact({x:10,z:10,yaw:0},{x:10,z:-10,yaw:0},other),null)
})
test('recoil agrees at 30/60/144 fps, respects the speed cap, and braking/pause remain effective',()=>{
 const simulate=(hz,brake=false)=>{
  const state=freshVehicle();applyBuggyImpact(state,impact());let p={x:0,z:20}
  for(let i=0;i<hz;i++){const before=p;p=advanceVehicle(state,p,'buggy',0,0,brake,1/hz,world,[]).point;assert.ok(Math.hypot(p.x-before.x,p.z-before.z)*hz<=PRESENCE_SPEED_LIMITS.buggy+.001)}
  return {p,state}
 }
 const a=simulate(30),b=simulate(60),c=simulate(144)
 assert.ok(Math.hypot(a.p.x-c.p.x,a.p.z-c.p.z)<.04)
 assert.ok(Math.hypot(b.p.x-c.p.x,b.p.z-c.p.z)<.04)
 assert.ok(Math.hypot(simulate(60,true).p.x,simulate(60,true).p.z-20)<Math.hypot(b.p.x,b.p.z-20))
 const stopped=freshVehicle();applyBuggyImpact(stopped,impact());advanceVehicle(stopped,{x:0,z:20},'buggy',1,0,false,.1,world,[],false)
 assert.equal(stopped.speed,0);assert.equal(stopped.drift,undefined)
})
test('sideways recoil and reconciliation cannot cross walls, trunks, or the boundary',()=>{
 const wall={id:'wall',outer:ring(2,-40,2.1,40).map(localToGps),holes:[],height:10}
 for(const w of [createWalkWorld([wall],boundary,flat),createWalkWorld([],boundary,flat,[{x:2.5,z:0,y:0,scale:1,palm:true}])]) {
  const state=freshVehicle();applyBuggyImpact(state,impact({velocity:{x:9,z:0},yawKick:0}));let p={x:0,z:0}
  for(let i=0;i<120;i++){p=advanceVehicle(state,p,'buggy',0,0,false,1/60,w,[]).point;assert.ok(canRideAt(p,state.yaw,'buggy',w,[]))}
  assert.ok(p.x<1.6)
 }
 assert.equal(canReconcileBuggy({x:0,z:0},{x:5,z:0,yaw:0},createWalkWorld([wall],boundary,flat),[]),false)
 assert.equal(canReconcileBuggy({x:0,z:0},{x:120,z:0,yaw:0},world,[]),false)
 assert.equal(canReconcileBuggy({x:0,z:0},{x:.5,z:.5,yaw:0},world,[]),true)
})
test('room issues one shared collision, restores first contact, and ignores pre-impact packets until acknowledgement',()=>{
 const room=collisionRoom(),events=room.takeImpacts()
 assert.equal(events.length,2);assert.equal(events[0].impact.sequence,events[1].impact.sequence)
 assert.ok(events[0].impact.anchor.z>3.6)
 assert.ok(events[1].impact.velocity.z<0,'parked buggy receives momentum')
 assert.ok(parseCampusSnapshot(room.snapshot(1200)))
 assert.equal(room.updatePose('a',pose({z:2.3}),'walk',1300),'throttled')
 assert.equal(room.poseFor('a').z,events[0].impact.anchor.z,'old packets cannot undo contact')
 const sequence=events[0].impact.sequence
 assert.ok(room.pose('a',pose({z:3.8,impactAck:sequence}),'walk',1300))
 assert.ok(room.pose('b',pose({z:-.3,impactAck:sequence}),'walk',1300))
 assert.equal(room.takeImpacts().length,0,'contact stays latched until bodies separate')
 assert.equal(room.pose('a',pose({x:100,z:3.8,impactAck:sequence}),'walk',1400),false,'acknowledgement grants no speed exemption')
})
test('walkers, bicycles, inactive/hidden visitors, different heights and fresh spawns do not trigger buggy impacts',()=>{
 for(const target of [{vehicle:'walk'},{vehicle:'bicycle'},{active:false},{visible:false},{y:5}])assert.equal(collisionRoom(target).takeImpacts().length,0)
 const room=collisionRoom({vehicle:'walk'})
 assert.ok(room.pose('b',pose(),'walk',2100));assert.equal(room.takeImpacts().length,0,'mounting on top of another vehicle does not ram it')
})
test('sustained contact does not kick again after five seconds; separation rearms the pair',()=>{
 const room=collisionRoom(),sequence=room.takeImpacts()[0].impact.sequence
 for(let now=1300;now<=7000;now+=100){
  assert.ok(room.pose('b',pose({impactAck:sequence}),'walk',now))
  assert.ok(room.pose('a',pose({z:3.3+(now%200?0:.05),impactAck:sequence}),'walk',now))
  assert.equal(room.takeImpacts().length,0)
 }
 for(const [now,z] of [[7100,4.1],[7200,5],[7300,4.1],[7400,3.2]]) {
  assert.ok(room.pose('b',pose({impactAck:sequence}),'walk',now))
  assert.ok(room.pose('a',pose({z,impactAck:sequence}),'walk',now))
 }
 assert.equal(room.takeImpacts().length,2)
})
test('32 moving buggies resolve 16 simultaneous pairs without duplicate impulses',t=>{
 const room=createCampusRoom(boundary),positions=[]
 for(let i=0;i<16;i++){
  const x=(i%8-3.5)*20,z=i<8?-25:25
  positions.push({id:`a${i}`,x,z:z+5},{id:`b${i}`,x,z})
 }
 for(const p of positions){room.add({id:p.id,name:p.id,role:'member',expiresAt:Date.now()+60000});assert.ok(room.pose(p.id,pose(p),'walk',1000))}
 const start=performance.now()
 for(const now of [1100,1200])for(const p of positions){const result=room.updatePose(p.id,pose({...p,z:p.z-(p.id.startsWith('a')?(now-1000)/100*.9:0)}),'walk',now);assert.ok(result==='accepted'||result==='throttled',`${p.id}: ${result}`)}
 const events=room.takeImpacts(),counts=new Map()
 assert.equal(events.length,32)
 for(const {impact} of events){counts.set(impact.sequence,(counts.get(impact.sequence)??0)+1);assert.ok(parseBuggyImpact(impact))}
 assert.equal(counts.size,16);assert.ok([...counts.values()].every(n=>n===2))
 assert.ok(parseCampusSnapshot(room.snapshot(1200)))
 t.diagnostic(`32 buggies, 16 impacts, 64 submitted updates in ${(performance.now()-start).toFixed(1)} ms`)
})
test('duplicate/out-of-order delivery and late snapshots apply each impulse only once without depending on the client wall clock',()=>{
 const inbox=new BuggyImpactInbox(),first=impact()
 assert.equal(inbox.accept(first,1200,5).age,.2)
 assert.equal(inbox.accept(first,1250,50),null)
 assert.ok(inbox.accept(impact({sequence:2,startedAt:1300,until:1300+BUGGY_IMPACT_MS}),1400,100))
 assert.equal(inbox.accept(first,1450,150),null)
 assert.equal(inbox.accept(impact({sequence:3}),3000,150),null,'expired impacts never replay')
 for(const value of [impact({sequence:-1}),impact({velocity:{x:100,z:0}}),impact({strength:2}),impact({yawKick:5}),impact({anchor:{x:0,y:0,z:0,yaw:0,epoch:NaN}})])assert.equal(parseBuggyImpact(value),null)
 assert.equal(parseCampusPose(pose({impactAck:-1})),null)
 assert.ok(parseCampusPose(pose({impactAck:2})))
 for(const age of [0,.05,.2,.7,1.5,3]){const spring=buggySuspension(1,age);assert.ok(spring.lift>=0&&spring.lift<=.035);assert.ok(Math.abs(spring.pitch)<=.045)}
})
