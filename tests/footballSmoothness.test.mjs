import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createFootballControls, createFootballState, dribbleFootball, kickFootball, requestFootballAction, stepFootball } from '../src/lib/football.ts'
import { chooseFootballCrowd, FootballMotionBuffer, FootballPoseProgress } from '../src/lib/footballMotion.ts'
import { parseFootballSnapshot } from '../src/lib/footballProtocol.ts'
import { createFootballRoom } from '../server/footballRoom.ts'
import { advanceLocomotion, freshLocomotion } from '../src/lib/avatarMotion.ts'
import { instantControlPress, WalkTouchInput } from '../src/lib/walkTouchInput.ts'
import { emptyWalkInput } from '../src/lib/walking.ts'
import { createServer } from 'node:http'
import { once } from 'node:events'
import WebSocket from 'ws'
import { attachFootballServer } from '../server/footballServer.ts'

const pitch={center:{x:0,z:0},rotation:0,elevation:0}
const actor={position:{x:-.9,z:0},direction:{x:1,z:0},moving:true,running:false,active:true,speed:2.5}
const snapshot=(sequence,time,ball)=>({type:'state',sequence,serverTime:time,ball:{...createFootballState(),...ball},players:[]})
const close=(a,b,tolerance=1e-6)=>assert.ok(Math.abs(a-b)<tolerance,`${a} differs from ${b}`)

test('ball renders intermediate frames across delayed packets and holds after bounded prediction',()=>{
  const buffer=new FootballMotionBuffer()
  buffer.push(snapshot(1,10000,{x:0,vx:10,event:'playing'}),0)
  buffer.push(snapshot(2,10050,{x:.5,vx:9.7,event:'playing'}),60)
  close(buffer.sample(100).x,.25)
  close(buffer.sample(125).x,.5)
  assert.ok(buffer.sample(160).x>.5)
  close(buffer.sample(500).x,buffer.sample(2000).x)
  assert.ok(buffer.sample(500).x<1.5)
  buffer.push(snapshot(1,10000,{x:30}),2001)
  assert.ok(buffer.sample(2001).x<1.5,'out-of-order packet cannot rewind the ball')
})

test('kickoff, goals, clock recovery and pitch edges never interpolate ghost travel',()=>{
  const buffer=new FootballMotionBuffer()
  buffer.push(snapshot(1,10000,{x:40,vx:30,event:'playing'}),0)
  assert.ok(buffer.sample(1000).x<=42.28)
  buffer.push(snapshot(2,10050,{x:43.2,vx:0,blue:1,event:'blue-goal',resetSeconds:2.5}),50)
  close(buffer.sample(50).x,43.2)
  buffer.push(snapshot(3,10100,{revision:1,blue:1}),100)
  close(buffer.sample(100).x,0)
  buffer.push(snapshot(4,14000,{x:10,revision:1}),4000)
  close(buffer.sample(4000).x,10)
})

test('passes are controlled, shots are stronger and fresh aim is server validated',()=>{
  const pass=createFootballState(),shot=createFootballState()
  assert.ok(kickFootball(pass,actor,pitch,'pass'));assert.ok(kickFootball(shot,actor,pitch,'shot'))
  assert.equal(pass.vx,11);assert.equal(shot.vx,22)
  const room=createFootballRoom();room.add('a',1000)
  assert.ok(room.handle('a',{type:'pose',sequence:1,x:-1,z:0,dx:1,dz:0,active:true,running:false},1100))
  assert.equal(room.handle('a',{type:'kick',mode:'power-999',dx:0,dz:1},1101),false)
  assert.equal(room.handle('a',{type:'kick',mode:'pass',dx:NaN,dz:1},1101),false)
  assert.ok(room.handle('a',{type:'kick',mode:'pass',dx:0,dz:1},1101))
  assert.equal(room.snapshot().ball.vz,11);assert.equal(room.snapshot().ball.vx,0)
  assert.equal(room.snapshot().players[0].kick,1)
  const running=createFootballRoom();running.add('runner',1000)
  running.handle('runner',{type:'pose',sequence:1,x:-1.4,z:0,dx:1,dz:0,active:true,running:false},1100)
  assert.equal(running.handle('runner',{type:'kick',running:'yes'},1101),false)
  assert.equal(running.handle('runner',{type:'kick',running:true,dx:NaN,dz:0},1101),false)
  assert.equal(running.snapshot().players[0].running,false,'malformed kicks do not mutate accepted movement')
  assert.ok(running.handle('runner',{type:'kick',running:true},1101))
  assert.equal(running.snapshot().ball.vx,30,'a fresh Run press affects the shot before the next pose tick')
})

