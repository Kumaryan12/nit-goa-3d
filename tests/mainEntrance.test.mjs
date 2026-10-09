import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { savedCampusOverrides } from '../src/data/campusOverrides.ts'
import { extractBuildingFootprints } from '../src/lib/buildings.ts'
import { extractCampusRoads } from '../src/lib/roads.ts'
import { createDigitalTwin } from '../src/lib/digitalTwin.ts'
import { createMainEntrance, entrancePoint, entranceBlocksWalking, createEntrancePlanting, entranceBoundaryPaths, mainEntranceCamera } from '../src/lib/mainEntrance.ts'
import { createWalkWorld, isWalkable, findSharedSpawn, stepWalking } from '../src/lib/walking.ts'
import { findLocationArrival } from '../src/lib/walkArrival.ts'
import { advanceVehicle, canRideAt, VEHICLES, vehicleSurfaceHeightAt } from '../src/lib/vehicles.ts'
import { distanceToSegment, terrainHeightAt } from '../src/lib/terrain.ts'
import { createCampusRoom } from '../server/campusRoom.ts'
import { createEntranceExterior, inEntranceExterior } from '../src/lib/entranceExterior.ts'
import { ROAD_ELEVATION } from '../src/lib/roadRibbon.ts'
import { gpsToLocal } from '../src/lib/geo.ts'

const elements=JSON.parse(readFileSync(new URL('./fixtures/nit-goa-campus.json',import.meta.url))).elements
const roadElements=JSON.parse(readFileSync(new URL('./fixtures/nit-goa-roads.json',import.meta.url))).elements
const boundary=roadElements.find(e=>e.id===1259742369).geometry
const roads={roads:extractCampusRoads(roadElements,boundary),boundary,source:'campus-area',returnedRoadCount:20}
const twin=createDigitalTwin({buildings:extractBuildingFootprints(elements),boundary,source:'campus-area',returnedBuildingCount:22},roads,true,savedCampusOverrides)
const gate=twin.mainEntrance,world=createWalkWorld(twin.buildings,twin.boundary,twin.terrain,twin.trees,twin.lamps)
const yaw=Math.atan2(-gate.inward.x,-gate.inward.z)

