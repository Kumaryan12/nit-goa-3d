// Small shared region module: no browser data, Three.js or map-fetch dependency.
import { entranceRoadReference } from './entranceRoadReference.ts'
import { gpsToLocal, localToGps, pointInRing } from './geo.ts'
import type { LocalCoordinate } from './geo.ts'

export const ENTRANCE_ROAD_ANCHOR={x:-545.5,z:-22.49}
export interface EntranceAccess { highway:LocalCoordinate[];forecourt:LocalCoordinate[];highwayAccessWidth:number }
export function createEntranceAccess(boundary:LocalCoordinate[]):EntranceAccess|undefined {
  const anchor=ENTRANCE_ROAD_ANCHOR
  if(!pointInRing(localToGps(anchor),boundary.map(localToGps)))return undefined
  const source=entranceRoadReference.highway.geometry.map(gpsToLocal),minZ=anchor.z-110,maxZ=anchor.z+110
  const highway:LocalCoordinate[]=[]
  for(let i=1;i<source.length;i++) {
    const a=source[i-1],b=source[i],dz=b.z-a.z
    const start=Math.max(0,(minZ-a.z)/dz),end=Math.min(1,(maxZ-a.z)/dz)
    if(start>end)continue
    const p=(t:number)=>({x:a.x+(b.x-a.x)*t,z:a.z+dz*t})
    if(!highway.length)highway.push(p(start))
    highway.push(p(end))
  }
  if(highway.length<2)return undefined
  const forecourt=[{x:anchor.x-31,z:anchor.z-14},{x:anchor.x+10,z:anchor.z-14},{x:anchor.x+10,z:anchor.z+14},{x:anchor.x-31,z:anchor.z+14},{x:anchor.x-31,z:anchor.z-14}]
  return {highway,forecourt,highwayAccessWidth:13}
}
function segmentDistance(point:LocalCoordinate,a:LocalCoordinate,b:LocalCoordinate):number {
  const dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((point.x-a.x)*dx+(point.z-a.z)*dz)/(dx*dx+dz*dz||1)))
  return Math.hypot(point.x-a.x-dx*t,point.z-a.z-dz*t)
}
export function inEntranceExterior(point:LocalCoordinate,exterior:EntranceAccess,radius=0):boolean {
  if(!Number.isFinite(point.x)||!Number.isFinite(point.z))return false
  const [min,,max]=exterior.forecourt
  if(point.x>=min.x+radius&&point.x<=max.x-radius&&point.z>=min.z+radius&&point.z<=max.z-radius)return true
  // Flat corridor ends avoid access beyond the rendered road fragment.
  const first=exterior.highway[0],second=exterior.highway[1],last=exterior.highway.at(-1)!,previous=exterior.highway.at(-2)!
  const start=(point.x-first.x)*(second.x-first.x)+(point.z-first.z)*(second.z-first.z)
  const end=(point.x-last.x)*(previous.x-last.x)+(point.z-last.z)*(previous.z-last.z)
  if(start<radius*Math.hypot(second.x-first.x,second.z-first.z)||end<radius*Math.hypot(previous.x-last.x,previous.z-last.z))return false
  return exterior.highway.slice(1).some((b,i)=>segmentDistance(point,exterior.highway[i],b)<=exterior.highwayAccessWidth/2-radius)
}
