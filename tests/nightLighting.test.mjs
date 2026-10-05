import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { createDigitalTwin } from '../src/lib/digitalTwin.ts'
import { extractBuildingFootprints } from '../src/lib/buildings.ts'
import { extractCampusRoads, pointInCampus } from '../src/lib/roads.ts'
import { savedCampusOverrides } from '../src/data/campusOverrides.ts'
import { terrainHeightAt, distanceToSegment } from '../src/lib/terrain.ts'
import { generateCampusLamps, lampHead, nearestCampusLamps, NIGHT_LIGHT_BUDGET, STREETLIGHT_LIMIT } from '../src/lib/nightLighting.ts'
import { createWalkWorld, isWalkable, stepWalking, cameraBoomFraction } from '../src/lib/walking.ts'
import { inCanalOpening } from '../src/lib/canal.ts'
const b=JSON.parse(readFileSync(new URL('./fixtures/nit-goa-campus.json',import.meta.url))).elements
const r=JSON.parse(readFileSync(new URL('./fixtures/nit-goa-roads.json',import.meta.url))).elements
const boundary=r.find(e=>e.id===1259742369).geometry
const twin=createDigitalTwin({buildings:extractBuildingFootprints(b),boundary,source:'campus-area',returnedBuildingCount:22},{roads:extractCampusRoads(r,boundary),boundary,source:'campus-area',returnedRoadCount:20},true,savedCampusOverrides)
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} ≈ ${b}`)
test('real campus streetlights are stable, bounded, follow slopes and preserve source geometry',()=> {
  const before=JSON.stringify({roads:twin.roads,buildings:twin.buildings,trees:twin.trees})
  assert.deepEqual(generateCampusLamps(twin),twin.lamps)
  assert.ok(twin.lamps.length>80&&twin.lamps.length<=STREETLIGHT_LIMIT)
  assert.equal(new Set(twin.lamps.map(l=>l.id)).size,twin.lamps.length)
  for(const lamp of twin.lamps) {
    assert.ok(pointInCampus(lamp,twin.boundary));close(lamp.y,terrainHeightAt(twin.terrain,lamp.x,lamp.z))
    assert.ok(Object.values(lampHead(lamp)).every(Number.isFinite))
    assert.equal(inCanalOpening(lamp,twin.canal,1.2),false)
    for(let i=1;i<twin.theatre.access.length;i++)assert.ok(distanceToSegment(lamp,twin.theatre.access[i-1],twin.theatre.access[i])>=2)
    assert.ok(twin.trees.every(t=>Math.hypot(lamp.x-t.x,lamp.z-t.z)>=2.5*t.scale))
    for(const road of twin.roads)for(const path of road.paths)for(let i=1;i<path.length;i++)assert.ok(distanceToSegment(lamp,path[i-1],path[i])>=road.width/2+.65)
  }
  assert.ok(twin.lamps.some(l=>l.y>8),'fixtures follow the upper terrace')
  assert.equal(JSON.stringify({roads:twin.roads,buildings:twin.buildings,trees:twin.trees}),before)
})
test('four floodlight masts remain outside the playable pitch and lamp bases keep clearance',()=> {
  const flood=twin.lamps.filter(l=>l.kind==='flood');assert.equal(flood.length,4)
  const sports=twin.locations.find(l=>l.id==='sports-ground'),rotation=(sports.rotationDegrees??0)*Math.PI/180
  for(const lamp of flood) {
    const x=lamp.x-sports.coordinates.x,z=lamp.z-sports.coordinates.z
    close(Math.abs(Math.cos(rotation)*x-Math.sin(rotation)*z),48)
    close(Math.abs(Math.sin(rotation)*x+Math.cos(rotation)*z),29)
  }
  for(const [i,lamp] of twin.lamps.entries())for(const other of twin.lamps.slice(i+1))assert.ok(Math.hypot(lamp.x-other.x,lamp.z-other.z)>=10)
})
test('nearby real lights obey a fixed budget and turn off far from the campus',()=> {
  const p=lampHead(twin.lamps[10]),nearby=nearestCampusLamps(twin.lamps,p)
  assert.ok(nearby.length>0&&nearby.length<=NIGHT_LIGHT_BUDGET)
  assert.equal(nearby[0].id,twin.lamps[10].id)
  assert.ok(nearestCampusLamps(twin.lamps,p,1000).length<=NIGHT_LIGHT_BUDGET)
  assert.equal(nearestCampusLamps(twin.lamps,p,2).length,2)
  assert.deepEqual(nearestCampusLamps(twin.lamps,{x:10000,y:500,z:10000}),[])
})
test('lamp sampling accumulates arc length across short road segments and skips obstructions',()=> {
  const terrain={size:400,segments:2,heights:new Float32Array(9),colors:new Float32Array(27)}
  const campus={roads:[{id:'road',kind:'road',width:6,paths:[Array.from({length:21},(_,i)=>({x:-90+i*9,z:0}))]}],buildings:[],trees:[],boundary:[{x:-100,z:-100},{x:100,z:-100},{x:100,z:100},{x:-100,z:100}],terrain,locations:[]}
  const lamps=generateCampusLamps(campus);assert.ok(lamps.length>=7)
  for(const lamp of lamps)close(Math.abs(lamp.z),4.2)
  for(let i=1;i<lamps.length;i++)close(lamps[i].target.x-lamps[i-1].target.x,24)
  const blocked={...campus,trees:lamps.map(l=>({...l,scale:1,palm:false}))}
  const fallback=generateCampusLamps(blocked)
  assert.ok(fallback.length>0);assert.ok(fallback.every(l=>blocked.trees.every(t=>Math.hypot(l.x-t.x,l.z-t.z)>=2.5)))
  assert.deepEqual(generateCampusLamps({...campus,boundary:[]}),[])
})
test('streetlight poles are solid during jumping and shorten the camera before clipping',()=> {
  const terrain={size:400,segments:2,heights:new Float32Array(9),colors:new Float32Array(27)},lamp={id:'pole',x:0,y:0,z:0,height:6.2,angle:0,kind:'street',target:{x:0,z:2}}
  const world=createWalkWorld([],[],terrain,[],[lamp])
  assert.equal(isWalkable({x:0,z:0},world),false)
  assert.equal(isWalkable({x:.3,z:0},world,.42,.69),false)
  const next=stepWalking({x:-.7,z:0},{x:1,z:0},8,.1,world,.69);assert.ok(next.x<=-.6)
  assert.ok(cameraBoomFraction({x:-2,y:2,z:0},{x:2,y:2,z:0},world)<1)
  assert.equal(cameraBoomFraction({x:-2,y:10,z:0},{x:2,y:10,z:0},world),1)
  const actual=createWalkWorld(twin.buildings,twin.boundary,twin.terrain,twin.trees,twin.lamps)
  assert.ok(twin.lamps.every(l=>!isWalkable(l,actual)))
})
