import {test} from 'node:test'
import assert from 'node:assert/strict'
import {nearbyCampusBuggies, sampleCampusPerson} from '../src/lib/buggyRide.ts'
import {buggySeatPose, BUGGY_SEATS} from '../src/lib/campusProtocol.ts'
import {RemoteMotionBuffer} from '../src/lib/remoteMotion.ts'
import {ridingPose} from '../src/lib/avatarMotion.ts'

const pose=extra=>({x:0,y:0,z:0,yaw:0,pitch:0,vehicle:'buggy',epoch:1,active:true,visible:true,moving:true,running:false,space:'outdoors',...extra})
const driver=p=>({id:'driver',name:'Driver',handle:null,color:'forest',activity:'walk',pose:p})
const rider=(seat,p)=>({id:`rider-${seat}`,name:'Rider',handle:null,color:'plum',activity:'walk',ride:{driverId:'driver',seat},pose:buggySeatPose(p,seat,2)})
const snapshot=(sequence,serverTime,people)=>({type:'campus-state',sequence,serverTime,people})
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`)

test('passengers stay in all three seats through buffered turns, slopes and late packets',()=>{
 const motion=new RemoteMotionBuffer(),session={id:'observer',snapshot:null,motion}
 const p0=pose({yaw:Math.PI-.2,pitch:.25}),p1=pose({x:1.2,y:.1,yaw:-Math.PI+.2,pitch:-.15})
 motion.push(snapshot(1,10000,[driver(p0),...[1,2,3].map(s=>rider(s,p0))]),0)
 session.snapshot=snapshot(2,10100,[driver(p1),...[1,2,3].map(s=>rider(s,p1))]);motion.push(session.snapshot,110)
 for(const now of [125,150,175,200,250,350,500]) {
  const renderedDriver=sampleCampusPerson(session,session.snapshot.people[0],now)
  for(const passenger of session.snapshot.people.slice(1)) {
   const p=sampleCampusPerson(session,passenger,now),dx=p.x-renderedDriver.x,dz=p.z-renderedDriver.z,dy=p.y-renderedDriver.y
   const seat=BUGGY_SEATS[passenger.ride.seat],c=Math.cos(renderedDriver.yaw),s=Math.sin(renderedDriver.yaw)
   close(dx*c-dz*s,seat.x)
   const longitudinal=dx*s+dz*c,tilt=renderedDriver.pitch??0
   close(longitudinal*Math.cos(tilt)-dy*Math.sin(tilt),seat.z)
   close(longitudinal*Math.sin(tilt)+dy*Math.cos(tilt),.23)
   close(p.yaw,renderedDriver.yaw);assert.equal(p.epoch,2)
  }
 }
 const p2=pose({visible:false});session.snapshot=snapshot(3,10200,[driver(p2),rider(1,p2)]);motion.push(session.snapshot,210)
 assert.equal(sampleCampusPerson(session,session.snapshot.people[1],220).visible,false,'hidden buggies cannot leave visible floating passengers')
})
test('the local driver sees riders in the current buggy, not the delayed network copy',()=>{
 const p=pose(),motion=new RemoteMotionBuffer(),session={id:'driver',snapshot:snapshot(1,10000,[driver(p),rider(1,p)]),motion}
 motion.push(session.snapshot,0)
 const local=pose({x:12,y:2,z:-8,yaw:1,pitch:.3}),r=sampleCampusPerson(session,session.snapshot.people[1],100,local)
 const expected=buggySeatPose(local,1,2);close(r.x,expected.x);close(r.y,expected.y);close(r.z,expected.z)
 const released={...session.snapshot.people[1],ride:undefined,pose:{...p,vehicle:'walk',epoch:3,x:4}}
 session.snapshot=snapshot(2,10100,[driver(p),released]);motion.push(session.snapshot,100)
 assert.equal(sampleCampusPerson(session,released,150,local).x,4,'dismounted avatars return to their own motion')
})
test('boarding choices include paused parked drivers and exclude self, indoors, hidden and distant vehicles',()=>{
 const people=[driver(pose({x:2,active:false,moving:false})),{...driver(pose({x:1})),id:'closer'}, {...driver(pose({x:1,visible:false})),id:'hidden'}, {...driver(pose({x:1,space:'hostel:0'})),id:'indoor'}, {...driver(pose({x:1,vehicle:'bicycle'})),id:'bicycle'}, {...driver(pose({x:6})),id:'far'}]
 const state=snapshot(1,10000,people)
 assert.deepEqual(nearbyCampusBuggies(state,'me',{x:0,z:0}).map(p=>p.id),['closer','driver'])
 assert.deepEqual(nearbyCampusBuggies(state,'driver',{x:0,z:0}).map(p=>p.id),['closer'])
 assert.deepEqual(nearbyCampusBuggies(state,'me',null),[])
 const session={id:'me',snapshot:snapshot(1,10000,[rider(1,pose())])}
 assert.equal(sampleCampusPerson(session,session.snapshot.people[0],100),null,'missing driver cannot leave a floating seat')
})
test('passengers sit with relaxed hands while drivers keep their steering pose',()=>{
 const passenger=ridingPose('buggy',0,12,true),steering=ridingPose('buggy',0,12)
 assert.deepEqual(passenger.hips,steering.hips);assert.deepEqual(passenger.knees,steering.knees)
 assert.ok(passenger.arms.every((arm,i)=>arm<steering.arms[i]))
 assert.equal(passenger.rootY,steering.rootY)
})