test('a slightly early press fires on contact once, and expired presses never fire later',()=>{
  const prepare=()=>{const r=createFootballRoom();r.add('a',1000);r.handle('a',{type:'pose',sequence:1,x:-2.1,z:0,dx:1,dz:0,active:true,running:true},1200);return r}
  const room=prepare()
  assert.ok(room.handle('a',{type:'kick',mode:'shot'},1201));assert.equal(room.snapshot().ball.vx,0)
  room.handle('a',{type:'pose',sequence:2,x:-1.7,z:0,dx:1,dz:0,active:true,running:true},1300)
  room.tick(1/60,1301);assert.ok(room.snapshot().ball.vx>29);assert.equal(room.snapshot().players[0].kick,1)
  for(let n=0;n<12;n++)room.tick(1/60,1302+n)
  assert.equal(room.snapshot().players[0].kick,1)
  const expired=prepare();expired.handle('a',{type:'kick'},1201);expired.tick(1/60,1400)
  expired.handle('a',{type:'pose',sequence:2,x:-1.7,z:0,dx:1,dz:0,active:true,running:true},1401)
  expired.tick(1/60,1402);assert.equal(expired.snapshot().players[0].kick,0)
})

test('paused, departed or stale players lose buffered actions and cannot reset the match',()=>{
  const room=createFootballRoom();room.add('a',1000)
  room.handle('a',{type:'pose',sequence:1,x:-2,z:0,dx:1,dz:0,active:true,running:false},1200)
  room.handle('a',{type:'kick'},1201)
  room.handle('a',{type:'pose',sequence:2,x:-1.5,z:0,dx:1,dz:0,active:false,running:false},1300)
  room.tick(.05,1301);assert.equal(room.snapshot().players[0].kick,0)
  assert.equal(room.handle('a',{type:'reset'},1900),false)
  room.remove('a');room.tick(.05,1901);assert.equal(room.snapshot().ball.vx,0)
})

test('dribbling eases velocity without teleporting or taking control of fast shots',()=>{
  const ball=createFootballState(),before={x:ball.x,z:ball.z}
  assert.ok(dribbleFootball(ball,actor,pitch,1/60))
  assert.deepEqual({x:ball.x,z:ball.z},before);assert.ok(ball.vx>0&&ball.vx<3.3)
  const slow=createFootballState();dribbleFootball(slow,{...actor,speed:.2},pitch,.05)
  assert.ok(slow.vx<ball.vx)
  const shot=createFootballState();kickFootball(shot,actor,pitch)
  assert.equal(dribbleFootball(shot,actor,pitch,.05),false);assert.equal(shot.vx,22)
  shot.kickCooldown=0;assert.equal(dribbleFootball(shot,actor,pitch,.05),false)
  const back=createFootballState();assert.equal(dribbleFootball(back,{...actor,position:{x:.9,z:0}},pitch,.05),false)
  assert.equal(dribbleFootball(back,{...actor,active:false},pitch,.05),false)
})

