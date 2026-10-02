import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { createDigitalTwin } from '../src/lib/digitalTwin.ts'
import { extractBuildingFootprints } from '../src/lib/buildings.ts'
import { extractCampusRoads } from '../src/lib/roads.ts'
import { savedCampusOverrides } from '../src/data/campusOverrides.ts'
import { createWalkWorld, isWalkable } from '../src/lib/walking.ts'
import { createHostelPlan, insideHostelFootprint, isInteriorWalkable, stepInterior, stairLanding, canUseStairs, stairSample, demoRoomNumber, roomAtPoint, interiorCameraFraction, pointDistance } from '../src/lib/hostelInterior.ts'
import { buildingShape } from '../src/lib/buildingGeometry.ts'
const campus=JSON.parse(readFileSync(new URL('./fixtures/nit-goa-campus.json',import.meta.url))).elements
const roads=JSON.parse(readFileSync(new URL('./fixtures/nit-goa-roads.json',import.meta.url))).elements
const boundary=roads.find(e=>e.id===1259742369).geometry
const map={buildings:extractBuildingFootprints(campus),boundary,source:'campus-area',returnedBuildingCount:22}
const roadData={roads:extractCampusRoads(roads,boundary),boundary,source:'campus-area',returnedRoadCount:20}
const twin=createDigitalTwin(map,roadData,true,savedCampusOverrides)
const world=createWalkWorld(twin.buildings,twin.boundary,twin.terrain)
const building=twin.buildings[twin.selections.findIndex(item=>item.location.id==='boys-hostel')]
const plan=createHostelPlan(building,twin.roads,p=>isWalkable(p,world))
const add=(p,v,d)=>({x:p.x+v.x*d,z:p.z+v.z*d})
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} ≈ ${b}`)
test('approximate hostel plan preserves the real footprint and all three courtyards',()=> {
  assert.ok(plan);assert.equal(plan.buildingId,'relation/19505808/0');assert.equal(plan.levels,5);assert.equal(plan.floorHeight,3.2);assert.equal(plan.holes.length,3)
  assert.deepEqual(plan.building.outer,building.outer);assert.equal(buildingShape(plan.building).holes.length,3)
  for(const hole of plan.holes){const center=hole.reduce((p,q)=>({x:p.x+q.x/hole.length,z:p.z+q.z/hole.length}),{x:0,z:0});if(!insideHostelFootprint(center,plan.outer,plan.holes))assert.equal(isInteriorWalkable(center,plan),false)}
  const original=JSON.stringify(building);const second=createHostelPlan(building,twin.roads,p=>isWalkable(p,world));assert.deepEqual(second,plan);assert.equal(JSON.stringify(building),original)
})
test('entry and stair landings are safe and outdoor building collisions stay solid',()=> {
  assert.ok(isWalkable(plan.entrance.outside,world));assert.ok(isInteriorWalkable(plan.entrance.inside,plan))
  assert.equal(isWalkable(plan.entrance.inside,world),false)
  assert.ok(isInteriorWalkable(stairLanding(plan,true),plan));assert.ok(isInteriorWalkable(stairLanding(plan,false),plan))
  assert.equal(createHostelPlan(building,twin.roads,()=>false),null)
})
test('all generated rooms have passable doors, collision walls and provisional unique labels',()=> {
  assert.ok(plan.rooms.length>=10)
  const numbers=[]
  for(const room of plan.rooms){
    for(let floor=0;floor<plan.levels;floor++)numbers.push(demoRoomNumber(floor,room.id))
    const before=add(room.door,room.inward,.8),inside=add(room.door,room.inward,-.8)
    assert.ok(isInteriorWalkable(before,plan),`outside door ${room.id}`);assert.ok(isInteriorWalkable(inside,plan),`inside door ${room.id}`)
    let p=before;for(let i=0;i<8;i++)p=stepInterior(p,{x:-room.inward.x,z:-room.inward.z},2,.1,plan)
    assert.ok(pointDistance(p,inside)<1e-6,`walk through door ${room.id}`);assert.equal(roomAtPoint(plan,p)?.id,room.id)
    assert.equal(isInteriorWalkable(room.bed,plan),false);assert.equal(isInteriorWalkable(room.desk,plan),false)
    assert.equal(isInteriorWalkable(add(add(room.center,room.along,1.35),room.inward,1.1),plan),false)
    assert.equal(isInteriorWalkable(add(room.center,room.along,room.width/2),plan),false)
  }
  assert.equal(new Set(numbers).size,numbers.length);assert.ok(numbers.every(number=>number.startsWith('DEMO ')))
  assert.equal(demoRoomNumber(0,'1'),'DEMO G-01');assert.equal(demoRoomNumber(4,'29'),'DEMO 4-29')
})
test('corridors connect the entrance to every demo room and both stair landings',()=> {
  const spacing=.4, origin=plan.entrance.inside, queue=[[0,0]], reached=new Set(['0,0']), points=[]
  for(let head=0;head<queue.length;head++) {
    const [x,z]=queue[head], p={x:origin.x+x*spacing,z:origin.z+z*spacing}; points.push(p)
    for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const key=`${x+dx},${z+dz}`; if(reached.has(key))continue
      const next=stepInterior(p,{x:dx,z:dz},4,.1,plan), target={x:p.x+dx*spacing,z:p.z+dz*spacing}
      if(pointDistance(next,target)>1e-5)continue
      reached.add(key);queue.push([x+dx,z+dz])
    }
  }
  const targets=[...plan.rooms.map(room=>({id:`room ${room.id}`,point:add(room.door,room.inward,-.8)})),{id:'lower landing',point:stairLanding(plan,true)},{id:'upper landing',point:stairLanding(plan,false)}]
  for(const target of targets)assert.ok(points.some(p=>pointDistance(p,target.point)<.55),`${target.id} reachable on foot`)
})
test('interior motion is normalized, cannot tunnel through partitions and rejects invalid input',()=> {
  const p=plan.entrance.inside
  assert.deepEqual(stepInterior(p,{x:NaN,z:1},3,.1,plan),p)
  assert.deepEqual(stepInterior(p,{x:1,z:0},Infinity,.1,plan),p)
  assert.deepEqual(stepInterior(p,{x:1,z:0},3,-1,plan),p)
  const next=stepInterior(p,plan.entrance.inward,2,.1,plan);close(pointDistance(p,next),.2)
  assert.deepEqual(stepInterior(p,plan.entrance.inward,2,10,plan),next)
  const wall=plan.walls.find(w=>w.kind==='room'),mid={x:(wall.a.x+wall.b.x)/2,z:(wall.a.z+wall.b.z)/2}
  assert.equal(isInteriorWalkable(mid,plan),false)
  assert.equal(isInteriorWalkable({x:Infinity,z:0},plan),false)
  const lower=stairLanding(plan,true);let current=lower
  for(let i=0;i<30;i++)current=stepInterior(current,plan.stairs.along,3,.1,plan)
  assert.ok(pointDistance(current,lower)<1.4,'walking past the landing cannot fall into the stair opening')
})
test('stairs are proximity gated and all five levels are reachable up and down',()=> {
  for(let floor=0;floor<5;floor++){
    assert.equal(canUseStairs(plan,stairLanding(plan,true),floor,true),floor<4)
    assert.equal(canUseStairs(plan,stairLanding(plan,false),floor,false),floor>0)
  }
  assert.equal(canUseStairs(plan,plan.entrance.inside,0,true),false)
  assert.equal(canUseStairs(plan,stairLanding(plan,true),-1,true),false)
  assert.equal(canUseStairs(plan,stairLanding(plan,true),NaN,true),false)
  for(let lowFloor=0;lowFloor<4;lowFloor++)for(const up of [true,false]){
    const first=stairSample(plan,{lowFloor,up,progress:0}),last=stairSample(plan,{lowFloor,up,progress:1})
    close(first.y,plan.base+.14+(up?lowFloor:lowFloor+1)*3.2)
    close(last.y,plan.base+.14+(up?lowFloor+1:lowFloor)*3.2)
    assert.equal(last.floor,up?lowFloor+1:lowFloor);assert.equal(last.complete,true)
    assert.ok(isInteriorWalkable(first.point,plan));assert.ok(isInteriorWalkable(last.point,plan))
    let previous=first.y
    for(let i=0;i<=100;i++){const sample=stairSample(plan,{lowFloor,up,progress:i/100});assert.ok(insideHostelFootprint(sample.point,plan.outer,plan.holes,.4));assert.ok(up?sample.y>=previous:sample.y<=previous);assert.ok(Math.abs(sample.y-previous)<=.161);previous=sample.y}
  }
})
test('indoor follow camera stops at walls and courtyard edges',()=> {
  const origin={...plan.entrance.inside,y:plan.base+1.5},normal=plan.entrance.inward
  const outside={...add(origin,normal,-8),y:origin.y};assert.ok(interiorCameraFraction(origin,outside,plan)<1)
  const clear={...add(origin,normal,.2),y:origin.y};assert.equal(interiorCameraFraction(origin,clear,plan),1)
  const landing={...stairLanding(plan,false),y:plan.base+plan.floorHeight*2+.14-.1}
  const behind={...add(landing,plan.stairs.along,-4.5),y:landing.y}
  assert.ok(interiorCameraFraction(landing,behind,plan,1)<.4,'camera cannot cross the upper stair treads')
  const under={...stairLanding(plan,false),y:plan.base+plan.floorHeight+.14+1.35}
  assert.equal(interiorCameraFraction(under,{...add(under,plan.stairs.along,-1.5),y:under.y},plan,1),1,'space below stacked stairs remains open')
  const room=plan.rooms[0], headerStart={...add(room.door,room.inward,.8),y:plan.base+.14+2.35},headerEnd={...add(room.door,room.inward,-.8),y:headerStart.y}
  assert.ok(interiorCameraFraction(headerStart,headerEnd,plan)<.6,'door lintels block a high camera')
  assert.equal(interiorCameraFraction({...headerStart,y:plan.base+1.4},{...headerEnd,y:plan.base+1.4},plan),1,'camera can see through the doorway below its lintel')
})
