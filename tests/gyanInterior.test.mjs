import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { createDigitalTwin } from '../src/lib/digitalTwin.ts'
import { extractBuildingFootprints } from '../src/lib/buildings.ts'
import { extractCampusRoads } from '../src/lib/roads.ts'
import { savedCampusOverrides } from '../src/data/campusOverrides.ts'
import { createWalkWorld, isWalkable } from '../src/lib/walking.ts'
import { createHostelPlan, createGyanMandirPlan, interiorFloorPlan, classroomFurniture, readingFurniture, interiorRoomLabel, insideHostelFootprint, isInteriorWalkable, stepInterior, stairLanding, canUseStairs, stairSample, demoRoomNumber, roomAtPoint, interiorCameraFraction, pointDistance } from '../src/lib/hostelInterior.ts'
import { buildingShape } from '../src/lib/buildingGeometry.ts'
const campus=JSON.parse(readFileSync(new URL('./fixtures/nit-goa-campus.json',import.meta.url))).elements
const roads=JSON.parse(readFileSync(new URL('./fixtures/nit-goa-roads.json',import.meta.url))).elements
const boundary=roads.find(e=>e.id===1259742369).geometry
const map={buildings:extractBuildingFootprints(campus),boundary,source:'campus-area',returnedBuildingCount:22}
const roadData={roads:extractCampusRoads(roads,boundary),boundary,source:'campus-area',returnedRoadCount:20}
const twin=createDigitalTwin(map,roadData,true,savedCampusOverrides)
const world=createWalkWorld(twin.buildings,twin.boundary,twin.terrain)
const building=twin.buildings[twin.selections.findIndex(item=>item.location.id==='relation/19505813/0')]
const seminar=twin.selections.find(s=>s.location.id==='way/1423803680').location.coordinates
const plan=createGyanMandirPlan(building,twin.roads,p=>isWalkable(p,world),seminar)
const add=(p,v,d)=>({x:p.x+v.x*d,z:p.z+v.z*d})
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} ≈ ${b}`)

test('Gyan Mandir has two courtyard openings and owner-confirmed floor/room ranges',()=>{
  assert.ok(plan);assert.equal(plan.levels,3);assert.equal(plan.holes.length,2)
  assert.deepEqual(plan.building.outer,map.buildings.find(b=>b.id===plan.buildingId).outer)
  assert.equal(map.buildings.find(b=>b.id===plan.buildingId).holes.length,1,'source OSM stays immutable')
  assert.equal(buildingShape(plan.building).holes.length,2)
  assert.ok(isWalkable(plan.entrance.outside,world));assert.ok(plan.entrance.outside.x<Math.min(...plan.outer.map(p=>p.x)),'entrance faces Seminar Complex')
  assert.deepEqual(plan.floors.map(p=>p.rooms.map(r=>Number(r.id))),[Array.from({length:15},(_,i)=>i+1),Array.from({length:30},(_,i)=>i+16),Array.from({length:30},(_,i)=>i+46)])
  assert.equal(interiorRoomLabel(plan,1,'16'),'Classroom 16')
})
test('the large reading room is on the first floor at the north end',()=>{
  assert.equal(plan.floors[0].readingRoom,undefined);assert.equal(plan.floors[2].readingRoom,undefined)
  const first=plan.floors[1],reading=first.readingRoom
  assert.ok(reading);assert.ok(reading.width*reading.depth>=140)
  assert.ok(reading.center.z<Math.min(...plan.outer.map(p=>p.z))+16)
  assert.equal(roomAtPoint(first,reading.center)?.id,'reading')
  for(const p of readingFurniture(reading))assert.equal(isInteriorWalkable(p.point,first),false)
})
test('every classroom, reading room and stair landing is reachable on foot on its floor',()=>{
  for(let floor=0;floor<3;floor++){
    const current=interiorFloorPlan(plan,floor),origin=current.entrance.inside,spacing=.4,queue=[[0,0]],visited=new Set(['0,0']),points=[]
    assert.ok(isInteriorWalkable(origin,current))
    for(let head=0;head<queue.length;head++){
      const [x,z]=queue[head],p={x:origin.x+x*spacing,z:origin.z+z*spacing};points.push(p)
      for(const [dx,dz]of [[1,0],[-1,0],[0,1],[0,-1]]){
        const key=`${x+dx},${z+dz}`;if(visited.has(key))continue
        const next=stepInterior(p,{x:dx,z:dz},4,.1,current),target={x:p.x+dx*spacing,z:p.z+dz*spacing}
        if(pointDistance(next,target)>1e-5)continue
        visited.add(key);queue.push([x+dx,z+dz])
      }
    }
    const rooms=[...current.rooms,...(current.readingRoom?[current.readingRoom]:[])]
    for(const room of rooms){
      const outside=add(room.door,room.inward,.8),inside=add(room.door,room.inward,-.8)
      assert.ok(isInteriorWalkable(outside,current),`floor ${floor} outside room ${room.id}`)
      assert.ok(isInteriorWalkable(inside,current),`floor ${floor} inside room ${room.id}`)
      assert.ok(points.some(p=>pointDistance(p,inside)<.55),`floor ${floor} room ${room.id} reachable`)
      for(const item of room.id==='reading'?readingFurniture(room):classroomFurniture(room))assert.equal(isInteriorWalkable(item.point,current),false)
    }
    for(const up of [true,false])assert.ok(points.some(p=>pointDistance(p,stairLanding(current,up))<.55),`floor ${floor} landing reachable`)
  }
})
test('Gyan stairs, courtyard camera clearance and floor-scoped multiplayer work',async()=>{
  const {parseCampusPose,canHearNearby}=await import('../src/lib/campusProtocol.ts')
  const pose={x:plan.entrance.inside.x,z:plan.entrance.inside.z,y:plan.base+.14,yaw:0,moving:false,running:false,active:true,visible:true,space:'gyan:0',epoch:1}
  assert.ok(parseCampusPose(pose));assert.ok(parseCampusPose({...pose,space:'gyan:2'}));assert.equal(parseCampusPose({...pose,space:'gyan:3'}),null)
  assert.equal(canHearNearby(pose,{...pose,space:'hostel:0'}),false);assert.equal(canHearNearby(pose,{...pose,space:'gyan:1'}),false);assert.equal(canHearNearby(pose,{...pose,x:pose.x+2}),true)
  for(let floor=0;floor<3;floor++){
    const p=interiorFloorPlan(plan,floor)
    assert.equal(canUseStairs(p,stairLanding(p,true),floor,true),floor<2)
    assert.equal(canUseStairs(p,stairLanding(p,false),floor,false),floor>0)
    if(floor<2){const sample=stairSample(p,{lowFloor:floor,up:true,progress:1});assert.equal(sample.floor,floor+1);assert.ok(isInteriorWalkable(sample.point,interiorFloorPlan(plan,floor+1)))}
    const origin={...p.entrance.inside,y:p.base+floor*p.floorHeight+1.5}
    assert.ok(interiorCameraFraction(origin,{...add(origin,p.entrance.inward,-8),y:origin.y},p,floor)<1)
  }
})

test('courtyard correction is idempotent, reversible in source data, and leaves other buildings alone',async()=>{
  const {correctGyanCourtyards,GYAN_CROSS_WING_Z}=await import('../src/lib/gyanGeometry.ts')
  const {gpsToLocal,localToGps,validClosedRing}=await import('../src/lib/geo.ts')
  const original=map.buildings.find(b=>b.id===plan.buildingId),serialized=JSON.stringify(original),corrected=correctGyanCourtyards(original)
  assert.equal(JSON.stringify(original),serialized);assert.equal(correctGyanCourtyards(corrected),corrected)
  assert.equal(correctGyanCourtyards({...original,id:'unrelated'}).holes,original.holes)
  for(const ring of corrected.holes)assert.ok(validClosedRing(ring))
  const source=original.holes[0].map(gpsToLocal),minX=Math.min(...source.map(p=>p.x)),maxX=Math.max(...source.map(p=>p.x))
  const bridge={x:(minX+maxX)/2,z:GYAN_CROSS_WING_Z}
  const {pointInRing}=await import('../src/lib/geo.ts')
  assert.ok(pointInRing(localToGps(bridge),original.holes[0]))
  assert.ok(!corrected.holes.some(h=>pointInRing(localToGps(bridge),h)))
})
