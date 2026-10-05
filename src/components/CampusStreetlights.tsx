import { memo, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { AdditiveBlending, BufferGeometry, Color, Float32BufferAttribute, InstancedMesh, Object3D, PointLight } from 'three'
import { lampHead, nearestCampusLamps, NIGHT_LIGHT_BUDGET } from '../lib/nightLighting'
import type { CampusLamp } from '../lib/nightLighting'
import { terrainHeightAt } from '../lib/terrain'
import type { TerrainModel } from '../lib/terrain'
import { theatreSurfaceHeightAt } from '../lib/theatre'
const ignoreRaycast = () => undefined
interface Part { x:number;y:number;z:number; width:number;height:number;depth:number;angle?:number }
function Instances({parts,color,glowing=false,night=false}:{parts:Part[];color:string;glowing?:boolean;night?:boolean}) {
  const mesh=useRef<InstancedMesh>(null)
  useLayoutEffect(()=>{const dummy=new Object3D();parts.forEach((p,i)=>{dummy.position.set(p.x,p.y,p.z);dummy.rotation.set(0,p.angle??0,0);dummy.scale.set(p.width,p.height,p.depth);dummy.updateMatrix();mesh.current?.setMatrixAt(i,dummy.matrix)});if(mesh.current){mesh.current.instanceMatrix.needsUpdate=true;mesh.current.computeBoundingSphere()}},[parts])
  return <instancedMesh ref={mesh} args={[undefined,undefined,parts.length]} raycast={ignoreRaycast} receiveShadow>
    <boxGeometry/><meshStandardMaterial color={color} roughness={.7} metalness={glowing?0:.3} emissive={glowing?'#ffd69a':'#000000'} emissiveIntensity={glowing&&night?2.4:0}/>
  </instancedMesh>
}
const glowVertex=`varying vec2 vUv;
void main(){vUv=uv;vec4 center=modelViewMatrix*instanceMatrix*vec4(0.0,0.0,0.0,1.0);center.xy+=position.xy*1.8;gl_Position=projectionMatrix*center;}`
const glowFragment=`varying vec2 vUv;
void main(){float r=length(vUv-.5)*2.;float a=pow(max(0.,1.-r),3.);gl_FragColor=vec4(1.,.69,.33,a*.6);
#include <colorspace_fragment>
}`
function LampHalos({lamps}:{lamps:CampusLamp[]}) {
  const mesh=useRef<InstancedMesh>(null)
  useLayoutEffect(()=>{const dummy=new Object3D();lamps.forEach((lamp,i)=>{const p=lampHead(lamp);dummy.position.set(p.x,p.y,p.z);dummy.updateMatrix();mesh.current?.setMatrixAt(i,dummy.matrix)});if(mesh.current){mesh.current.instanceMatrix.needsUpdate=true;mesh.current.computeBoundingSphere()}},[lamps])
  return <instancedMesh ref={mesh} args={[undefined,undefined,lamps.length]} raycast={ignoreRaycast}>
    <planeGeometry/><shaderMaterial vertexShader={glowVertex} fragmentShader={glowFragment} transparent blending={AdditiveBlending} depthWrite={false} toneMapped={false}/>
  </instancedMesh>
}
function LightPools({lamps,terrain}:{lamps:CampusLamp[];terrain:TerrainModel}) {
  const geometry=useMemo(()=>{
    const positions:number[]=[],uv:number[]=[],colors:number[]=[],indices:number[]=[]
    for(const lamp of lamps) {
      const radius=lamp.kind==='flood'?30:lamp.kind==='street'?8:5.5,center=lamp.target,offset=positions.length/3
      // Small triangles drape each pool onto the same terrain used by roads,
      // rather than a flat glow plane disappearing inside a campus slope.
      const divisions=12
      for(let z=0;z<=divisions;z++)for(let x=0;x<=divisions;x++) {
        const px=center.x+(x/divisions*2-1)*radius,pz=center.z+(z/divisions*2-1)*radius
        const y=(terrain.theatre&&theatreSurfaceHeightAt({x:px,z:pz},terrain.theatre))??terrainHeightAt(terrain,px,pz)
        positions.push(px,y+.105,pz);uv.push(x/divisions,z/divisions);colors.push(...(lamp.kind==='flood'?[.38,.48,.65]:[.55,.34,.13]))
      }
      for(let z=0;z<divisions;z++)for(let x=0;x<divisions;x++) {const a=offset+z*(divisions+1)+x,b=a+divisions+1;indices.push(a,b,a+1,a+1,b,b+1)}
    }
    const result=new BufferGeometry();result.setAttribute('position',new Float32BufferAttribute(positions,3));result.setAttribute('uv',new Float32BufferAttribute(uv,2));result.setAttribute('color',new Float32BufferAttribute(colors,3));result.setIndex(indices);result.computeBoundingSphere();return result
  },[lamps,terrain])
  useEffect(()=>()=>geometry.dispose(),[geometry])
  return <mesh geometry={geometry} raycast={ignoreRaycast} renderOrder={2}>
    <shaderMaterial vertexColors vertexShader={`varying vec2 vUv;varying vec3 vPoolColor;void main(){vUv=uv;vPoolColor=color;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`} fragmentShader={`varying vec2 vUv;varying vec3 vPoolColor;void main(){float r=length(vUv-.5)*2.;float a=pow(max(0.,1.-r*r),2.);gl_FragColor=vec4(vPoolColor,a*.3);
#include <colorspace_fragment>
}`} transparent blending={AdditiveBlending} depthWrite={false} polygonOffset polygonOffsetFactor={-2} toneMapped={false}/>
  </mesh>
}
function NearbyLights({lamps,indoors}:{lamps:CampusLamp[];indoors:boolean}) {
  const lights=useRef<(PointLight|null)[]>([]),elapsed=useRef(1)
  const warm=useMemo(()=>new Color('#ffd69a'),[]),white=useMemo(()=>new Color('#e3ecff'),[])
  useFrame(({camera},delta)=>{
    elapsed.current+=delta;if(elapsed.current<.2)return;elapsed.current=0
    const nearby=indoors?[]:nearestCampusLamps(lamps,camera.position)
    for(let i=0;i<NIGHT_LIGHT_BUDGET;i++) {
      const light=lights.current[i],lamp=nearby[i];if(!light)continue
      light.intensity=lamp?(lamp.kind==='flood'?3500:75):0
      if(lamp){const p=lampHead(lamp);light.position.set(p.x,p.y-.15,p.z);light.color.copy(lamp.kind==='flood'?white:warm);light.distance=lamp.kind==='flood'?100:22}
    }
  })
  return <>{Array.from({length:NIGHT_LIGHT_BUDGET},(_,i)=><pointLight key={i} ref={value=>{lights.current[i]=value}} intensity={0} decay={2} castShadow={false}/>)}</>
}
function CampusStreetlights({lamps,terrain,night,indoors}:{lamps:CampusLamp[];terrain:TerrainModel;night:boolean;indoors:boolean}) {
  const parts=useMemo(()=>{
    const poles:Part[]=[],heads:Part[]=[],bulbs:Part[]=[]
    for(const lamp of lamps) {
      const flood=lamp.kind==='flood',head=lampHead(lamp),angle=lamp.angle
      poles.push({x:lamp.x,y:lamp.y+lamp.height/2,z:lamp.z,width:flood?.25:.14,height:lamp.height,depth:flood?.25:.14},
        {x:lamp.x,y:lamp.y+.12,z:lamp.z,width:.36,height:.24,depth:.36})
      if(!flood)poles.push({x:(lamp.x+head.x)/2,y:lamp.y+lamp.height-.12,z:(lamp.z+head.z)/2,width:.1,height:.1,depth:1.35,angle})
      heads.push({...head,width:flood?2:.6,height:flood?.3:.15,depth:flood?.5:.95,angle})
      bulbs.push({...head,y:head.y-(flood?.16:.09),width:flood?1.75:.43,height:.025,depth:flood?.42:.72,angle})
    }
    return {poles,heads,bulbs}
  },[lamps])
  return <group name="campus-streetlights">
    <Instances parts={parts.poles} color="#40515d"/><Instances parts={parts.heads} color="#293c49"/><Instances parts={parts.bulbs} color="#f8ecd5" glowing night={night}/>
    {night&&<><LampHalos lamps={lamps}/><LightPools lamps={lamps} terrain={terrain}/><NearbyLights lamps={lamps} indoors={indoors}/></>}
  </group>
}

export default memo(CampusStreetlights)