test('gateway follows the two mapped approach lanes without moving roads or the canal',()=>{
  assert.ok(gate.clearance>5)
  assert.equal(twin.terrain.entrance,gate)
  assert.deepEqual(twin.roads,roads.roads)
  assert.ok(twin.canal.center.x-gate.center.x>25)
  assert.equal(createMainEntrance([],savedCampusOverrides['main-entrance'].coordinates),undefined)
  assert.equal(createMainEntrance(twin.roads,{x:500,z:500}),undefined)
  assert.deepEqual(structuredClone(gate),gate,'worker transfer preserves the same collision plan')
  for(let lane=0;lane<2;lane++)for(let u=0;u<=26;u+=.5)for(const offset of [-.8,0,.8]) {
    const point=entrancePoint(gate,u,gate.laneOffsets[lane]+offset)
    assert.equal(isWalkable(point,world),true,`lane ${lane}, ${u}, ${offset}`)
    assert.equal(canRideAt(point,yaw,'buggy',world,twin.roads),true,`buggy ${lane}, ${u}, ${offset}`)
  }
})
test('walking, bicycles and maximum-speed buggies traverse the gate and canal without a stop',()=>{
  for(const offset of gate.laneOffsets) {
    let pedestrian=entrancePoint(gate,1,offset)
    for(let i=0;i<180;i++)pedestrian=stepWalking(pedestrian,gate.inward,4,.05,world)
    assert.ok(pedestrian.x>gate.center.x+34)
    for(const kind of ['bicycle','buggy']) {
      let point=entrancePoint(gate,2,offset),state={speed:VEHICLES[kind].speed,yaw,steering:0}
      for(let i=0;i<Math.ceil(40/(VEHICLES[kind].speed*.05));i++) {
        const next=advanceVehicle(state,point,kind,1,0,false,.05,world,twin.roads)
        assert.equal(next.blocked,false,`${kind}, lane ${offset}, frame ${i}`)
        assert.ok(state.speed>=VEHICLES[kind].speed-.01)
        point=next.point
      }
      assert.ok(point.x>gate.center.x+36)
    }
  }
})
test('gate piers, side walls and bollards are solid; 32 simultaneous gate arrivals remain distinct and movable',()=>{
  for(const solid of gate.solids)assert.equal(isWalkable(entrancePoint(gate,solid.u,solid.v),world),false)
  const arrival=findLocationArrival(twin.locations.find(l=>l.id==='main-entrance'),twin,world),occupied=[]
  assert.ok(arrival)
  for(let slot=0;slot<32;slot++) {
    const p=findSharedSpawn(arrival.position,world,slot,occupied,arrival.entrance)
    assert.equal(isWalkable(p,world),true)
    assert.ok(occupied.every(other=>Math.hypot(other.x-p.x,other.z-p.z)>=1.5))
    const moved=stepWalking(p,gate.inward,4,.1,world)
    assert.ok(Math.hypot(moved.x-p.x,moved.z-p.z)>.05,`slot ${slot} can leave its spawn`)
    occupied.push(p)
  }
})
test('entrance planting stays rooted, deterministic and clear of vehicles and solid architecture',()=>{
  const planting=createEntrancePlanting(gate,twin.terrain,twin.boundary)
  assert.deepEqual(planting.gardens,twin.entranceGardens)
  assert.equal(planting.palms.length,4)
  assert.ok(planting.gardens.flowers.length>=130 && planting.gardens.flowers.length<=144)
  const edges=twin.roads.flatMap(r=>r.paths.flatMap(path=>path.slice(1).map((b,i)=>({a:path[i],b,width:r.width}))))
  for(const p of [...planting.palms,...planting.gardens.flowers,...planting.gardens.shrubs]) {
    assert.equal(p.y,terrainHeightAt(twin.terrain,p.x,p.z))
    assert.equal(entranceBlocksWalking(p,gate,.4),false)
    assert.ok(edges.every(edge=>distanceToSegment(p,edge.a,edge.b)>edge.width/2+.4))
  }
})
test('boundary plinth and wall paths leave the entire entry opening clear, including segment ends',()=>{
  const anchor=savedCampusOverrides['main-entrance'].coordinates
  const paths=entranceBoundaryPaths(twin.boundary,anchor)
  assert.ok(paths.length>0)
  for(const [a,b] of paths)assert.ok(distanceToSegment(anchor,a,b)>=16-1e-6)
  const straight=[{x:0,z:-30},{x:0,z:30}]
  assert.deepEqual(entranceBoundaryPaths(straight,{x:0,z:0}),[[{x:0,z:-30},{x:0,z:-16}],[{x:0,z:16},{x:0,z:30}]])
  assert.deepEqual(entranceBoundaryPaths([{x:0,z:-5},{x:0,z:5}],{x:0,z:0}),[])
})
test('visitors walk and ride outward through the gateway to the real NH66 approach without boundary stops',()=>{
  const exterior=twin.terrain.entranceExterior
  assert.ok(exterior)
  assert.equal(exterior.roads[0].osmId,263846123)
  for(const v of gate.laneOffsets) {
    const direction={x:-gate.inward.x,z:-gate.inward.z}
    let point=entrancePoint(gate,3,v)
    for(let i=0;i<125;i++)point=stepWalking(point,direction,4,.05,world)
    assert.ok(point.x<gate.center.x-21,'walking reaches the highway shoulder')
    for(const kind of ['bicycle','buggy']) {
      let p=entrancePoint(gate,4,v),state={speed:VEHICLES[kind].speed,yaw:Math.atan2(gate.inward.x,gate.inward.z),steering:0}
      for(let i=0;i<Math.ceil(25/(VEHICLES[kind].speed*.05));i++) {
        const next=advanceVehicle(state,p,kind,1,0,false,.05,world,twin.roads)
        assert.equal(next.blocked,false,`${kind} outward lane ${v}, ${i}`);p=next.point
      }
      assert.ok(p.x<gate.center.x-20)
    }
  }
  for(const p of exterior.highway.slice(1,-1)) {
    assert.equal(isWalkable(p,world),true)
    assert.ok(Math.abs(vehicleSurfaceHeightAt(p,world,twin.roads)-terrainHeightAt(twin.terrain,p.x,p.z)-ROAD_ELEVATION)<1e-6,'tyres follow the rendered highway')
  }
  assert.equal(isWalkable({x:-650,z:40},world),false,'outside access stays bounded')
  const wall=twin.boundary.find(p=>p.x<-540 && p.z>30)
  assert.equal(isWalkable(wall,world),false,'the highway does not open other perimeter walls')
  assert.equal(createEntranceExterior([{x:0,z:0},{x:10,z:0},{x:10,z:10},{x:0,z:0}]),undefined)
})
test('the shared room accepts exterior visitors while retaining the original map boundary and rejecting distant poses',()=>{
  const now=Date.now()
  const room=createCampusRoom(twin.boundary),p=entrancePoint(gate,-23,0)
  const identity={id:'exterior-friend',name:'Friend',role:'member',expiresAt:Date.now()+60000}
  const pose={...p,y:terrainHeightAt(twin.terrain,p.x,p.z),yaw:0,epoch:1,moving:false,running:false,active:true,visible:true,space:'outdoors'}
  room.add(identity)
  assert.equal(inEntranceExterior(p,twin.terrain.entranceExterior),true)
  assert.equal(room.updatePose(identity.id,pose,'walk',now),'accepted')
  assert.equal(room.snapshot().people[0].pose.x,p.x)
  assert.equal(room.snapshot().people[0].pose.z,p.z)
  room.add({...identity,id:'inside-friend'})
  assert.equal(room.updatePose('inside-friend',{...pose,...entrancePoint(gate,5,gate.laneOffsets[0])},'walk',now+100),'accepted')
  assert.equal(room.snapshot().people.filter(person=>person.pose?.visible).length,2,'both visitors remain in the same live room')
  assert.equal(room.updatePose(identity.id,{...pose,x:-800,z:200,epoch:2},'walk',now+200),'invalid')
  assert.deepEqual(twin.boundary,roads.boundary.map(gpsToLocal))
})
test('entrance selection frames the entire facade from outside on desktop and portrait screens',()=>{
  for(const aspect of [1.7,.56]) {
    const view=mainEntranceCamera(gate,twin.terrain,aspect)
    assert.ok(view.position[0]<gate.center.x-40)
    const distance=Math.hypot(view.position[0]-view.target[0],view.position[2]-view.target[2])
    assert.ok(2*distance*Math.tan(Math.PI/8)*aspect>gate.halfSpan*2+12)
  }
})
