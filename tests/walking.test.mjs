import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { localToGps } from '../src/lib/geo.ts'
import { terrainHeightAt, generateTerrain } from '../src/lib/terrain.ts'
import { extractBuildingFootprints } from '../src/lib/buildings.ts'
import { extractCampusRoads } from '../src/lib/roads.ts'
import { createDigitalTwin } from '../src/lib/digitalTwin.ts'
import { savedCampusOverrides } from '../src/data/campusOverrides.ts'
import { createWalkWorld, isWalkable, stepWalking, treeCeilingAt, findWalkSpawn, findSharedSpawn, nearestWalkLocation, placeDistance, cameraBoomFraction, explorerViewFromURL, withExplorerView, emptyWalkInput } from '../src/lib/walking.ts'
const ring = (x1,z1,x2,z2) => [{x:x1,z:z1},{x:x2,z:z1},{x:x2,z:z2},{x:x1,z:z2},{x:x1,z:z1}]
const flat = { size:400, segments:40, heights:new Float32Array(41**2), colors:new Float32Array(41**2*3) }
const building = (outer, holes=[]) => ({id:'way/1',osmType:'way',osmId:1,tags:{},outer:outer.map(localToGps),holes:holes.map(h=>h.map(localToGps)),height:10})
const world = createWalkWorld([building(ring(0,-10,10,10))],ring(-100,-100,100,100),flat)
const close = (a,b) => assert.ok(Math.abs(a-b)<1e-6, `${a} ≈ ${b}`)
test('view URLs preserve night, routes, deployment paths and hashes', () => {
  const url='/campus/?mode=night&from=main-entrance&to=canteen#place'
  const walk=withExplorerView(url,'walk'); assert.equal(explorerViewFromURL(walk),'walk')
  assert.equal(withExplorerView(walk,'overview'),url)
  assert.equal(explorerViewFromURL('/?view=invalid'),'overview')
  assert.deepEqual(emptyWalkInput(),{forward:0,side:0,turn:0,running:false})
})
test('avatar clearance respects building solids, courtyard holes and campus edges', () => {
  assert.equal(isWalkable({x:5,z:0},world),false)
  assert.equal(isWalkable({x:-.2,z:0},world),false)
  assert.equal(isWalkable({x:-1,z:0},world),true)
  assert.equal(isWalkable({x:99.8,z:0},world),false)
  assert.equal(isWalkable({x:101,z:0},world),false)
  assert.equal(isWalkable({x:NaN,z:0},world),false)
  const courtyard=createWalkWorld([building(ring(-20,-20,20,20),[ring(-10,-10,10,10)])],world.boundary,flat)
  assert.equal(isWalkable({x:0,z:0},courtyard),true)
  assert.equal(isWalkable({x:9.8,z:0},courtyard),false)
  assert.equal(isWalkable({x:15,z:0},courtyard),false)
})
test('diagonal motion is normalized and frame stalls cannot cause teleportation', () => {
  const start={x:-50,z:-50}
  for (const direction of [{x:1,z:0},{x:1,z:1}]) {
    const next=stepWalking(start,direction,5,.1,world); close(Math.hypot(next.x-start.x,next.z-start.z),.5)
    assert.deepEqual(stepWalking(start,direction,5,10,world),next)
  }
  assert.deepEqual(stepWalking(start,{x:0,z:0},5,.1,world),start)
  assert.deepEqual(stepWalking(start,{x:Infinity,z:0},5,.1,world),start)
  assert.deepEqual(stepWalking(start,{x:1,z:0},NaN,.1,world),start)
})
test('swept steps block thin walls and slide along their edges', () => {
  const thin=createWalkWorld([building(ring(0,-10,.05,10))],world.boundary,flat)
  const straight=stepWalking({x:-.6,z:0},{x:1,z:0},8,.1,thin)
  assert.ok(straight.x<-.42); assert.ok(isWalkable(straight,thin))
  const slide=stepWalking({x:-.5,z:0},{x:1,z:1},8,.1,thin)
  assert.ok(slide.x<-.42); assert.ok(slide.z>.4); assert.ok(isWalkable(slide,thin))
  const edge=stepWalking({x:99.5,z:0},{x:1,z:0},8,.1,world); assert.ok(edge.x<99.58)
})
test('spawn searches for legal outdoor positions without altering anchors or geometry', () => {
  const anchor={x:5,z:0}, source=JSON.stringify(world.buildings)
  const spawn=findWalkSpawn(anchor,world)
  assert.ok(spawn); assert.ok(isWalkable(spawn,world)); assert.ok(Math.hypot(spawn.x-5,spawn.z)<=8)
  assert.deepEqual(findWalkSpawn(anchor,world),spawn); assert.deepEqual(anchor,{x:5,z:0}); assert.equal(JSON.stringify(world.buildings),source)
  assert.equal(findWalkSpawn({x:1000,z:1000},world),null)
})
test('nearby inspection measures the footprint edge and excludes unnamed buildings', () => {
  const named={id:'library',name:'Library',osmBuildingId:'way/1',coordinates:{x:5,z:0}}
  close(placeDistance({x:-2,z:0},named,world),2)
  assert.equal(nearestWalkLocation({x:-2,z:0},[{id:'unknown',name:'Unnamed campus building',coordinates:{x:-2,z:0}},named],world).id,'library')
  assert.equal(nearestWalkLocation({x:0,z:0},[],world),null)
})
test('follow camera boom is shortened at buildings and terrain but can see over roofs', () => {
  assert.equal(cameraBoomFraction({x:-10,y:3,z:0},{x:-5,y:4,z:0},world),1)
  assert.ok(cameraBoomFraction({x:-5,y:3,z:0},{x:5,y:4,z:0},world)<.5)
  assert.equal(cameraBoomFraction({x:-5,y:20,z:0},{x:5,y:20,z:0},world),1)
  assert.ok(cameraBoomFraction({x:-10,y:2,z:0},{x:-10,y:-2,z:10},world)<1)
})
test('walking follows the 8 meter terrace slope and rejects cliffs', () => {
  const slope={lower:{x:0,z:0,halfX:20,halfZ:15},upper:{x:120,z:0,halfX:8,halfZ:8},rise:8}
  const terrain=generateTerrain(400,{boundary:[],buildings:[],roads:[],clearings:[slope.lower,slope.upper],slope},160)
  const sloped=createWalkWorld([],[],terrain); let p={x:0,z:0}
  for(let i=0;i<240;i++) p=stepWalking(p,{x:1,z:0},5,.1,sloped)
  close(p.x,120); close(terrainHeightAt(terrain,p.x,p.z),8)
  const cliff={...flat,heights:Float32Array.from({length:41**2},(_,i)=>(i%41)*30)}
  const stopped=stepWalking({x:0,z:0},{x:1,z:0},5,.1,createWalkWorld([],[],cliff)); close(stopped.x,0)
})
const elements=JSON.parse(readFileSync(new URL('./fixtures/nit-goa-campus.json',import.meta.url))).elements
const roads=JSON.parse(readFileSync(new URL('./fixtures/nit-goa-roads.json',import.meta.url))).elements
const boundary=roads.find(e=>e.id===1259742369).geometry
const map={buildings:extractBuildingFootprints(elements),boundary,source:'campus-area',returnedBuildingCount:22}
const roadData={roads:extractCampusRoads(roads,boundary),boundary,source:'campus-area',returnedRoadCount:20}
const twin=createDigitalTwin(map,roadData,true,savedCampusOverrides)
const actual=createWalkWorld(twin.buildings,twin.boundary,twin.terrain,twin.trees)
test('all corrected campus landmarks have safe spawn positions on the real OSM campus', () => {
  const locations=[...twin.locations,...twin.selections.filter(s=>s.matchMethod==='unmatched').map(s=>s.location)]
  for(const location of locations.filter(l=>l.name!=='Unnamed campus building')) {
    const spawn=findWalkSpawn(location.coordinates,actual)
    assert.ok(spawn,location.name); assert.ok(isWalkable(spawn,actual),location.name)
    assert.ok(Math.hypot(spawn.x-location.coordinates.x,spawn.z-location.coordinates.z)<100,location.name)
  }
  const sports=twin.locations.find(l=>l.id==='sports-ground'), cafe=twin.upperLocation
  const lower=findWalkSpawn(sports.coordinates,actual), upper=findWalkSpawn(cafe.coordinates,actual)
  close(terrainHeightAt(actual.terrain,lower.x,lower.z),0)
  assert.ok(terrainHeightAt(actual.terrain,upper.x,upper.z)>7)
})

