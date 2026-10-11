import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Object3D } from 'three'
import type { InstancedMesh } from 'three'
import { footballToLocal } from '../lib/football'
import type { FootballControls, FootballPitch } from '../lib/football'
import type { FootballSession } from '../lib/footballProtocol'

// Ball + all 24 players in one inexpensive draw call. The stadium's static
// shadow map stays cached; moving characters never force a campus redraw.
export default function FootballContactShadows({session,controls,pitch,live,enabled}:{session:React.RefObject<FootballSession>;controls:React.RefObject<FootballControls>;pitch:FootballPitch;live:boolean;enabled:boolean}) {
  const mesh=useRef<InstancedMesh>(null),dummy=useRef(new Object3D())
  useFrame(()=>{
    if(!mesh.current||!enabled)return
    const now=performance.now(),ball=session.current.ballMotion?.sample(now) ?? session.current.snapshot?.ball
    let count=0
    const add=(x:number,z:number,radius:number)=>{const o=dummy.current;o.position.set(x,.12,z);o.rotation.set(-Math.PI/2,0,0);o.scale.set(radius,radius,1);o.updateMatrix();mesh.current!.setMatrixAt(count++,o.matrix)}
    if(ball)add(ball.x,ball.z,.23)
    if(live)for(const player of session.current.snapshot?.players ?? []) {
      const actor=player.id===session.current.id?controls.current.actor:null
      const sampled=actor?.position ?? session.current.motion?.sample(player.id,now)
      const p=sampled?footballToLocal(sampled,pitch):player
      add(p.x,p.z,.32)
    }
    mesh.current.count=count;mesh.current.instanceMatrix.needsUpdate=true
  })
  return <instancedMesh ref={mesh} args={[undefined,undefined,25]} visible={enabled} frustumCulled={false} raycast={()=>null}>
    <circleGeometry args={[1,16]}/><meshBasicMaterial color="#142b21" transparent opacity={.19} depthWrite={false}/>
  </instancedMesh>
}
