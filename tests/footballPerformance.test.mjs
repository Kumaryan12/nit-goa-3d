import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createFootballBallGeometry } from '../src/lib/footballBallGeometry.ts'
import { FOOTBALL_RADIUS } from '../src/lib/football.ts'
import { footballGraphicsProfile, footballTrees } from '../src/lib/footballRendering.ts'
import { GRAPHICS_PROFILES, MOBILE_RECOVERY_PROFILE, adaptGraphics, initialGraphics } from '../src/lib/graphics.ts'
import { cameraBoomFraction, createWalkWorld } from '../src/lib/walking.ts'
import { localToGps } from '../src/lib/geo.ts'

const terrain={size:1000,segments:10,heights:new Float32Array(121),colors:new Float32Array(363)}
const ring=(x,z,w)=>[{x:x-w,z:z-w},{x:x+w,z:z-w},{x:x+w,z:z+w},{x:x-w,z:z+w}]
const building=(outer,holes=[])=>({id:'test-building',height:15,outer:outer.map(localToGps),holes:holes.map(h=>h.map(localToGps))})

test('automatic football graphics reserve headroom, preserve recovery and restore campus/detailed modes',()=>{
  for(const base of [...GRAPHICS_PROFILES,MOBILE_RECOVERY_PROFILE]) {
    const limited=footballGraphicsProfile(base,true,'auto')
    assert.ok(limited.dpr<=1.15&&limited.shadowSize<=1024&&limited.shadowRate<=6)
    assert.ok(limited.dpr<=base.dpr&&limited.shadowSize<=base.shadowSize)
    assert.equal(footballGraphicsProfile(base,false,'auto'),base)
    assert.equal(footballGraphicsProfile(base,true,'detailed'),base)
  }
})

test('idle football cannot promote expensive graphics, but slow devices can still recover',()=>{
  let state=initialGraphics(false)
  for(let i=0;i<20;i++)state=adaptGraphics(state,60,2,false,1)
  assert.equal(state.level,1)
  state=adaptGraphics(state,20,2,false,1);state=adaptGraphics(state,20,2,false,1)
  assert.equal(state.level,0)
  let campus=initialGraphics(false)
  for(let i=0;i<6;i++)campus=adaptGraphics(campus,60,2,false)
  assert.equal(campus.level,2,'normal campus quality still upgrades')
})

test('football greenery includes the complete pitch and camera surroundings without changing source trees',()=>{
  const pitch={center:{x:-120,z:-380},rotation:Math.PI/2,elevation:0}
  const trees=[{x:-120,z:-380,scale:1},{x:-20,z:-380,scale:1},{x:500,z:300,scale:1}]
  const filtered=footballTrees(trees,pitch,true)
  assert.deepEqual(filtered,trees.slice(0,2));assert.equal(trees.length,3)
  assert.equal(footballTrees(trees,pitch,false),trees)
  assert.equal(footballTrees(trees,null,true),trees)
})

test('merged ball has one material surface, visible black patches and valid normals',()=>{
  const geometry=createFootballBallGeometry(),colors=geometry.getAttribute('color'),position=geometry.getAttribute('position'),normals=geometry.getAttribute('normal')
  assert.equal(geometry.groups.length,0);assert.equal(colors.count,position.count);assert.equal(normals.count,position.count)
  let dark=0,light=0
  for(let i=0;i<colors.count;i++){if(colors.getX(i)<.1)dark++;if(colors.getX(i)>.8)light++}
  assert.ok(dark>0&&light>0);assert.ok(geometry.boundingSphere.radius>=FOOTBALL_RADIUS)
  for(const value of position.array)assert.ok(Number.isFinite(value))
  geometry.dispose()
})

test('camera broad phase preserves large walls, open courtyard holes and negative-coordinate trunks',()=>{
  const wall=createWalkWorld([building(ring(0,0,30),[ring(0,0,10)])],[],terrain)
  const origin={x:0,y:2,z:0}
  assert.equal(cameraBoomFraction(origin,{x:5,y:4,z:0},wall),1)
  assert.ok(cameraBoomFraction(origin,{x:40,y:4,z:0},wall)<.3)
  const tree={x:-8.1,z:-.1,y:0,scale:1,rotation:0,palm:false,shade:0}
  const forest=createWalkWorld([],[],terrain,[tree])
  assert.ok(cameraBoomFraction({x:-12,y:1,z:-.1},{x:-4,y:2,z:-.1},forest)<1)
  assert.equal(cameraBoomFraction({x:-12,y:15,z:-.1},{x:-4,y:15,z:-.1},forest),1)
})

test('distant poles are filtered once per boom while near poles still stop the camera',()=>{
  let scans=0
  const distant=Array.from({length:500},()=>({get x(){scans++;return 400},z:400,y:0,height:10}))
  const world=createWalkWorld([],[],terrain,[],[...distant,{x:0,z:4,y:0,height:10}])
  assert.ok(cameraBoomFraction({x:0,y:1,z:0},{x:0,y:4,z:12},world)<.4)
  assert.ok(scans<=1000,`broad phase scanned ${scans} distant pole coordinates`)
})
