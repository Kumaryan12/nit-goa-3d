import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { prepareDigitalTwin } from '../src/lib/prepareDigitalTwin.ts'
import { createSeminarPlan, seminarAreaLabel, seminarDestination, seminarSurfaceHeightAt, seminarRakeHeight, seminarHallHeight, SEMINAR_ID } from '../src/lib/seminarInterior.ts'
import { extractBuildingFootprints } from '../src/lib/buildings.ts'
import { extractCampusRoads } from '../src/lib/roads.ts'
import { savedCampusOverrides } from '../src/data/campusOverrides.ts'
import { defaultTerrainSettings } from '../src/data/topography.ts'
import { createWalkWorld, isWalkable } from '../src/lib/walking.ts'
import { isInteriorWalkable, stepInterior, pointDistance, interiorJumpCeiling, interiorCameraFraction, interiorSpace } from '../src/lib/hostelInterior.ts'
import { findLocationArrival } from '../src/lib/walkArrival.ts'
import { parseCampusPose, canHearNearby, parseCampusSnapshot } from '../src/lib/campusProtocol.ts'
import { createCampusRoom } from '../server/campusRoom.ts'
const campus=JSON.parse(readFileSync(new URL('./fixtures/nit-goa-campus.json',import.meta.url))).elements
const roads=JSON.parse(readFileSync(new URL('./fixtures/nit-goa-roads.json',import.meta.url))).elements
const boundary=roads.find(e=>e.id===1259742369).geometry
const request={id:1,map:{buildings:extractBuildingFootprints(campus),boundary,source:'campus-area',returnedBuildingCount:22},roads:{roads:extractCampusRoads(roads,boundary),boundary,source:'campus-area',returnedRoadCount:20},settled:true,overrides:savedCampusOverrides,terrainSettings:defaultTerrainSettings}
const twin=prepareDigitalTwin(request),plan=twin.interiors.seminar,layout=plan?.seminar
const world=createWalkWorld(twin.buildings,twin.boundary,twin.terrain,twin.trees,twin.lamps)

test('mapped west-opening courtyard has the seated wing on the entering visitor’s left and an open right wing',()=>{
  assert.ok(plan);assert.equal(plan.kind,'seminar');assert.equal(plan.levels,1)
  assert.equal(plan.buildingId,SEMINAR_ID);assert.deepEqual(plan.building.outer,request.map.buildings.find(b=>b.id===SEMINAR_ID).outer)
  const [left,right]=layout.halls
  assert.ok(left.maxZ<=layout.courtyard.minZ);assert.ok(right.minZ>=layout.courtyard.maxZ)
  assert.equal(left.name,'Chapora Hall');assert.equal(right.name,'Sal Seminar Hall')
  assert.equal(left.floor,'sloped');assert.equal(right.floor,'stepped')
  assert.ok(left.seats.length>100);assert.equal(right.seats.length,0)
  for(const hall of layout.halls){assert.deepEqual(hall.doors.map(d=>d.route),['upper','lower']);assert.equal(hall.doors[0].elevation,layout.stairs.rise)}
  assert.ok(layout.courtyard.maxX-layout.courtyard.minX>30)
  assert.ok(isWalkable(plan.entrance.outside,world));assert.ok(isInteriorWalkable(plan.entrance.inside,plan))
  const arrival=findLocationArrival(twin.selections.find(s=>s.location.id===SEMINAR_ID).location,twin,world)
  assert.ok(arrival);assert.deepEqual(arrival.entrance.point,plan.entrance.point);assert.ok(arrival.position.x<plan.entrance.point.x)
  assert.equal(createSeminarPlan({...plan.building,id:'unrelated'},()=>true),null)
  assert.equal(createSeminarPlan(plan.building,()=>false),null)
})

