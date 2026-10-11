import { useContext, useEffect, useMemo, useRef, useState } from 'react'
import { Html } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { Color, DoubleSide, DynamicDrawUsage, Object3D } from 'three'
import type { InstancedMesh } from 'three'
import type { FootballSession } from '../lib/footballProtocol'
import { footballToLocal } from '../lib/football'
import type { FootballControls, FootballPitch } from '../lib/football'
import { FootballGoalCelebrations, goalConfetti } from '../lib/footballCelebration'
import type { GoalCelebration } from '../lib/footballCelebration'
import { GraphicsContext } from './ScenePerformance'

export default function FootballCelebration({session,controls,pitch,live}:{session:React.RefObject<FootballSession>;controls:React.RefObject<FootballControls>;pitch:FootballPitch;live:boolean}) {
  const mesh=useRef<InstancedMesh>(null),tracker=useRef(new FootballGoalCelebrations()),lastSnapshot=useRef<FootballSession['snapshot']>(null)
  const reducedMotion=useRef(false),burstKey=useRef(''),origin=useRef({x:0,z:0}),[goal,setGoal]=useState<GoalCelebration|null>(null)
  const profile=useContext(GraphicsContext),gl=useThree(state=>state.gl),portal=useRef(gl.domElement.parentElement!)
  const dummy=useMemo(()=>new Object3D(),[]),color=useMemo(()=>new Color(),[]),particle=useRef({x:0,y:0,z:0,spin:0,visible:false})
  const budget=profile.dpr<=.85?32:64
  useEffect(()=>{
    const preference=window.matchMedia('(prefers-reduced-motion: reduce)')
    const update=()=>{reducedMotion.current=preference.matches}
    update();preference.addEventListener('change',update)
    return()=>preference.removeEventListener('change',update)
  },[])
  useEffect(()=>{mesh.current?.instanceMatrix.setUsage(DynamicDrawUsage)},[budget])
  useFrame(()=>{
    const now=performance.now(),snapshot=session.current.snapshot
    if(!live) tracker.current.hide()
    else if(snapshot && snapshot!==lastSnapshot.current) tracker.current.observe(snapshot.ball,now)
    lastSnapshot.current=snapshot
    const current=tracker.current.sample(now)
    if(current?.key!==goal?.key) setGoal(current)
    const instances=mesh.current
    if(!instances) return
    instances.visible=!!current&&!reducedMotion.current
    if(!current) return
    if(`${current.key}:${budget}`!==burstKey.current) {
      burstKey.current=`${current.key}:${budget}`
      const actor=controls.current.actor
      const p=actor?footballToLocal(actor.position,pitch):{x:snapshot?.ball.x ?? 0,z:snapshot?.ball.z ?? 0}
      const direction=actor?footballToLocal(actor.direction,{...pitch,center:{x:0,z:0}}):{x:0,z:0}
      origin.current={x:p.x+direction.x*2,z:p.z+direction.z*2}
      const palette=current.team==='blue'?['#43bfff','#b8e7ff','#ffffff','#e6c470']:['#f5ca54','#ffeb9d','#ffffff','#49b6e3']
      for(let i=0;i<budget;i++)instances.setColorAt(i,color.set(palette[i%palette.length]))
      if(instances.instanceColor)instances.instanceColor.needsUpdate=true
    }
    if(reducedMotion.current) return
    const age=(now-current.startedAt)/1000
    for(let i=0;i<budget;i++) {
      const p=goalConfetti(i,age,particle.current)
      dummy.position.set(origin.current.x+p.x,p.y+.15,origin.current.z+p.z)
      dummy.rotation.set(p.spin,p.spin*.6,p.spin*.8)
      dummy.scale.setScalar(p.visible?1:0);dummy.updateMatrix();instances.setMatrixAt(i,dummy.matrix)
    }
    instances.instanceMatrix.needsUpdate=true
  })
  return <>
    <instancedMesh ref={mesh} args={[undefined,undefined,budget]} visible={false} frustumCulled={false} raycast={()=>undefined}>
      <planeGeometry args={[.12,.22]}/><meshBasicMaterial side={DoubleSide} toneMapped={false}/>
    </instancedMesh>
    {goal && live && <Html fullscreen portal={portal} calculatePosition={(_,__,size)=>[size.width/2,size.height/2]} zIndexRange={[38,38]} style={{pointerEvents:'none'}}>
      <div key={goal.key} className={`football-goal-banner ${goal.team}`} role="status" aria-live="polite">
        <span className="football-goal-team">{goal.team==='blue'?'Blue':'Gold'} scores</span><strong>GOAL!</strong><span className="football-goal-result">{goal.blue} <span aria-hidden="true">—</span> {goal.gold}</span>
      </div>
    </Html>}
  </>
}
