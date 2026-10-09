import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { WebSocket } from 'ws'
import { attachCampusServer } from '../server/campusServer.ts'
import { CAMPUS_CAPACITY, parseCampusSnapshot } from '../src/lib/campusProtocol.ts'
import { chooseCrowd } from '../src/lib/crowdRendering.ts'
import { liveRetryDelay } from '../src/lib/liveRecovery.ts'
import { advanceVehicle, applyBuggyImpact, freshVehicle } from '../src/lib/vehicles.ts'
import { createWalkWorld } from '../src/lib/walking.ts'

const pose = extra => ({ x: 0, y: 0, z: 0, yaw: 0, epoch: 1, vehicle: 'walk', moving: false, running: false, active: true, visible: true, space: 'outdoors', ...extra })
const waitFor = async predicate => { const end = Date.now() + 10000; while (Date.now() < end) { const result = predicate(); if (result) return result; await new Promise(r => setTimeout(r, 15)) }; throw new Error('Multiplayer state did not arrive') }
async function fixture(t) {
  const http = createServer(), peers = []
  const boundary = [{x:-200,z:-200},{x:200,z:-200},{x:200,z:200},{x:-200,z:200},{x:-200,z:-200}]
  const campus = attachCampusServer(http, undefined, async id => {
    await new Promise(resolve => setTimeout(resolve, 30))
    return {id,name:id,role:'member',expiresAt:Date.now()+60000}
  }, boundary, [])
  http.listen(0,'127.0.0.1'); await once(http,'listening')
  const origin = `http://127.0.0.1:${http.address().port}`
  const peer = id => {
    const ws = new WebSocket(origin.replace('http:','ws:')+'/presence',{origin}), messages = [], arrival = []
    ws.on('error',()=>{}); ws.on('open',()=>ws.send(JSON.stringify({type:'authenticate',token:id})))
    ws.on('message',bytes=>{const message=JSON.parse(bytes.toString());messages.push(message);if(messages.length>100)messages.shift();if(message.type==='campus-state')arrival.push(Date.now())})
    const p={ws,messages,arrival};peers.push(p);return p
  }
  t.after(async()=>{for(const p of peers)p.ws.terminate();campus.close();await new Promise(resolve=>http.close(resolve))})
  return {campus,peer}
}

test('full campus can join simultaneously, share movement, queue and promote without missing identities',async t=>{
  const {campus,peer}=await fixture(t)
  const peers=Array.from({length:CAMPUS_CAPACITY},(_,i)=>peer(`visitor_${i}`))
  await waitFor(()=>peers.every(p=>p.messages.some(m=>m.type==='campus-welcome')))
  assert.deepEqual(peers.map(p=>p.messages.find(m=>m.type==='campus-welcome').spawnSlot).sort((a,b)=>a-b),Array.from({length:32},(_,i)=>i))
  for(let i=0;i<peers.length;i++)peers[i].ws.send(JSON.stringify({type:'pose',activity:'walk',pose:pose({x:i*2})}))
  await waitFor(()=>peers.every(p=>p.messages.some(m=>m.type==='campus-state'&&m.people.length===32&&m.people.every(p=>p.pose?.visible))))
  let tick=0
  const timer=setInterval(()=>{tick++;for(let i=0;i<peers.length;i++)if(peers[i].ws.readyState===WebSocket.OPEN)peers[i].ws.send(JSON.stringify({type:'pose',activity:'walk',pose:pose({x:i*2+tick*.1})}))},100)
  t.after(()=>clearInterval(timer))
  await new Promise(resolve=>setTimeout(resolve,1600));clearInterval(timer)
  const snapshots=peers.map(p=>p.messages.filter(m=>m.type==='campus-state').at(-1))
  assert.ok(snapshots.every(s=>parseCampusSnapshot(s)&&s.people.length===32&&s.people.every(p=>p.pose?.visible&&p.pose.x>Number(p.id.split('_')[1])*2)))
  assert.equal(campus.access.snapshot().occupancy,32)
  assert.ok(peers.every(p=>!p.messages.some(m=>m.type==='error'||m.type==='pose-correction')))
  const queued=peer('queued');await waitFor(()=>queued.messages.some(m=>m.type==='waiting'))
  peers[0].ws.close();await waitFor(()=>queued.messages.some(m=>m.type==='campus-welcome'))
  assert.equal(queued.messages.find(m=>m.type==='campus-welcome').spawnSlot,0,'departed visitors release their spawn reservation')
  assert.equal(campus.access.snapshot().occupancy,32)
  const intervals=peers.slice(1).flatMap(p=>p.arrival.slice(1).map((time,i)=>time-p.arrival[i])).sort((a,b)=>a-b)
  t.diagnostic(`32 simultaneous authenticated test clients; snapshot interval p95 ${intervals[Math.floor(intervals.length*.95)]} ms`)
})