test('courtyard, both doorways, stage fronts and all seat aisles are connected without crossing walls or furniture',()=>{
  const origin=plan.entrance.inside,spacing=.4,base=plan.base+.14,queue=[[0,0,base]],seen=new Set(['0,0,0']),points=[]
  for(let head=0;head<queue.length;head++){
    const [x,z,feet]=queue[head],p={x:origin.x+x*spacing,z:origin.z+z*spacing};points.push({...p,y:feet})
    for(const [dx,dz]of [[1,0],[-1,0],[0,1],[0,-1]]){
      const target={x:p.x+dx*spacing,z:p.z+dz*spacing},next=stepInterior(p,{x:dx,z:dz},4,.1,plan,feet)
      const nextFeet=seminarSurfaceHeightAt(plan,next,feet),key=`${x+dx},${z+dz},${Math.round((nextFeet-base)*10)}`;if(seen.has(key))continue
      if(pointDistance(next,target)>1e-5)continue
      seen.add(key);queue.push([x+dx,z+dz,nextFeet])
    }
  }
  for(const hall of layout.halls){
    for(const door of [...hall.doors,hall.rearDoor])assert.ok(points.some(p=>pointDistance(p,door)<.6&&Math.abs(p.y-base-door.elevation)<.2),`${hall.id} ${door.axis==='z'?'rear':door.route} door reachable`)
    for(const z of [hall.minZ+1,hall.maxZ-1,(hall.minZ+hall.maxZ)/2])for(const x of [hall.minX+6,hall.minX+17,hall.stage.x-4])assert.ok(points.some(p=>pointDistance(p,{x,z})<.65),`${hall.id} aisle ${x},${z}`)
    for(const seat of hall.seats)assert.equal(isInteriorWalkable(seat,plan),false)
    assert.equal(isInteriorWalkable(hall.stage,plan),false)
  }
  for(const area of ['courtyard','upper','seated','open'])assert.ok(isInteriorWalkable(seminarDestination(plan,area),plan))
  const under={x:(layout.landing.minX+layout.landing.maxX)/2,z:(layout.courtyard.minZ+layout.courtyard.maxZ)/2}
  for(const elevation of [0,layout.stairs.rise])assert.ok(points.some(p=>pointDistance(p,under)<.6&&Math.abs(p.y-base-elevation)<.1),`landing layer ${elevation} reachable`)
  assert.equal(seminarDestination(plan,'unknown'),null)
  assert.equal(seminarAreaLabel(plan,origin),'Entrance courtyard')
  for(const hall of layout.halls)assert.equal(seminarAreaLabel(plan,seminarDestination(plan,hall.id)),hall.name)
})

test('hall walls resist sprint tunnelling, door headers have headroom, and the courtyard stays open to the sky',()=>{
  const hall=layout.halls[0],wallZ=hall.maxZ,origin={x:hall.minX+20,z:wallZ+2}
  let p=origin
  for(let i=0;i<80;i++)p=stepInterior(p,{x:0,z:-1},100,1,plan)
  assert.ok(p.z>wallZ+.5)
  assert.equal(interiorJumpCeiling(plan,plan.entrance.inside,0),Infinity)
  assert.equal(interiorJumpCeiling(plan,hall.doors[0],0),Infinity)
  const a={...origin,y:plan.base+1.7},b={x:origin.x,z:wallZ-3,y:a.y}
  assert.ok(interiorCameraFraction(a,b,plan)<1)
  for(const door of hall.doors){
    const y=plan.base+.14+door.elevation
    assert.equal(interiorCameraFraction({...door,z:door.z+1,y:y+1.8},{...door,z:door.z-1,y:y+1.8},plan),1)
    const camera=interiorCameraFraction({...door,z:door.z+.5,y:y+3.2},{...door,z:door.z-.5,y:y+3.2},plan)
    if(door.open)assert.equal(camera,1,'the open walkway has no invisible door header')
    else assert.ok(camera<1)
  }
  for(const hall of layout.halls){
    const d=hall.rearDoor,y=plan.base+.14+d.elevation
    assert.equal(interiorJumpCeiling(plan,d,0),y+3)
    assert.equal(interiorCameraFraction({...d,x:d.x-.8,y:y+1.7},{...d,x:d.x+.8,y:y+1.7},plan),1)
    assert.ok(interiorCameraFraction({...d,x:d.x-.8,y:y+3.3},{...d,x:d.x+.8,y:y+3.3},plan)<1)
    const blocked={x:d.x-1,z:d.z+3},stopped=stepInterior(blocked,{x:1,z:0},5.5,.1,plan,y)
    assert.ok(stopped.x<d.x-.5,'rear wall only admits visitors through its centre doorway')
  }
  const rear=seminarDestination(plan,'seated'),court=plan.entrance.inside
  assert.ok(interiorCameraFraction({...rear,y:plan.base+4},{...rear,y:plan.base+plan.floorHeight+2},plan)<1)
  assert.equal(interiorCameraFraction({...court,y:plan.base+4},{...court,y:plan.base+plan.floorHeight+2},plan),1)
})


