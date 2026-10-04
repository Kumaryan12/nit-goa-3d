import { gpsToLocal, localToGps, validClosedRing } from './geo.ts'
import type { LocalCoordinate } from './geo.ts'
import type { BuildingFootprint } from '../types/osm.ts'
// Owner confirms two courts. North-up World Imagery shows a transverse wing
// missing from OSM's single opening. Its center/width are visual estimates.
export const GYAN_CROSS_WING_Z = -158
export const GYAN_CROSS_WING_HALF_WIDTH = 2.5
function clip(ring: LocalCoordinate[], limit: number, north: boolean): LocalCoordinate[] {
  const output:LocalCoordinate[]=[]
  const inside=(p:LocalCoordinate)=>north?p.z<=limit:p.z>=limit
  for(let i=0;i<ring.length-1;i++) {
    const a=ring[i],b=ring[i+1],aIn=inside(a),bIn=inside(b)
    if(aIn)output.push({...a})
    if(aIn!==bIn){const t=(limit-a.z)/(b.z-a.z);output.push({x:a.x+(b.x-a.x)*t,z:limit})}
  }
  if(output.length)output.push({...output[0]})
  return output
}
export function correctGyanCourtyards(building:BuildingFootprint):BuildingFootprint {
  if(building.id!=='relation/19505813/0'||building.holes.length!==1)return building
  const opening=building.holes[0].map(gpsToLocal)
  const holes=[clip(opening,GYAN_CROSS_WING_Z-GYAN_CROSS_WING_HALF_WIDTH,true),clip(opening,GYAN_CROSS_WING_Z+GYAN_CROSS_WING_HALF_WIDTH,false)].map(r=>validClosedRing(r.map(localToGps)))
  return holes.every((r):r is NonNullable<typeof r>=>!!r)?{...building,holes}:building
}
