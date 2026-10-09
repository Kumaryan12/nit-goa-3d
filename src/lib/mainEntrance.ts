import type { LocalCoordinate } from './geo.ts'
import type { RoadFootprint } from '../types/osm.ts'
import type { GroundRect, TerrainModel } from './terrain.ts'
import { terrainHeightAt } from './terrain.ts'
import type { CampusGardens } from './campusGardens.ts'
import { gardenPoint } from './campusGardens.ts'
import type { TreeInstance } from './vegetation.ts'
import { pointInCampus } from './roads.ts'

export interface EntranceSolid { u: number; v: number; length: number; width: number; height: number; kind: 'pier' | 'wall' | 'bollard' }
export interface MainEntranceLayout {
  center: LocalCoordinate
  inward: LocalCoordinate
  across: LocalCoordinate
  angle: number
  laneOffsets: number[]
  laneWidths: number[]
  halfSpan: number
  clearance: number
  solids: EntranceSolid[]
  clearing: GroundRect
}

// These two mapped approach lanes meet the boundary road. The aerial shows
// the divided driveway; architectural elevations are a designed interpretation.
const approachIds = ['way/1372014791', 'way/1372014792']
export function createMainEntrance(roads: RoadFootprint[], anchor: LocalCoordinate): MainEntranceLayout | undefined {
  const pair = approachIds.map(id => roads.find(road => road.id === id))
  if (!pair[0] || !pair[1]) return undefined
  const segments = pair.map(road => road!.paths.flatMap(path => path.slice(1).map((b, i) => ({ a: path[i], b }))))
  const nearest = segments.map(edges => edges.sort((a, b) => Math.hypot(a.a.x-anchor.x,a.a.z-anchor.z)-Math.hypot(b.a.x-anchor.x,b.a.z-anchor.z))[0])
  if (nearest.some(edge => !edge || Math.min(Math.hypot(edge.a.x-anchor.x,edge.a.z-anchor.z),Math.hypot(edge.b.x-anchor.x,edge.b.z-anchor.z)) > 45)) return undefined
  const a = nearest[0], sign = a.b.x >= a.a.x ? 1 : -1, length = Math.hypot(a.b.x-a.a.x,a.b.z-a.a.z)
  if (length < .01) return undefined
  const inward = { x: sign*(a.b.x-a.a.x)/length, z: sign*(a.b.z-a.a.z)/length }, across = { x: -inward.z, z: inward.x }
  const target = { x: anchor.x+inward.x*4, z: anchor.z+inward.z*4 }
  const projected = nearest.map(({ a, b }) => {
    const dx=b.x-a.x,dz=b.z-a.z,denominator=dx*inward.x+dz*inward.z
    if (Math.abs(denominator)<.01) return null
    const t=((target.x-a.x)*inward.x+(target.z-a.z)*inward.z)/denominator
    return { x:a.x+dx*t,z:a.z+dz*t }
  })
  if (!projected[0] || !projected[1]) return undefined
  const center = { x:(projected[0].x+projected[1].x)/2,z:(projected[0].z+projected[1].z)/2 }
  const laneOffsets=projected.map(p=>(p!.x-center.x)*across.x+(p!.z-center.z)*across.z), laneWidths=pair.map(road=>road!.width)
  if (Math.abs(laneOffsets[0]-laneOffsets[1]) < 4 || Math.abs(laneOffsets[0]-laneOffsets[1]) > 20) return undefined
  const halfSpan=Math.max(...laneOffsets.map((offset,i)=>Math.abs(offset)+laneWidths[i]/2))+2.7
  const solids: EntranceSolid[]=[]
  for (const side of [-1,1]) {
    solids.push({u:0,v:side*halfSpan,length:2.6,width:1.8,height:5.85,kind:'pier'})
    solids.push({u:6.2,v:side*(halfSpan+2.8),length:9.6,width:.65,height:1.35,kind:'wall'})
    solids.push({u:11,v:side*(halfSpan+2.8),length:1.25,width:1.25,height:2.65,kind:'pier'})
    for (const u of [6,17,24]) solids.push({u,v:side*(halfSpan-1),length:.19,width:.19,height:.7,kind:'bollard'})
  }
  return { center,inward,across,angle:Math.atan2(inward.z,inward.x),laneOffsets,laneWidths,halfSpan,clearance:5.85,solids,
    clearing:{x:center.x+inward.x*10,z:center.z+inward.z*10,halfX:22,halfZ:halfSpan+8} }
}
export function entrancePoint(layout: MainEntranceLayout,u: number,v: number): LocalCoordinate {
  return {x:layout.center.x+layout.inward.x*u+layout.across.x*v,z:layout.center.z+layout.inward.z*u+layout.across.z*v}
}
export function entranceCoordinates(layout: MainEntranceLayout,point: LocalCoordinate) {
  const dx=point.x-layout.center.x,dz=point.z-layout.center.z
  return {u:dx*layout.inward.x+dz*layout.inward.z,v:dx*layout.across.x+dz*layout.across.z}
}
export function mainEntranceCamera(layout: MainEntranceLayout,terrain: TerrainModel,aspect=1.5) {
  const distance=Math.max(43,(layout.halfSpan*2+16)/(2*Math.tan(Math.PI/8)*Math.max(.35,Math.min(1.5,aspect))))
  const eye=entrancePoint(layout,-distance,distance*.2),target=entrancePoint(layout,1,0)
  const y=terrainHeightAt(terrain,layout.center.x,layout.center.z)
  return {position:[eye.x,y+distance*.28,eye.z] as [number,number,number],target:[target.x,y+3,target.z] as [number,number,number]}
}
// Trim the same actual opening from the boundary plinth, walls and posts.
// Skipping only segment centres can leave a strip across the road or a wall end
// intruding into the pedestrian approach.
export function entranceBoundaryPaths(points: LocalCoordinate[],anchor: LocalCoordinate,radius=16): LocalCoordinate[][] {
  const paths: LocalCoordinate[][]=[]
  for(let i=1;i<points.length;i++) {
    const a=points[i-1],b=points[i],dx=b.x-a.x,dz=b.z-a.z,A=dx*dx+dz*dz
    if(A<1e-8)continue
    const px=a.x-anchor.x,pz=a.z-anchor.z,B=2*(px*dx+pz*dz),C=px*px+pz*pz-radius*radius,D=B*B-4*A*C
    const point=(t:number)=>({x:a.x+dx*t,z:a.z+dz*t})
    if(D<=0) { paths.push([a,b]);continue }
    const enter=Math.max(0,(-B-Math.sqrt(D))/(2*A)),exit=Math.min(1,(-B+Math.sqrt(D))/(2*A))
    if(enter>=exit){paths.push([a,b]);continue}
    if(enter>0)paths.push([a,point(enter)])
    if(exit<1)paths.push([point(exit),b])
  }
  return paths
}
export function entranceBlocksWalking(point: LocalCoordinate,layout: MainEntranceLayout,radius: number): boolean {
  const {u,v}=entranceCoordinates(layout,point)
  return layout.solids.some(solid=>Math.hypot(Math.max(0,Math.abs(u-solid.u)-solid.length/2),Math.max(0,Math.abs(v-solid.v)-solid.width/2))<radius+(solid.kind==='pier'?.12:0))
}
export function entranceBlocksCamera(point: LocalCoordinate & {y:number},layout: MainEntranceLayout,terrain: TerrainModel): boolean {
  const local=entranceCoordinates(layout,point),floor=terrainHeightAt(terrain,point.x,point.z)
  return layout.solids.some(solid=>Math.abs(local.u-solid.u)<solid.length/2+.2&&Math.abs(local.v-solid.v)<solid.width/2+.2&&point.y<floor+solid.height+.2)
    || (Math.abs(local.u)<2.6&&Math.abs(local.v)<layout.halfSpan+1.6&&point.y>floor+layout.clearance-.2&&point.y<floor+7.4)
}
export function createEntrancePlanting(layout: MainEntranceLayout,terrain: TerrainModel,boundary: LocalCoordinate[]) {
  const gardens: CampusGardens={beds:[],flowers:[],shrubs:[]}, palms: TreeInstance[]=[]
  const colors=['#ffb634','#f3dab0','#ed8da6','#fff2dc']
  // Soft planting only: no raised curb or hidden collision across a lane.
  for (const v of [-layout.halfSpan+.2,0,layout.halfSpan-.2]) {
    // The mapped cross-link between lanes is about 16 m inside the gateway.
    // End the median garden before it, leaving the turning connection open.
    const center=entrancePoint(layout,v===0?8:14,v),bed={...center,id:`entry/${v}`,angle:layout.angle,length:v===0?8.2:12,width:v===0?2.2:1.7,palette:'warm' as const}
    gardens.beds.push(bed)
    for(let i=0;i<48;i++) {
      const point=gardenPoint(bed,(i%16/15-.5)*(bed.length-.6),(Math.floor(i/16)-1)*bed.width*.3)
      if (!pointInCampus(point,boundary) || entranceBlocksWalking(point,layout,.5)) continue
      gardens.flowers.push({...point,y:terrainHeightAt(terrain,point.x,point.z),height:.3+(i%3)*.07,radius:.15,rotation:i*2.4,color:colors[i%colors.length]})
    }
    for(let i=0;i<8;i++) {
      const point=gardenPoint(bed,(i-3.5)*(bed.length-.8)/7,0)
      gardens.shrubs.push({...point,y:terrainHeightAt(terrain,point.x,point.z),height:.38,radius:.36,rotation:layout.angle,color:'#47733e'})
    }
  }
  for(const u of [8,20])for(const side of [-1,1]) {
    const point=entrancePoint(layout,u,side*(layout.halfSpan+5.4))
    if(pointInCampus(point,boundary))palms.push({...point,y:terrainHeightAt(terrain,point.x,point.z),scale:.92,rotation:side*.8,palm:true,shade:.88})
  }
  return {gardens,palms}
}
