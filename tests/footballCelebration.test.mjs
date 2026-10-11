import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createFootballState, stepFootball } from '../src/lib/football.ts'
import { FootballGoalCelebrations, goalConfetti } from '../src/lib/footballCelebration.ts'

const goal=(team='blue',remaining=2.5,blue=1,gold=0)=>({...createFootballState(),blue,gold,event:`${team}-goal`,resetSeconds:remaining})

test('one shared goal produces one celebration despite repeated packets and reconnects',()=>{
  const a=new FootballGoalCelebrations(),b=new FootballGoalCelebrations()
  a.observe(goal(),1000);b.observe(goal('blue',2.32),1180)
  assert.equal(a.sample(1200).key,b.sample(1200).key)
  assert.equal(a.sample(1200).startedAt,b.sample(1200).startedAt)
  a.observe(goal(),1300)
  assert.equal(a.sample(1300).expiresAt,3500,'duplicates cannot extend the celebration')
  a.hide();a.observe(goal('blue',2),1500)
  assert.equal(a.sample(1500),null,'reconnection does not replay the same goal')
  a.observe(goal('gold',2.5,1,1),4000)
  assert.equal(a.sample(4000).team,'gold')
})

test('late arrivals join the remaining celebration and dropped packets cannot leave it stuck',()=>{
  const tracker=new FootballGoalCelebrations()
  tracker.observe(goal('blue',.4),8000)
  assert.equal(tracker.sample(8000).startedAt,5900)
  assert.equal(tracker.sample(8400),null)
  tracker.observe(goal('blue',.3),9000)
  assert.equal(tracker.sample(9000),null)
  tracker.observe({...goal(),resetSeconds:0},9100)
  assert.equal(tracker.sample(9100),null)
})

test('real swept goals celebrate once, then clear at authoritative kickoff and out never celebrates',()=>{
  const ball=createFootballState(),tracker=new FootballGoalCelebrations()
  Object.assign(ball,{x:41,z:0,vx:30,event:'playing'})
  stepFootball(ball,.1);tracker.observe(ball,1000)
  assert.equal(tracker.sample(1000).team,'blue');assert.equal(ball.blue,1)
  for(let i=1;i<=26;i++){stepFootball(ball,.1);tracker.observe(ball,1000+i*100)}
  assert.equal(ball.event,'kickoff');assert.equal(tracker.sample(3600),null)
  Object.assign(ball,{x:0,z:21.9,vz:30,event:'playing'})
  stepFootball(ball,.1);tracker.observe(ball,3700)
  assert.equal(ball.event,'out');assert.equal(tracker.sample(3700),null)
  tracker.observe(goal('gold',2.5,0,1),4000)
  assert.equal(tracker.sample(4000).team,'gold','a fresh match with lower scores can celebrate')
})

test('confetti trajectories are reproducible, bounded, and finish before kickoff',()=>{
  const point={x:0,y:0,z:0,spin:0,visible:false}
  for(let i=0;i<64;i++)for(const age of [0,.5,1,2,2.5,10]) {
    const first={...goalConfetti(i,age,point)},again={...goalConfetti(i,age,point)}
    assert.deepEqual(first,again)
    assert.ok(Object.values(first).every(v=>typeof v==='boolean'||Number.isFinite(v)))
    if(first.visible){assert.ok(first.y>.15&&first.y<5);assert.ok(Math.hypot(first.x,first.z)<12)}
    if(age>=2.5)assert.equal(first.visible,false)
  }
})
