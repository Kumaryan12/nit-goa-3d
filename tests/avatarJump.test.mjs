import assert from 'node:assert/strict'
import { test } from 'node:test'
import { advanceJump, freshJump, AVATAR_HEIGHT, JUMP_SPEED, JUMP_GRAVITY } from '../src/lib/avatarJump.ts'
import { avatarPose } from '../src/lib/avatarMotion.ts'
const close = (a,b) => assert.ok(Math.abs(a-b)<1e-8, `${a} ≈ ${b}`)
test('jump follows the same ballistic arc across frame rates and lands without sinking', () => {
  for(const hz of [30,60,120,144]) {
    const state=freshJump(); let apex=0
    for(let i=0;i<hz;i++) {
      advanceJump(state,8,1/hz,i===0)
      if(i/hz<.5) close(state.y,Math.max(8,8+JUMP_SPEED*(i+1)/hz-.5*JUMP_GRAVITY*((i+1)/hz)**2))
      apex=Math.max(apex,state.y-8)
      assert.ok(state.y>=8)
    }
    assert.ok(apex>.68 && apex<.70)
    assert.equal(state.grounded,true);close(state.y,8);close(state.velocity,0)
  }
})
test('airborne jump requests cannot reset vertical velocity or create a double jump', () => {
  const normal=freshJump(), repeated=freshJump()
  for(let i=0;i<30;i++) { advanceJump(normal,0,1/60,i===0);advanceJump(repeated,0,1/60,true);assert.deepEqual(repeated,normal) }
})
test('jumps land on changed terrain, then follow the slope while grounded', () => {
  const state=freshJump();advanceJump(state,0,.1,true)
  advanceJump(state,.2,.1);assert.ok(state.y>.2)
  for(let i=0;i<10;i++)advanceJump(state,.3,.1)
  close(state.y,.3);assert.equal(state.grounded,true)
  advanceJump(state,.45,.1);close(state.y,.45)
})
test('pause and invalid frame times freeze a jump; long frames remain bounded', () => {
  const state=freshJump();advanceJump(state,0,.1,true);const before={...state}
  advanceJump(state,0,.1,false,false);assert.deepEqual(state,before)
  for(const dt of [NaN,Infinity,-1,0]) { advanceJump(state,0,dt);assert.deepEqual(state,before) }
  const long={...state},short={...state};advanceJump(long,0,5);advanceJump(short,0,.1);assert.deepEqual(long,short)
})
test('low ceilings block takeoff and higher ceilings cap the head and allow landing', () => {
  const state=freshJump();advanceJump(state,0,.1,true,true,AVATAR_HEIGHT+.02);assert.equal(state.grounded,true)
  for(let i=0;i<10;i++) { advanceJump(state,0,.05,i===0,true,2.4);assert.ok(state.y+AVATAR_HEIGHT<=2.4+1e-8) }
  assert.equal(state.grounded,true);close(state.y,0)
})
test('jump animation keeps the body inside its collision height', () => {
  const pose=avatarPose(0,0,false,0,0,0,true)
  assert.ok(pose.knees.every(angle=>angle<-.4));assert.ok(pose.arms.every(angle=>angle<0))
  assert.ok(.88+1.042+pose.rootY<AVATAR_HEIGHT)
})