test('two peers recover rejected movement without weakening server movement bounds',async t=>{
  const {peer}=await fixture(t),alice=peer('alice'),bob=peer('bob')
  await waitFor(()=>[alice,bob].every(p=>p.messages.some(m=>m.type==='campus-welcome')))
  for(const p of [alice,bob])p.ws.send(JSON.stringify({type:'pose',activity:'walk',pose:pose()}))
  await waitFor(()=>bob.messages.some(m=>m.type==='campus-state'&&m.people.every(p=>p.pose)))
  alice.ws.send(JSON.stringify({type:'pose',activity:'walk',pose:pose({x:100})}))
  const correction=await waitFor(()=>alice.messages.find(m=>m.type==='pose-correction'))
  assert.equal(correction.pose.x,0);assert.equal(correction.pose.epoch,1)
  assert.ok(!bob.messages.some(m=>m.type==='pose-correction'))
  assert.ok(!bob.messages.some(m=>m.type==='campus-state'&&m.people.some(p=>p.pose?.x===100)))
  await new Promise(resolve=>setTimeout(resolve,100))
  alice.ws.send(JSON.stringify({type:'pose',activity:'walk',pose:{...correction.pose,x:.2}}))
  await waitFor(()=>bob.messages.some(m=>m.type==='campus-state'&&m.people.some(p=>p.id==='alice'&&p.pose?.x===.2&&p.pose.visible)))
})

test('bunched full-speed updates never send a stop/reset correction and observers catch up',async t=>{
  const {peer}=await fixture(t),observer=peer('observer')
  const drivers=[['walker', 'walk', 5],['cyclist','bicycle',7],['buggy_driver','buggy',9]].map(([id,vehicle,speed])=>({...peer(id),id,vehicle,speed}))
  await waitFor(()=>[observer,...drivers].every(p=>p.messages.some(m=>m.type==='campus-welcome')))
  for(const p of drivers)p.ws.send(JSON.stringify({type:'pose',activity:'walk',pose:pose({vehicle:p.vehicle})}))
  await waitFor(()=>observer.messages.some(m=>m.type==='campus-state'&&m.people.filter(p=>p.id!=='observer').every(p=>p.pose)))
  // Six normal 100 ms samples arrive together after a transport stall.
  await new Promise(resolve=>setTimeout(resolve,600))
  for(const p of drivers)for(let sample=1;sample<=6;sample++)p.ws.send(JSON.stringify({type:'pose',activity:'walk',pose:pose({vehicle:p.vehicle,x:p.speed*sample/10})}))
  await new Promise(resolve=>setTimeout(resolve,100))
  for(const p of drivers)p.ws.send(JSON.stringify({type:'pose',activity:'walk',pose:pose({vehicle:p.vehicle,x:p.speed*7/10})}))
  await waitFor(()=>observer.messages.some(m=>m.type==='campus-state'&&drivers.every(d=>m.people.find(p=>p.id===d.id)?.pose?.x===d.speed*7/10)))
  assert.ok(drivers.every(p=>!p.messages.some(m=>m.type==='pose-correction')),'valid timing jitter cannot reset local momentum')
})