test('simultaneous visitors get distinct, legal spawn spots at the real Main Entrance', () => {
  const entrance = twin.locations.find(location => location.id === 'main-entrance')
  const anchor = findWalkSpawn(entrance.coordinates, actual), occupied = []
  assert.ok(anchor)
  for (let slot = 0; slot < 32; slot++) {
    const next = findSharedSpawn(anchor, actual, slot, occupied)
    assert.ok(isWalkable(next, actual), `visitor ${slot} stays outside solids and the canal`)
    assert.ok(occupied.every(other => Math.hypot(next.x - other.x, next.z - other.z) >= 1.5), `visitor ${slot} remains visible beside earlier arrivals`)
    assert.ok(Math.hypot(next.x - anchor.x, next.z - anchor.z) <= 36)
    assert.deepEqual(findSharedSpawn(anchor, actual, slot, []), next, 'reservation also works before other visitors publish their first pose')
    occupied.push(next)
  }
})

const tree=(extra={})=>({x:0,y:0,z:0,scale:1,rotation:0,palm:false,shade:0,...extra})
test('rendered tree trunks stay solid on the ground and during a jump, including leaned palms',()=> {
  for(const palm of [false,true]) {
    const wooded=createWalkWorld([],world.boundary,flat,[tree({palm})])
    assert.equal(isWalkable({x:.6,z:0},wooded),false)
    assert.equal(isWalkable({x:.6,z:0},wooded,.42,.65),false)
    for(const y of [0,.65]) {
      const next=stepWalking({x:-1.1,z:0},{x:1,z:0},8,.1,wooded,y)
      assert.ok(next.x<-.85);assert.ok(isWalkable(next,wooded,.42,y))
    }
    const spawn=findWalkSpawn({x:0,z:0},wooded);assert.ok(spawn);assert.ok(isWalkable(spawn,wooded,3))
  }
})
test('tree colliders work across negative bucket boundaries and permit sliding around trunks',()=> {
  const wooded=createWalkWorld([],world.boundary,flat,[tree({x:-8,z:-8})])
  assert.equal(isWalkable({x:-7.5,z:-8},wooded),false)
  const start={x:-9,z:-8},next=stepWalking(start,{x:1,z:1},8,.1,wooded,.4)
  assert.ok(next.z>start.z+.2);assert.ok(isWalkable(next,wooded,.42,.4))
})
test('low foliage permits ground walking but caps airborne headroom; cameras can see above crowns',()=> {
  const wooded=createWalkWorld([],world.boundary,flat,[tree({scale:.8})]),p={x:.9,z:0}
  assert.equal(isWalkable(p,wooded),true)
  assert.equal(isWalkable(p,wooded,.42,.65),false)
  assert.ok(treeCeilingAt(p,wooded)<2.76)
  assert.ok(cameraBoomFraction({x:-3,y:3,z:0},{x:3,y:3,z:0},wooded)<1)
  assert.ok(cameraBoomFraction({x:-3,y:1,z:0},{x:3,y:1,z:0},wooded)<1)
  assert.equal(cameraBoomFraction({x:-3,y:10,z:0},{x:3,y:10,z:0},wooded),1)
})
test('airborne sweeps cannot bypass thin building walls',()=> {
  const thin=createWalkWorld([building(ring(0,-10,.05,10))],world.boundary,flat)
  const next=stepWalking({x:-.6,z:0},{x:1,z:0},8,.1,thin,.69)
  assert.ok(next.x<-.42)
})
test('every tree in the real campus has a solid trunk and all landmark spawns avoid vegetation',()=> {
  assert.ok(twin.trees.length>500)
  for(const tree of twin.trees) assert.equal(isWalkable(tree,actual),false)
})