test('contested touches choose the closest eligible player independent of insertion order',()=>{
  const run=order=>{
    const r=createFootballRoom();for(const id of order)r.add(id,1000)
    r.handle('a',{type:'pose',sequence:1,x:-.8,z:0,dx:1,dz:0,active:true,running:false},1600)
    r.handle('b',{type:'pose',sequence:1,x:1,z:0,dx:-1,dz:0,active:true,running:false},1600)
    r.handle('a',{type:'pose',sequence:2,x:-.7,z:0,dx:1,dz:0,active:true,running:false},1700)
    r.handle('b',{type:'pose',sequence:2,x:.9,z:0,dx:-1,dz:0,active:true,running:false},1700)
    r.tick(1/60,1701);return r.snapshot().ball
  }
  assert.deepEqual(run(['a','b']),run(['b','a']))
  assert.ok(run(['a','b']).vx>0)
})

test('accepted pose acknowledgements survive latency; stale sequences and teleports are rejected',()=>{
  const progress=new FootballPoseProgress();progress.observe(0,0)
  for(let n=1;n<30;n++) {progress.observe(n,n*100+500);assert.equal(progress.stalled(n*100+900),false)}
  assert.equal(progress.stalled(5000),true)
  const room=createFootballRoom();room.add('a',1000)
  assert.ok(room.handle('a',{type:'pose',sequence:1,x:3.4,z:0,dx:1,dz:0,active:true,running:true},2000),'one-second valid catch-up fits the walking cap')
  assert.equal(room.snapshot().players[0].poseSequence,1)
  assert.equal(room.handle('a',{type:'pose',sequence:1,x:3.5,z:0,dx:1,dz:0,active:true,running:true},2100),false)
  assert.equal(room.handle('a',{type:'pose',sequence:2,x:40,z:0,dx:1,dz:0,active:true,running:true},2200),false)
  assert.equal(parseFootballSnapshot({...room.snapshot(),ball:{...room.snapshot().ball,revision:-1}}),null)
})

test('football acceleration is responsive, bounded and consistent at 30, 60 and 120 fps',()=>{
  const runs=[30,60,120].map(fps=>{
    const state=freshLocomotion();let distance=0
    for(let i=0;i<fps;i++){const t=advanceLocomotion(state,{x:1,z:0},5,1/fps,true,7);distance+=t.speed*t.delta;assert.ok(Math.hypot(state.velocity.x,state.velocity.z)<=5)}
    return distance
  })
  close(runs[0],runs[1]);close(runs[1],runs[2]);assert.ok(runs[0]>3)
})

test('moving, running and kicking accept three fingers without duplicate shots or lost movement',()=>{
  const walk={current:emptyWalkInput()},touch=new WalkTouchInput(walk),football=createFootballControls()
  touch.beginStick(1);touch.moveStick(1,0,-32,32)
  const pointer=id=>({button:0,pointerId:id,isPrimary:false,preventDefault(){},currentTarget:{setPointerCapture(){}}})
  instantControlPress(()=>touch.toggleRun()).onPointerDown(pointer(2))
  const pass=instantControlPress(()=>requestFootballAction(football,'pass'));pass.onPointerDown(pointer(3))
  pass.onClick({detail:0,nativeEvent:{pointerType:'touch'}});pass.onClick({detail:1,nativeEvent:{}})
  touch.release(3);assert.equal(football.kick,1);assert.equal(football.action,'pass')
  assert.ok(walk.current.forward>.9);assert.equal(walk.current.running,true)
  instantControlPress(()=>requestFootballAction(football)).onPointerDown(pointer(4))
  assert.equal(football.kick,2);assert.equal(football.action,'shot');assert.ok(walk.current.forward>.9)
})

test('a full pitch starts with distinct team-facing positions, and departures reuse a free place',()=>{
  const room=createFootballRoom()
  for(let n=0;n<24;n++)assert.ok(room.add(`p-${n}`,1000))
  const players=room.snapshot().players
  assert.equal(new Set(players.map(p=>`${p.x},${p.z}`)).size,24)
  for(const player of players)assert.equal(player.dx,player.team==='blue'?1:-1)
  room.remove('p-2');room.remove('p-7')
  room.add('replacement-a',1100);room.add('replacement-b',1100)
  assert.equal(new Set(room.snapshot().players.map(p=>`${p.x},${p.z}`)).size,24)
})