test('entrance flights are rotated 180 degrees in place and connect to the rear gallery, while Chapora slopes and Sal steps down toward their stages',()=>{
  const base=plan.base+.14,s=layout.stairs
  assert.equal(s.flights.length,2)
  assert.ok(s.flights[0].maxZ<s.flights[1].minZ,'flight footprints remain on opposite sides')
  assert.deepEqual(s.flights.map(f=>f.direction),[-1,1],'each flight faces 180 degrees opposite its former orientation')
  for(const f of s.flights)assert.ok(f.maxZ-f.minZ>3*(f.maxX-f.minX),'runs are perpendicular to the entrance approach')
  const meet=seminarDestination(plan,'upper')
  const walk=(from,feet,target)=>{
    let p={...from}
    for(let i=0;i<600&&pointDistance(p,target)>.005;i++){
      const d=pointDistance(p,target),next=stepInterior(p,{x:target.x-p.x,z:target.z-p.z},Math.min(3,d/.025),.025,plan,feet),height=seminarSurfaceHeightAt(plan,next,feet)
      assert.ok(pointDistance(next,p)>.00001,'stair/landing route stays clear')
      assert.ok(Math.abs(height-feet)<=.151,'entrance stairs cannot teleport height')
      p=next;feet=height
    }
    assert.ok(pointDistance(p,target)<.01,'route reaches its destination')
    return {p,feet}
  }
  for(const flight of s.flights){
    const start={x:(flight.minX+flight.maxX)/2,z:flight.direction===1?flight.minZ-.65:flight.maxZ+.65},top={x:start.x,z:flight.direction===1?flight.maxZ+1.4:flight.minZ-1.4}
    let route=walk(plan.entrance.inside,base,start)
    route=walk(route.p,route.feet,top)
    assert.equal(route.feet,base+s.rise)
    route=walk(route.p,route.feet,{x:meet.x,z:top.z})
    route=walk(route.p,route.feet,meet)
    for(const hall of layout.halls){
      const door=hall.doors[0],destination={x:door.x,z:door.z+(hall.id==='seated'?-1:1)}
      route=walk(route.p,route.feet,destination)
      assert.equal(route.feet,base+s.rise,'either flight reaches the rear foyer gallery')
      route=walk(route.p,route.feet,{x:hall.rearDoor.x-.7,z:hall.rearDoor.z})
      route=walk(route.p,route.feet,seminarDestination(plan,hall.id))
      route=walk(route.p,route.feet,{x:hall.rearDoor.x-.7,z:hall.rearDoor.z})
      route=walk(route.p,route.feet,{x:door.x,z:destination.z})
      route=walk(route.p,route.feet,meet)
    }
    route=walk(route.p,route.feet,{x:meet.x,z:top.z})
    route=walk(route.p,route.feet,top)
    route=walk(route.p,route.feet,start)
    assert.equal(route.feet,base)
    route=walk(route.p,route.feet,plan.entrance.inside)
  }
  const centre={x:plan.entrance.inside.x,z:meet.z}
  assert.equal(seminarSurfaceHeightAt(plan,centre,base),base,'entrance approach stays at ground level')
  const belowMeet={x:(s.minX+s.maxX)/2,z:meet.z}
  assert.equal(seminarSurfaceHeightAt(plan,belowMeet,base),base,'the centre remains at ground level after rotating the flights')
  for(const hall of layout.halls){
    const middle=(hall.minZ+hall.maxZ)/2
    let p={x:layout.rake.rearX-.5,z:middle},feet=seminarSurfaceHeightAt(plan,p)
    for(let i=0;i<250&&p.x<layout.rake.frontX+.5;i++){const before=p;p=stepInterior(p,{x:1,z:0},3,.025,plan,feet);assert.ok(p.x>before.x,'centre aisle remains walkable');feet=seminarSurfaceHeightAt(plan,p,feet)}
    assert.ok(p.x>layout.rake.frontX);assert.equal(feet,base)
    assert.equal(seminarSurfaceHeightAt(plan,{x:hall.doors[0].x,z:middle}),base+s.rise)
    assert.equal(seminarSurfaceHeightAt(plan,{x:hall.doors[1].x,z:middle}),base)
    for(const seat of hall.seats)assert.equal(seat.elevation,seminarRakeHeight(layout,seat.x))
    assert.ok(interiorCameraFraction({x:layout.rake.rearX,z:middle,y:base+s.rise+1},{x:layout.rake.rearX+2,z:middle,y:base},plan)<1,'camera cannot pass through raked floor')
  }
  const under={x:(layout.landing.minX+layout.landing.maxX)/2,z:(layout.courtyard.minZ+layout.courtyard.maxZ)/2}
  assert.equal(seminarSurfaceHeightAt(plan,under,base),base)
  assert.equal(seminarSurfaceHeightAt(plan,under,base+s.rise),base+s.rise)
  assert.equal(interiorJumpCeiling(plan,under,0,base),base+s.rise-.16)
  assert.equal(interiorJumpCeiling(plan,under,0,base+s.rise),Infinity)
  assert.ok(interiorCameraFraction({...under,y:base+2},{...under,y:base+4},plan)<1,'landing deck stops camera')
})


