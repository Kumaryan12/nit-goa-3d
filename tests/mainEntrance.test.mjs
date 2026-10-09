import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { savedCampusOverrides } from '../src/data/campusOverrides.ts'
import { extractBuildingFootprints } from '../src/lib/buildings.ts'
import { extractCampusRoads } from '../src/lib/roads.ts'
import { createDigitalTwin } from '../src/lib/digitalTwin.ts'
import { createMainEntrance, entrancePoint, entranceBlocksWalking, createEntrancePlanting, entranceBoundaryPaths } from '../src/lib/mainEntrance.ts'
import { createWalkWorld, isWalkable, findSharedSpawn, stepWalking } from '../src/lib/walking.ts'
import { findLocationArrival } from '../src/lib/walkArrival.ts'
import { advanceVehicle, canRideAt, VEHICLES } from '../src/lib/vehicles.ts'
import { distanceToSegment, terrainHeightAt } from '../src/lib/terrain.ts'

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
