import { randomUUID } from 'node:crypto'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createServer } from 'node:http'
import { once } from 'node:events'
import WebSocket from 'ws'
import { createFootballState, footballPitch, footballToWorld, footballToLocal, kickFootball, stepFootball, resetFootball, footballStatus } from '../src/lib/football.ts'
import { parseFootballSnapshot } from '../src/lib/footballProtocol.ts'
import { createFootballRoom } from '../server/footballRoom.ts'
import { attachFootballServer } from '../server/footballServer.ts'
const pitch = { center:{x:0,z:0}, rotation:0, elevation:0 }
const actor = { position:{x:-1,z:0},direction:{x:1,z:0},active:true,moving:false,running:true }

test('football follows the relocated and rotated Sports Ground and accepts only nearby active kicks', () => {
  const rotated = footballPitch({coordinates:{x:-120.84,z:-380.6},rotationDegrees:90,elevation:3})
  const world = footballToWorld({x:12,z:3},rotated), local = footballToLocal(world,rotated)
  assert.ok(Math.abs(local.x-12)<1e-8 && Math.abs(local.z-3)<1e-8)
  const ball=createFootballState()
  for(const invalid of [null,{...actor,active:false},{...actor,position:{x:-3,z:0}},{...actor,direction:{x:NaN,z:0}}])assert.equal(kickFootball(ball,invalid,pitch),false)
  assert.equal(kickFootball(ball,actor,pitch),true);assert.equal(kickFootball(ball,actor,pitch),false,'cooldown prevents repeat kick spam')
  assert.equal(ball.vx,30)
  const old={...ball};stepFootball(ball,NaN);assert.deepEqual(ball,old)
})

test('fast goal shots score once, restart at center, and shots outside the mouth go out of play', () => {
  const ball=createFootballState();Object.assign(ball,{x:41.8,vx:30,event:'playing'})
  stepFootball(ball,.1);assert.equal(ball.blue,1);assert.equal(ball.event,'blue-goal')
  for(let i=0;i<60;i++)stepFootball(ball,.05)
  assert.equal(ball.blue,1);assert.equal(ball.x,0);assert.equal(ball.vx,0)
  Object.assign(ball,{x:-41.8,vx:-30});stepFootball(ball,.1);assert.equal(ball.gold,1)
  resetFootball(ball);Object.assign(ball,{x:41.8,z:8,vx:30});stepFootball(ball,.1)
  assert.equal(ball.event,'out');assert.equal(ball.blue,1);assert.equal(ball.gold,1)
  resetFootball(ball,true);assert.equal(ball.blue+ball.gold,0)
})

test('post collisions, touchline exits, drag and stalled frames stay bounded', () => {
  const ball=createFootballState();Object.assign(ball,{x:41.4,z:3.6,vx:22});stepFootball(ball,.05)
  assert.ok(ball.vx<0,'goal post rebounds the ball');assert.equal(ball.blue,0)
  resetFootball(ball);ball.vz=30;for(let i=0;i<30;i++)stepFootball(ball,.05)
  assert.equal(ball.event,'out');assert.ok(ball.z<22.5)
  resetFootball(ball);ball.vx=22;stepFootball(ball,100);assert.ok(ball.x<=2.2)
  const before=ball.vx;stepFootball(ball,.1);assert.ok(ball.vx<before)
  assert.equal(footballStatus(ball,{...actor,active:false},pitch).canKick,false)
})

test('server rejects forged ball state, teleports, malformed directions and inactive players; teams and cleanup are stable', () => {
  const room=createFootballRoom();const a=room.add('a',1000),b=room.add('b',1000)
  assert.equal(a.team,'blue');assert.equal(b.team,'gold')
  assert.equal(room.handle('a',{type:'pose',x:40,z:0,dx:1,dz:0,active:true,running:true},1500),false)
  assert.equal(room.handle('a',{type:'state',ball:{blue:900}},1500),false)
  assert.equal(room.handle('a',{type:'pose',x:-1,z:0,dx:NaN,dz:0,active:true,running:true},1550),false)
  assert.equal(room.handle('a',{type:'pose',x:-1,z:0,dx:1,dz:0,active:true,running:true},1600),true)
  assert.equal(room.handle('a',{type:'kick'},1601),true)
  const state=room.snapshot();assert.ok(parseFootballSnapshot(state));assert.equal(state.ball.vx,30)
  room.tick(.05,2200);assert.equal(room.snapshot().players[0].active,false)
  assert.equal(room.handle('a',{type:'kick'},2201),false)
  assert.equal(parseFootballSnapshot({...state,ball:{...state.ball,vx:Infinity}}),null)
  room.remove('b');assert.equal(room.snapshot().players.length,1)
  for(let i=0;i<30;i++)room.add(`player-${i}`,3000)
  assert.equal(room.snapshot().players.length,24);assert.equal(room.add('extra'),null)
})

const waitFor = async (condition, timeout=6000) => {const end=Date.now()+timeout;while(Date.now()<end){const value=condition();if(value)return value;await new Promise(resolve=>setTimeout(resolve,20))}throw new Error('Timed out waiting for multiplayer state')}
test('two WebSocket visitors see one ball, shared goals, player movement and departure', async () => {
  const http=createServer((_req,res)=>res.end('football'))
  const game=attachFootballServer(http, undefined, async token=>({id:token,name:'Test member',role:'member',expiresAt:Date.now()+3600000}))
  http.listen(0,'127.0.0.1');await once(http,'listening')
  const url=`http://127.0.0.1:${http.address().port}`
  const peer=()=>{const ws=new WebSocket(url.replace('http:','ws:')+'/football',{origin:url}), messages=[];ws.on('open',()=>ws.send(JSON.stringify({type:'authenticate',token:randomUUID()})));ws.on('message',data=>messages.push(JSON.parse(data.toString())));return{ws,messages}}
  const a=peer(),b=peer()
  try{
    await waitFor(()=>a.messages.find(m=>m.type==='welcome') && b.messages.find(m=>m.type==='welcome'))
    await waitFor(()=>a.messages.some(m=>m.type==='state'&&m.players.length===2) && b.messages.some(m=>m.type==='state'&&m.players.length===2))
    await new Promise(resolve=>setTimeout(resolve,550))
    a.ws.send(JSON.stringify({type:'pose',x:-1,z:0,dx:1,dz:0,active:true,running:true}))
    await waitFor(()=>a.messages.some(m=>m.type==='state'&&m.players.some(p=>p.id===a.messages.find(m=>m.type==='welcome').id&&p.x===-1)))
    a.ws.send(JSON.stringify({type:'kick'}))
    await waitFor(()=>b.messages.some(m=>m.type==='state'&&m.ball.vx>20))
    const goal=await waitFor(()=>b.messages.find(m=>m.type==='state'&&m.ball.blue===1))
    await waitFor(()=>a.messages.some(m=>m.type==='state'&&m.ball.blue===1))
    assert.equal(goal.ball.gold,0)
    b.ws.close();await waitFor(()=>a.messages.at(-1)?.type==='state'&&a.messages.at(-1).players.length===1)
    const rejected=new WebSocket(url.replace('http:','ws:')+'/football',{origin:'https://unrelated.example'})
    rejected.on('error',()=>undefined);const [request,response]=await once(rejected,'unexpected-response');assert.equal(response.statusCode,403);response.resume();request.destroy()
  } finally {a.ws.terminate();b.ws.terminate();game.close();await new Promise(resolve=>http.close(resolve))}
})