test('Sal has level treads and discrete risers, with walkable ascent and descent at low frame rates',()=>{
  const [chapora,sal]=layout.halls,{rearX,frontX,rise,steps}=layout.rake,run=(frontX-rearX)/steps,z=(sal.minZ+sal.maxZ)/2,base=plan.base+.14
  assert.equal(steps,10);assert.ok(run>1.4,'Sal terraces are substantially deeper than ordinary stair treads')
  assert.ok(rise/steps>=.29&&rise/steps<=.32,'larger risers stay within safe indoor step-up allowance')
  for(let i=0;i<steps;i++){
    const a=rearX+(i+.2)*run,b=rearX+(i+.8)*run
    assert.equal(seminarHallHeight(layout,sal,a),seminarHallHeight(layout,sal,b),'each tread is level')
    assert.ok(seminarHallHeight(layout,chapora,a)>seminarHallHeight(layout,chapora,b),'Chapora remains continuously sloped')
    assert.ok(Math.abs(seminarHallHeight(layout,sal,a)-seminarHallHeight(layout,sal,b+run)-rise/steps)<1e-9,'one safe riser between treads')
  }
  // A delayed frame cannot skip several risers or stop motion at a step.
  for(const direction of [1,-1]){
    let p={x:direction===1?rearX-.5:frontX+.5,z},feet=seminarSurfaceHeightAt(plan,p)
    for(let i=0;i<40;i++){
      const before=p,next=stepInterior(p,{x:direction,z:0},5.5,.1,plan,feet)
      assert.ok((next.x-before.x)*direction>.5,'no blocked step at speed')
      p=next;feet=seminarSurfaceHeightAt(plan,p,feet)
      if(direction===1?p.x>frontX+.5:p.x<rearX-.5)break
    }
    assert.ok(direction===1?p.x>frontX:p.x<rearX)
    assert.ok(Math.abs(feet-base-(direction===1?0:rise))<1e-9)
  }
})


test('a broad upper concourse connects both foyers without walls or narrow doorways',()=>{
  const y=plan.base+.14+layout.stairs.rise,[chapora,sal]=layout.halls
  assert.ok(layout.landing.maxX-layout.landing.minX>10)
  for(const x of [layout.landing.minX+.75,(layout.landing.minX+layout.landing.maxX)/2,layout.landing.maxX-.75]){
    for(const direction of [1,-1]){
      let p={x,z:direction===1?chapora.maxZ-2:sal.minZ+2},target=direction===1?sal.minZ+2:chapora.maxZ-2
      for(let i=0;i<250&&Math.abs(p.z-target)>.01;i++){
        const next=stepInterior(p,{x:0,z:direction},Math.min(4,Math.abs(target-p.z)/.025),.025,plan,y)
        assert.ok((next.z-p.z)*direction>.00001,'full-width crossing is unobstructed')
        assert.equal(seminarSurfaceHeightAt(plan,next,y),y)
        p=next
      }
      assert.ok(Math.abs(p.z-target)<.01)
    }
    for(const z of [chapora.maxZ,sal.minZ])assert.equal(interiorCameraFraction({x,z:z-1,y:y+1.7},{x,z:z+1,y:y+1.7},plan),1,'removed wall cannot shorten the camera')
  }
  const edge={x:layout.landing.maxX-.7,z:(chapora.maxZ+sal.minZ)/2}
  let p=edge
  for(let i=0;i<20;i++)p=stepInterior(p,{x:1,z:0},5.5,.1,plan,y)
  assert.ok(p.x<layout.landing.maxX-.5,'edge guard remains solid')
  const gallery={x:layout.landing.minX+1,z:chapora.maxZ-2}
  assert.ok(interiorCameraFraction({...gallery,y:y+1},{...gallery,y:plan.base+plan.floorHeight+2},plan)<1,'hall roof remains solid above the gallery')
})

test('seminar multiplayer space accepts live movement and chat while separating other buildings and invalid floors',()=>{
  const pose={...plan.entrance.inside,y:plan.base+.14,yaw:0,moving:false,running:false,active:true,visible:true,space:interiorSpace(plan,0),epoch:1}
  assert.ok(parseCampusPose(pose));assert.equal(parseCampusPose({...pose,space:'seminar:1'}),null)
  assert.equal(canHearNearby(pose,{...pose,space:'hostel:0'}),false);assert.equal(canHearNearby(pose,{...pose,x:pose.x+2}),true)
  const room=createCampusRoom(twin.boundary,[],[])
  room.add({id:'alice',name:'Alice',handle:null,color:'forest',avatarStyle:'boy',expiresAt:Date.now()+60000})
  room.add({id:'bob',name:'Bob',handle:null,color:'ocean',avatarStyle:'girl',expiresAt:Date.now()+60000})
  assert.equal(room.updatePose('alice',pose,'walk'),'accepted')
  assert.equal(room.updatePose('bob',{...pose,x:pose.x+1},'walk'),'accepted')
  assert.ok(parseCampusSnapshot(room.snapshot()))
  const sent=room.chat('alice','Meet me in the seated hall','nearby');assert.ok(sent.recipients.includes('bob'))
})
