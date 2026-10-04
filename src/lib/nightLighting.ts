import { gpsToLocal } from './geo.ts'
import type { LocalCoordinate } from './geo.ts'
import { pointInCampus } from './roads.ts'
import { distanceToSegment, terrainHeightAt } from './terrain.ts'
import type { TerrainModel } from './terrain.ts'
import type { BuildingFootprint, RoadFootprint } from '../types/osm.ts'
import type { CampusLocation } from '../types/campus.ts'
import type { TreeInstance } from './vegetation.ts'
import { treeTrunkRadius } from './vegetation.ts'
import { inCanalOpening } from './canal.ts'
import { theatreSurfaceHeightAt } from './theatre.ts'

export const NIGHT_LIGHT_BUDGET = 8
export const STREETLIGHT_LIMIT = 180
export const LAMP_POLE_RADIUS = .18
export interface CampusLamp extends LocalCoordinate {
  id: string; y: number; height: number; angle: number; kind: 'street' | 'path' | 'flood'; target: LocalCoordinate
}
interface LampCampus { roads: RoadFootprint[]; buildings: BuildingFootprint[]; boundary: LocalCoordinate[]; terrain: TerrainModel; trees: TreeInstance[]; locations: CampusLocation[] }
const ringDistance = (p: LocalCoordinate, ring: LocalCoordinate[]) => ring.reduce((d,a,i)=>Math.min(d,distanceToSegment(p,a,ring[(i+1)%ring.length])),Infinity)

// Stylized fixtures follow the campus map, rather than claiming surveyed lamp
// locations. Sampling accumulated distance keeps curves evenly spaced.
export function generateCampusLamps({ roads, buildings, boundary, terrain, trees, locations }: LampCampus): CampusLamp[] {
  if(boundary.length<3)return []
  const footprints=buildings.map(b=>({outer:b.outer.map(gpsToLocal),holes:b.holes.map(h=>h.map(gpsToLocal))}))
  const roadEdges=roads.flatMap(road=>road.paths.flatMap(path=>path.slice(1).map((b,i)=>({a:path[i],b,width:road.width}))))
  const lamps:CampusLamp[]=[]
  const legal=(p:LocalCoordinate) => Number.isFinite(p.x)&&Number.isFinite(p.z)&&pointInCampus(p,boundary)&&ringDistance(p,boundary)>1
    &&!footprints.some(b=>(pointInCampus(p,b.outer)&&!b.holes.some(h=>pointInCampus(p,h)))||ringDistance(p,b.outer)<1||b.holes.some(h=>ringDistance(p,h)<1))
    &&!roadEdges.some(e=>distanceToSegment(p,e.a,e.b)<e.width/2+.65)
    &&!trees.some(tree=>Math.hypot(p.x-tree.x,p.z-tree.z)<Math.max(2.5*tree.scale,treeTrunkRadius(tree)+1))
    &&!(terrain.canal&&inCanalOpening(p,terrain.canal,1.2))
    &&!(terrain.theatre&&(theatreSurfaceHeightAt(p,terrain.theatre)!==null||terrain.theatre.access.slice(1).some((b,i)=>distanceToSegment(p,terrain.theatre!.access[i],b)<2)))
    &&!lamps.some(lamp=>Math.hypot(p.x-lamp.x,p.z-lamp.z)<10)
  const add=(p:LocalCoordinate,target:LocalCoordinate,kind:CampusLamp['kind'],id:string) => {
    if(!legal(p)||lamps.length>=STREETLIGHT_LIMIT)return false
    lamps.push({...p,id,y:terrainHeightAt(terrain,p.x,p.z),height:kind==='flood'?12:kind==='street'?6.2:4.2,angle:Math.atan2(target.x-p.x,target.z-p.z),kind,target:{...target}})
    return true
  }
  // Floodlight masts stay beyond the playable pitch, on its cleared apron.
  const sports=locations.find(l=>l.id==='sports-ground')
  if(sports) {
    const rotation=(sports.rotationDegrees??0)*Math.PI/180,c=Math.cos(rotation),s=Math.sin(rotation)
    for(const x of [-48,48])for(const z of [-29,29]) {
      const point={x:sports.coordinates.x+c*x+s*z,z:sports.coordinates.z-s*x+c*z}
      add(point,{x:sports.coordinates.x+c*x*.45+s*z*.35,z:sports.coordinates.z-s*x*.45+c*z*.35},'flood',`pitch-${x}-${z}`)
    }
  }
  for(const road of [...roads].sort((a,b)=>Number(a.kind==='footpath')-Number(b.kind==='footpath')||a.id.localeCompare(b.id)))for(const [pathIndex,path] of road.paths.entries()) {
    const spacing=road.kind==='road'?24:18
    let travelled=0,next=spacing/3,index=0
    for(let i=1;i<path.length;i++) {
      const a=path[i-1],b=path[i],dx=b.x-a.x,dz=b.z-a.z,length=Math.hypot(dx,dz)
      if(!Number.isFinite(length)||length<.001)continue
      while(next<=travelled+length) {
        const t=(next-travelled)/length,p={x:a.x+dx*t,z:a.z+dz*t},offset=road.width/2+1.2,side=index%2?1:-1
        for(const sign of [side,-side]) {
          const pole={x:p.x-dz/length*offset*sign,z:p.z+dx/length*offset*sign}
          if(add(pole,p,road.kind==='road'?'street':'path',`${road.id}/${pathIndex}/${index}`))break
        }
        index++;next+=spacing
      }
      travelled+=length
    }
  }
  return lamps
}
export function lampHead(lamp:CampusLamp):{x:number;y:number;z:number} {
  const arm=lamp.kind==='flood'?.25:1.15
  return {x:lamp.x+Math.sin(lamp.angle)*arm,y:lamp.y+lamp.height-.12,z:lamp.z+Math.cos(lamp.angle)*arm}
}
// A fixed shader-light budget avoids one expensive light/shadow per pole.
export function nearestCampusLamps(lamps:CampusLamp[],point:{x:number;y:number;z:number},limit=NIGHT_LIGHT_BUDGET):CampusLamp[] {
  return lamps.map(lamp=>{const head=lampHead(lamp);return {lamp,distance:Math.hypot(point.x-head.x,point.y-head.y,point.z-head.z)}})
    .filter(({lamp,distance})=>distance<(lamp.kind==='flood'?100:34))
    .sort((a,b)=>a.distance-b.distance||a.lamp.id.localeCompare(b.lamp.id)).slice(0,Math.max(0,Math.min(NIGHT_LIGHT_BUDGET,limit))).map(item=>item.lamp)
}