test('two live drivers share an impact once, passengers follow recoil, and valid recovery never sends a speed reset',async t=>{
  const {peer}=await fixture(t),a=peer('rammer'),b=peer('parked'),rider=peer('passenger'),observer=peer('observer')
  await waitFor(()=>[a,b,rider,observer].every(p=>p.messages.some(m=>m.type==='campus-welcome')))
  a.ws.send(JSON.stringify({type:'pose',activity:'walk',pose:pose({vehicle:'buggy',z:5})}))
  b.ws.send(JSON.stringify({type:'pose',activity:'walk',pose:pose({vehicle:'buggy'})}))
  rider.ws.send(JSON.stringify({type:'pose',activity:'walk',pose:pose({x:1})}))
  await waitFor(()=>observer.messages.some(m=>m.type==='campus-state'&&m.people.filter(p=>p.id!=='observer').every(p=>p.pose)))
  rider.ws.send(JSON.stringify({type:'buggy-ride',driverId:'parked'}))
  await waitFor(()=>rider.messages.some(m=>m.type==='buggy-result'&&m.ok))
  for(const z of [4.1,3.2]) {
    await new Promise(r=>setTimeout(r,100))
    b.ws.send(JSON.stringify({type:'pose',activity:'walk',pose:pose({vehicle:'buggy'})}))
    a.ws.send(JSON.stringify({type:'pose',activity:'walk',pose:pose({vehicle:'buggy',z})}))
  }
  const hitA=await waitFor(()=>a.messages.find(m=>m.type==='buggy-impact'))
  const hitB=await waitFor(()=>b.messages.find(m=>m.type==='buggy-impact'))
  assert.equal(hitA.impact.sequence,hitB.impact.sequence)
  assert.ok(hitB.impact.velocity.z<0)
  // A pre-impact packet arrives late, after the authority has resolved contact.
  a.ws.send(JSON.stringify({type:'pose',activity:'walk',pose:pose({vehicle:'buggy',z:2.3})}))
  const flat={size:400,segments:40,heights:new Float32Array(41**2),colors:new Float32Array(41**2*3)}
  const world=createWalkWorld([],[{x:-200,z:-200},{x:200,z:-200},{x:200,z:200},{x:-200,z:200},{x:-200,z:-200}],flat)
  const drivers=[[a,hitA],[b,hitB]].map(([peer,event])=>{
    const state=freshVehicle(event.impact.anchor.yaw);applyBuggyImpact(state,event.impact)
    return {peer,state,impact:event.impact,p:{x:event.impact.anchor.x,z:event.impact.anchor.z}}
  })
  for(let tick=0;tick<10;tick++) {
    await new Promise(r=>setTimeout(r,100))
    for(const d of drivers) {
      d.p=advanceVehicle(d.state,d.p,'buggy',1,.15,false,.1,world,[]).point
      d.peer.ws.send(JSON.stringify({type:'pose',activity:'walk',pose:pose({...d.p,vehicle:'buggy',yaw:d.state.yaw,impactAck:d.impact.sequence})}))
    }
  }
  const snapshot=await waitFor(()=>observer.messages.findLast(m=>m.type==='campus-state'&&m.people.find(p=>p.id==='parked')?.pose?.z<-2))
  assert.ok(parseCampusSnapshot(snapshot))
  const passenger=snapshot.people.find(p=>p.id==='passenger'),driver=snapshot.people.find(p=>p.id==='parked')
  assert.equal(passenger.ride.driverId,'parked')
  assert.ok(Math.hypot(passenger.pose.x-driver.pose.x,passenger.pose.z-driver.pose.z)<1)
  assert.equal(a.messages.filter(m=>m.type==='buggy-impact').length,1)
  assert.equal(b.messages.filter(m=>m.type==='buggy-impact').length,1)
  assert.ok([a,b].every(p=>!p.messages.some(m=>m.type==='pose-correction')))
})

test('crowd detail has a strict budget, keeps close friends detailed and excludes other floors and hidden people',()=>{
  const people=Array.from({length:32},(_,i)=>({id:`p${String(i).padStart(2,'0')}`,name:'Person',handle:null,color:'teal',activity:'walk',pose:pose({x:i*2})}))
  people[3].pose.space='gyan:1';people[4].pose.visible=false
  const selected=chooseCrowd(people,{x:0,y:2,z:0},'outdoors',true,['p00'],'smooth')
  assert.equal(selected.filter(p=>p.detailed).length,6)
  assert.ok(selected.find(p=>p.id==='p01').detailed)
  assert.ok(!selected.some(p=>['p00','p03','p04'].includes(p.id)))
  assert.ok(selected.some(p=>!p.detailed&&!p.label))
  assert.equal(chooseCrowd(people,{x:0,y:2,z:0},'gyan:1',true,[],'balanced').length,1)
  assert.equal(chooseCrowd(people,{x:1000,y:2,z:0},'outdoors',true,[],'detailed').length,0)
  assert.equal(chooseCrowd(people,{x:0,y:300,z:0},'outdoors',false,[],'detailed').filter(p=>p.detailed).length,0)
})

test('transport recovery retries are bounded and never repeat access denial or moderation',()=>{
  for(const code of [1001,1006,1011,1012,1013,4000]) {
    const delays=Array.from({length:6},(_,attempt)=>liveRetryDelay(code,attempt,0))
    assert.deepEqual(delays,[1000,2000,4000,8000,15000,15000]);assert.equal(liveRetryDelay(code,6),null)
    assert.equal(liveRetryDelay(code,0,1),1500)
  }
  for(const code of [1000,1008,4401,4403,4408])assert.equal(liveRetryDelay(code,0),null)
})
