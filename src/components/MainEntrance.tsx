import { memo, Suspense, useEffect, useMemo } from 'react'
import { useTexture } from '@react-three/drei'
import { SRGBColorSpace } from 'three'
import { Boxes, Roof, Sign } from './BuildingFacadeParts'
import type { Box } from './BuildingFacadeParts'
import type { MainEntranceLayout } from '../lib/mainEntrance'
import { entrancePoint } from '../lib/mainEntrance'
import { terrainHeightAt } from '../lib/terrain'
import type { TerrainModel } from '../lib/terrain'
import { createRoadGeometry, FOOTPATH_ELEVATION } from '../lib/roadGeometry'

function InstituteEmblem({ position, rear = false }: { position: [number,number,number]; rear?: boolean }) {
  const texture=useTexture('/brand/nit-goa-logo.png')
  const emblem=useMemo(()=>{
    // The existing logo asset is a wide wordmark; use only its square crest.
    const map=texture.clone();map.colorSpace=SRGBColorSpace
    const image=texture.image as HTMLImageElement
    map.repeat.set(image.height/image.width,1);map.needsUpdate=true
    return map
  },[texture])
  useEffect(()=>()=>emblem.dispose(),[emblem])
  return <mesh position={position} rotation={[0,rear?Math.PI/2:-Math.PI/2,0]}>
    <planeGeometry args={[1.12,1.12]} /><meshBasicMaterial map={emblem} transparent toneMapped={false} />
  </mesh>
}

function MainEntrance({ layout, terrain, night }: { layout: MainEntranceLayout; terrain: TerrainModel; night: boolean }) {
  const paving=useMemo(()=>createRoadGeometry([-1,1].map(side=>[terrain.entranceExterior?-11:-1,26].map(u=>entrancePoint(layout,u,side*(layout.halfSpan-2)))),1.25,FOOTPATH_ELEVATION,terrain),[layout,terrain])
  useEffect(()=>()=>paving.dispose(),[paving])
  const parts=useMemo(()=>{
    const stone:Box[]=[],cream:Box[]=[],bronze:Box[]=[],green:Box[]=[],glow:Box[]=[]
    const centerY=terrainHeightAt(terrain,layout.center.x,layout.center.z)
    const box=(u:number,y:number,v:number,length:number,height:number,width:number,ground=true):Box=>{
      const p=entrancePoint(layout,u,v)
      const floor=ground?terrainHeightAt(terrain,p.x,p.z)-centerY:0
      return {position:[u,floor+y,v],size:[length,height,width]}
    }
    for(const s of layout.solids){
      if (s.kind==='bollard') continue
      stone.push(box(s.u,s.height/2,s.v,s.length,s.height,s.width))
      cream.push(box(s.u,s.height+.08,s.v,s.length+.24,.16,s.width+.24))
      if(s.kind==='pier'){
        cream.push(box(s.u,.16,s.v,s.length+.2,.32,s.width+.2))
        bronze.push(box(s.u-.5*s.length-.012,s.height*.53,s.v,.025,s.height*.7,s.width*.72))
        glow.push(box(s.u-.5*s.length-.04,s.height*.53,s.v,.03,s.height*.62,.055))
        glow.push(box(s.u+.5*s.length+.04,s.height*.53,s.v,.03,s.height*.62,.055))
      }else{
        // Open bronze fins rise above the laterite side walls.
        for(let u=s.u-s.length/2+.35;u<s.u+s.length/2;u+=.55)bronze.push(box(u,1.86,s.v,.055,1.02,.075))
        bronze.push(box(s.u,2.36,s.v,s.length,.06,.085))
      }
    }
    const span=layout.halfSpan*2+2.1
    green.push(box(0,6.24,0,3.6,.78,span,false))
    cream.push(box(0,5.87,0,4.5,.18,span+.3,false),box(0,6.68,0,4.7,.16,span+.8,false))
    bronze.push(box(-1.825,5.99,0,.04,.05,span-.6,false),box(1.825,5.99,0,.04,.05,span-.6,false))
    for(const v of layout.laneOffsets)glow.push(box(0,5.77,v,2,.045,1.8,false))
    // Slender bollards line the pedestrian shoulders, away from both lanes.
    for(const u of [6,17,24])for(const side of [-1,1]){
      const v=side*(layout.halfSpan-1)
      bronze.push(box(u,.32,v,.16,.64,.16));glow.push(box(u,.62,v,.19,.065,.19))
    }
    const roofHalf=span/2+.75
    return {stone,cream,bronze,green,glow,centerY,roof:{
      vertices:[-2.65,6.73,-roofHalf,2.65,6.73,-roofHalf,0,7.36,-roofHalf,-2.65,6.73,roofHalf,2.65,6.73,roofHalf,0,7.36,roofHalf],
      indices:[0,3,5,0,5,2,2,5,4,2,4,1,0,2,1,3,4,5]}}
  },[layout,terrain])
  return <group>
    <mesh name="entrance-pedestrian-paths" geometry={paving} receiveShadow><meshStandardMaterial color="#d1c7ad" roughness={1} polygonOffset polygonOffsetFactor={-1} /></mesh>
    <group name="main-entrance" position={[layout.center.x,parts.centerY,layout.center.z]} rotation={[0,-layout.angle,0]}>
    <Boxes boxes={parts.stone} color="#a57553" />
    <Boxes boxes={parts.cream} color="#f0e6ca" />
    <Boxes boxes={parts.bronze} color="#756044" />
    <Boxes boxes={parts.green} color="#214a3d" />
    <Boxes boxes={parts.glow} color={night?'#ffdf9d':'#ead6a5'} night={night} />
    <Roof {...parts.roof} />
    <group position={[-1.845,6.24,0]} rotation={[0,-Math.PI/2,0]}>
      <Sign text="NATIONAL INSTITUTE OF TECHNOLOGY GOA" width={layout.halfSpan*2-1.8} height={.48} position={[0,0,0]} color="#f6e6bf" />
    </group>
    <group position={[1.845,6.24,0]} rotation={[0,Math.PI/2,0]}>
      <Sign text="WELCOME TO NIT GOA" width={11.5} height={.43} position={[0,0,0]} color="#f6e6bf" />
    </group>
    {[-1,1].map(side=><group key={side}>
      <Suspense fallback={null}><InstituteEmblem position={[-1.325,3.65,side*layout.halfSpan]} /><InstituteEmblem rear position={[1.325,3.65,side*layout.halfSpan]} /></Suspense>
      <group position={[11-.64,1.35,side*(layout.halfSpan+2.8)]} rotation={[0,-Math.PI/2,0]}>
        <Sign text="NIT GOA" width={1.05} height={.21} position={[0,0,0]} color="#f6e6bf" />
      </group>
    </group>)}
    </group>
  </group>
}
export default memo(MainEntrance)
