import { memo, useEffect, useMemo } from 'react'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { createRoadGeometry, ROAD_ELEVATION } from '../lib/roadGeometry'
import type { TerrainModel } from '../lib/terrain'
import type { EntranceExterior } from '../lib/entranceExterior'

function EntranceHighway({ exterior,terrain,night }: { exterior:EntranceExterior;terrain:TerrainModel;night:boolean }) {
  const geometry=useMemo(()=>{
    const merge=(parts:ReturnType<typeof createRoadGeometry>[])=>{
      const value=mergeGeometries(parts)!;parts.forEach(part=>part.dispose());return value
    }
    const roads=merge(exterior.roads.map(road=>createRoadGeometry(road.paths,road.width,ROAD_ELEVATION,terrain)))
    const shoulders=merge(exterior.roads.map(road=>createRoadGeometry(road.paths,road.width+2.8,.018,terrain)))
    const dashes:{x:number;z:number}[][]=[],path=exterior.highway
    let travelled=0,next=2
    for(let i=1;i<path.length;i++){
      const a=path[i-1],b=path[i],dx=b.x-a.x,dz=b.z-a.z,length=Math.hypot(dx,dz)
      while(next<travelled+length){
        const t=(next-travelled)/length,end=Math.min(1,t+2.8/length)
        dashes.push([{x:a.x+dx*t,z:a.z+dz*t},{x:a.x+dx*end,z:a.z+dz*end}]);next+=7
      }
      travelled+=length
    }
    const markings=createRoadGeometry(dashes,.13,ROAD_ELEVATION+.006,terrain)
    return {roads,shoulders,markings}
  },[exterior,terrain])
  useEffect(()=>()=>Object.values(geometry).forEach(g=>g.dispose()),[geometry])
  return <group name="main-entrance-highway">
    <mesh geometry={geometry.shoulders} receiveShadow><meshStandardMaterial color="#b8ae94" roughness={1}/></mesh>
    <mesh geometry={geometry.roads} receiveShadow><meshStandardMaterial color={night?'#596371':'#434946'} roughness={1}/></mesh>
    <mesh geometry={geometry.markings}><meshStandardMaterial color="#f0e8d2" roughness={1} polygonOffset polygonOffsetFactor={-1}/></mesh>
  </group>
}
export default memo(EntranceHighway)
