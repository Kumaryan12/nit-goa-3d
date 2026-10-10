import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createCampusRoom } from '../server/campusRoom.ts'
import { buggySeatPose, BUGGY_SEATS, parseCampusSnapshot, parseCampusPose } from '../src/lib/campusProtocol.ts'
const boundary=[{x:-200,z:-200},{x:200,z:-200},{x:200,z:200},{x:-200,z:200},{x:-200,z:-200}]
const pose=(extra={})=>({x:0,y:0,z:0,yaw:0,moving:false,running:false,active:true,visible:true,space:'outdoors',vehicle:'walk',epoch:1,...extra})
function fixture(){const room=createCampusRoom(boundary);for(const id of ['driver','alice','bob','carol','dave']){room.add({id,name:id,role:'member',expiresAt:Date.now()+60000});room.pose(id,pose({vehicle:id==='driver'?'buggy':'walk',x:id==='driver'?0:1}),'walk',1000)}return room}
const person=(room,id,time=1200)=>room.snapshot(time).people.find(p=>p.id===id)

test('buggies reserve three distinct passenger seats atomically and reuse a released seat',()=>{
 const room=fixture()
 for(const id of ['alice','bob','carol'])assert.deepEqual(room.ride(id,'driver',1100),{ok:true})
 assert.deepEqual(['alice','bob','carol'].map(id=>person(room,id).ride.seat),[1,2,3])
 assert.match(room.ride('dave','driver',1100).error,/full/)
 assert.match(room.ride('driver','driver',1100).error,/another/)
 assert.match(room.ride('alice','bob',1400).error,/on foot/)
 assert.deepEqual(room.ride('alice',null,1700),{ok:true})
 assert.deepEqual(room.ride('dave','driver',1700),{ok:true});assert.equal(person(room,'dave',1700).ride.seat,1)
 assert.ok(parseCampusSnapshot(room.snapshot(1700)))
})
test('passenger coordinates and orientation derive from the driver, including rotation and grades',()=>{
 const room=fixture();room.ride('alice','driver',1100)
 const moved=pose({vehicle:'buggy',x:.3,z:-.4,y:.2,yaw:Math.PI/2})
 assert.ok(room.pose('driver',moved,'walk',1200))
 const passenger=person(room,'alice'),expected=buggySeatPose(person(room,'driver').pose,1,2)
 assert.equal(passenger.pose.x,expected.x);assert.equal(passenger.pose.y,expected.y);assert.equal(passenger.pose.z,expected.z);assert.equal(passenger.pose.yaw,Math.PI/2)
 assert.ok(room.pose('alice',pose({epoch:2,x:150,y:60,z:150}),'walk',1300),'position submissions cannot alter the server seat')
 assert.ok(Math.abs(person(room,'alice',1300).pose.x)<2)
 assert.equal(room.pose('alice',pose({epoch:2,vehicle:'buggy'}),'walk',1400),false,'a passenger cannot drive another vehicle')
 assert.match(room.ride('alice',null,1500).error,/stop/)
})
test('pre-boarding walking heartbeats cannot cancel a newly assigned seat',()=>{
 const room=fixture();assert.deepEqual(room.ride('alice','driver',1100),{ok:true})
 for(const time of [1180,1260,1340]) {
  assert.equal(room.updatePose('alice',pose({x:1,epoch:1}),'walk',time),'throttled')
  const rider=person(room,'alice',time);assert.equal(rider.ride.driverId,'driver');assert.equal(rider.pose.epoch,2)
 }
 assert.ok(room.pose('alice',pose({epoch:2,x:80}),'walk',1420))
 assert.equal(person(room,'alice',1420).ride.seat,1,'acknowledged passenger coordinates still come from the driver')
 room.pose('alice',pose({epoch:2,visible:false}),'overview',1500)
 assert.equal(person(room,'alice',1500).ride,undefined,'leaving avatar mode still releases the seat')
})
test('a visible parked buggy accepts riders while its driver pauses; airborne riders cannot board',()=>{
 const room=fixture();assert.ok(room.pose('driver',pose({vehicle:'buggy',active:false}),'walk',1200))
 assert.deepEqual(room.ride('alice','driver',1300),{ok:true})
 assert.ok(room.pose('bob',pose({x:1,y:.2,airborne:true}),'walk',1200))
 assert.match(room.ride('bob','driver',1300).error,/Walk within/)
})
test('boarding rejects remote, stale, moving, indoor, inactive and non-walking users',()=>{
 for(const variant of ['far','stale','moving','indoor','inactive','bicycle','football']){
  const room=fixture()
  if(variant==='far')room.pose('alice',pose({x:40,epoch:2}),'walk',2200)
  if(variant==='moving')room.pose('driver',pose({vehicle:'buggy',x:.6}),'walk',1200)
  if(variant==='indoor')room.pose('alice',pose({x:1,space:'gyan:0'}),'walk',1200)
  if(variant==='inactive')room.pose('alice',pose({x:1,active:false}),'walk',1200)
  if(variant==='bicycle')room.pose('alice',pose({x:1,vehicle:'bicycle'}),'walk',1200)
  if(variant==='football')room.pose('alice',pose({x:1}),'football',1200)
  assert.ok('error' in room.ride('alice','driver',variant==='stale'?3100:variant==='far'?2300:1300),variant)
 }
 assert.ok('error' in fixture().ride('unknown','driver',1100))
 assert.ok('error' in fixture().ride('alice','missing',1100))
})
test('driver departure, teleport, dismount and stale connection release all passengers at the old buggy',()=>{
 for(const change of ['disconnect','teleport','dismount','hidden','stale']){
  const room=fixture();room.ride('alice','driver',1100);room.ride('bob','driver',1100)
  if(change==='disconnect')room.remove('driver')
  if(change==='teleport')assert.ok(room.pose('driver',pose({vehicle:'buggy',x:80,epoch:2}),'walk',2200))
  if(change==='dismount')assert.ok(room.pose('driver',pose(),'walk',1300))
  if(change==='hidden')assert.ok(room.pose('driver',pose({vehicle:'buggy',visible:false}),'overview',1300))
  const snapshot=room.snapshot(change==='stale'?3100:2300)
  for(const id of ['alice','bob']){
   const p=snapshot.people.find(p=>p.id===id);assert.equal(p.ride,undefined,change);assert.equal(p.pose.vehicle,'walk');assert.equal(p.pose.x,0);assert.equal(p.pose.y,0);assert.equal(p.pose.epoch,3)
  }
  assert.ok(parseCampusSnapshot(snapshot))
 }
})
test('snapshot validation rejects forged or duplicate seats and retains four-seat local offsets',()=>{
 const room=fixture();room.ride('alice','driver',1100);const snapshot=room.snapshot(1200)
 assert.equal(BUGGY_SEATS.length,4)
 const bad=modify=>{const s=structuredClone(snapshot);modify(s.people);assert.equal(parseCampusSnapshot(s),null)}
 bad(p=>{p.find(x=>x.id==='alice').ride.seat=0})
 bad(p=>{p.find(x=>x.id==='alice').ride.driverId='alice'})
 bad(p=>{p.find(x=>x.id==='alice').ride.driverId='absent'})
 bad(p=>{p.find(x=>x.id==='driver').pose.vehicle='bicycle'})
 bad(p=>{p.find(x=>x.id==='bob').ride={driverId:'driver',seat:1}})
})
test('passenger removal frees its seat, and nearby chat follows the seated position',()=>{
 const room=fixture();room.ride('alice','driver',1100);room.remove('alice')
 assert.deepEqual(room.ride('bob','driver',1100),{ok:true});assert.equal(person(room,'bob').ride.seat,1)
 const message=room.chat('bob','Thanks for the ride','nearby',1200);assert.ok(message.recipients.includes('driver'))
 assert.equal(room.ride('bob',null,1200).ok,undefined,'boarding actions are rate limited')
})

test('seat transforms follow buggy pitch on slopes, and pose parsing bounds the tilt',()=>{
 const driver=pose({vehicle:'buggy',pitch:.3,y:2,yaw:Math.PI/2})
 const front=buggySeatPose(driver,1,2),rear=buggySeatPose(driver,3,2)
 assert.ok(front.y>rear.y);assert.equal(front.pitch,.3);assert.ok(parseCampusPose(front))
 assert.equal(parseCampusPose(pose({pitch:NaN})),null);assert.equal(parseCampusPose(pose({pitch:1})),null)
 const flat=buggySeatPose(pose({vehicle:'buggy'}),1,2);assert.equal(flat.y,.23);assert.equal(flat.x,BUGGY_SEATS[1].x);assert.equal(flat.z,BUGGY_SEATS[1].z)
})
