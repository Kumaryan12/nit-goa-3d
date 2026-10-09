import { entranceRoadReference } from './entranceRoadReference.ts'
import { gpsToLocal } from './geo.ts'
import type { LocalCoordinate } from './geo.ts'
import { clipRoadToCampus } from './roads.ts'
import { createEntranceAccess } from './entranceAccess.ts'
import type { EntranceAccess } from './entranceAccess.ts'
export { inEntranceExterior } from './entranceAccess.ts'
import type { RoadFootprint } from '../types/osm.ts'

export interface EntranceExterior extends EntranceAccess { roads: RoadFootprint[] }
export function createEntranceExterior(boundary: LocalCoordinate[]): EntranceExterior | undefined {
  const access=createEntranceAccess(boundary)
  if(!access)return undefined
  const highway:RoadFootprint={id:'entrance/NH66',osmId:entranceRoadReference.highway.id,kind:'road',width:8,tags:{highway:'trunk',ref:'NH66',lanes:'2'},paths:[access.highway]}
  const approaches=entranceRoadReference.approaches.map(reference=>({id:`entrance/${reference.id}`,osmId:reference.id,kind:'road' as const,width:4.5,tags:{highway:'service'},paths:[reference.geometry.map(gpsToLocal)]}))
  // Restore only the missing part of each lane, with a small overlap at the
  // clipping point to avoid a visible seam in the existing campus roads.
  for(const road of approaches) {
    const path=road.paths[0],north=road.osmId===1372014791
    const inside=clipRoadToCampus(path,boundary)[0]
    if(!inside)return undefined
    const edge=north?inside[0]:inside.at(-1)!,next=north?inside[1]:inside.at(-2)!,length=Math.hypot(next.x-edge.x,next.z-edge.z)
    const join={x:edge.x+(next.x-edge.x)/length,z:edge.z+(next.z-edge.z)/length}
    road.paths=[north?[path[0],join]:[join,path.at(-1)!]]
  }
  return {...access,roads:[highway,...approaches]}
}