test('phone football keeps every other player visible while bounding detailed avatars and labels',()=>{
  const room=createFootballRoom();for(let n=0;n<24;n++)room.add(`p-${n}`,1000)
  const players=room.snapshot().players,choices=chooseFootballCrowd(players,'p-0',pitch,{x:0,z:0},'smooth')
  assert.equal(choices.length,23);assert.equal(new Set(choices.map(p=>p.id)).size,23)
  assert.equal(choices.filter(p=>p.detailed).length,6);assert.equal(choices.filter(p=>p.label).length,6)
  assert.ok(choices.some(p=>!p.detailed),'the remaining players use the light model rather than disappearing')
  assert.deepEqual(choices,chooseFootballCrowd([...players].reverse(),'p-0',pitch,{x:0,z:0},'smooth'))
  assert.equal(chooseFootballCrowd(players,'p-0',pitch,{x:0,z:0},'detailed').filter(p=>p.detailed).length,12)
})

test('football detail selection uses world distance on a rotated pitch',()=>{
  const players=[{id:'near',x:10,z:0},{id:'far',x:-30,z:0}]
  const rotated={center:{x:100,z:100},rotation:Math.PI/2,elevation:0}
  const choices=chooseFootballCrowd(players,null,rotated,{x:100,z:90},'balanced')
  assert.equal(choices[0].id,'near');assert.equal(choices[0].detailed,true)
  assert.equal(choices[1].detailed,false);assert.equal(choices.length,2)
})

test('24 authenticated socket peers receive the same pass, accepted aim and stable identities',async()=>{
  const http=createServer((_req,res)=>res.end('fixture'))
  const game=attachFootballServer(http,undefined,async token=>({id:token,name:'Fixture member',role:'member',expiresAt:Date.now()+3600000}))
  http.listen(0,'127.0.0.1');await once(http,'listening')
  const origin=`http://127.0.0.1:${http.address().port}`,url=origin.replace('http:','ws:')+'/football'
  const peers=Array.from({length:24},(_,i)=>{
    const socket=new WebSocket(url,{origin}),states=[]
    socket.on('open',()=>socket.send(JSON.stringify({type:'authenticate',token:`fixture-${i}`})))
    socket.on('message',data=>states.push(JSON.parse(data.toString())))
    return{socket,states}
  })
  const wait=async condition=>{const end=Date.now()+6000;while(Date.now()<end){if(condition())return;await new Promise(r=>setTimeout(r,20))}throw new Error('Pitch updates did not reach every peer')}
  try {
    await wait(()=>peers.every(p=>p.states.some(s=>s.type==='state'&&s.players.length===24)))
    const self=peers[0].states.find(s=>s.type==='welcome').player
    peers[0].socket.send(JSON.stringify({type:'pose',sequence:1,x:self.x,z:self.z,dx:self.dx,dz:self.dz,active:true,running:false}))
    peers[0].socket.send(JSON.stringify({type:'kick',mode:'pass',dx:0,dz:1}))
    await wait(()=>peers.every(p=>p.states.some(s=>s.type==='state'&&s.ball.vz>8&&s.players.find(player=>player.id===self.id)?.kick===1)))
    for(const peer of peers) {
      const state=peer.states.find(s=>s.type==='state'&&s.ball.vz>8)
      assert.ok(parseFootballSnapshot(state));assert.equal(state.players.length,24)
      assert.equal(state.players.find(p=>p.id===self.id).poseSequence,1)
      assert.equal(state.players.find(p=>p.id===self.id).dz,1)
    }
  } finally {
    for(const peer of peers)peer.socket.terminate()
    game.close();await new Promise(resolve=>http.close(resolve))
  }
})
