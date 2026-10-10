import { memo, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { PointLight, CanvasTexture, InstancedMesh, Object3D, Path, ShapeUtils, Vector2 } from 'three'
import { buildingShape } from '../lib/buildingGeometry'
import { classroomFurniture, readingFurniture, interiorFloorPlan, interiorRoomLabel } from '../lib/hostelInterior'
import type { HostelPlan } from '../lib/hostelInterior'
import type { LocalCoordinate } from '../lib/geo'

interface Box { x:number; y:number; z:number; width:number; height:number; depth:number; angle?:number }
function Boxes({ boxes, color, glow=false }: { boxes:Box[];color:string;glow?:boolean }) {
  const ref=useRef<InstancedMesh>(null)
  useLayoutEffect(()=> {const dummy=new Object3D();boxes.forEach((box,i)=> {
    dummy.position.set(box.x,box.y,box.z);dummy.rotation.set(0,box.angle??0,0);dummy.scale.set(box.width,box.height,box.depth);dummy.updateMatrix();ref.current?.setMatrixAt(i,dummy.matrix)
  });if(ref.current){ref.current.instanceMatrix.needsUpdate=true;ref.current.computeBoundingSphere()}},[boxes])
  return <instancedMesh ref={ref} args={[undefined,undefined,boxes.length]} castShadow={!glow} receiveShadow><boxGeometry /><meshStandardMaterial color={color} emissive={glow?'#ffe9bb':'#000000'} emissiveIntensity={glow?1.2:0} roughness={.9} /></instancedMesh>
}
function Plaque({ text,point,y,normal,width=1.5 }: {text:string;point:LocalCoordinate;y:number;normal:LocalCoordinate;width?:number}) {
  const texture=useMemo(()=> {const canvas=document.createElement('canvas');canvas.width=512;canvas.height=128;const context=canvas.getContext('2d')!;context.fillStyle='#235b55';context.fillRect(0,0,512,128);context.strokeStyle='#ddb46b';context.lineWidth=8;context.strokeRect(4,4,504,120);context.fillStyle='#fff4d4';context.font='bold 40px sans-serif';context.textAlign='center';context.textBaseline='middle';context.fillText(text,256,64,480);return new CanvasTexture(canvas)},[text])
  useEffect(()=>()=>texture.dispose(),[texture])
  return <mesh position={[point.x,y,point.z]} rotation={[0,Math.atan2(normal.x,normal.z),0]}><planeGeometry args={[width,width/4]} /><meshBasicMaterial map={texture} /></mesh>
}
const Floor = memo(function Floor({ plan:rootPlan,level }: {plan:HostelPlan;level:number}) {
  const plan=interiorFloorPlan(rootPlan,level)
  const shape=useMemo(()=> {const shape=buildingShape(plan.building);if(level>0){let points=plan.stairs.hole.map(p=>new Vector2(p.x,-p.z));if(ShapeUtils.isClockWise(points))points=points.reverse();shape.holes.push(new Path(points))}return shape},[plan,level])
  const y=plan.base+level*plan.floorHeight+.14
  const floorExtrusion=useMemo(()=>({depth:.14,bevelEnabled:false}),[])
  const walls=useMemo(()=>[
    ...plan.walls.filter(w=>w.kind!=='rail').map(wall=> {const length=Math.hypot(wall.b.x-wall.a.x,wall.b.z-wall.a.z);return {x:(wall.a.x+wall.b.x)/2,z:(wall.a.z+wall.b.z)/2,y:y+1.35,width:length,height:2.7,depth:.18,angle:-Math.atan2(wall.b.z-wall.a.z,wall.b.x-wall.a.x)}}),
    ...[...plan.rooms,...(plan.readingRoom?[plan.readingRoom]:[])].map(room=>({x:room.door.x,z:room.door.z,y:y+2.4,width:1.44,height:.6,depth:.18,angle:-Math.atan2(room.along.z,room.along.x)})),
    {x:plan.entrance.point.x,z:plan.entrance.point.z,y:y+(level===0?2.4:1.35),width:2.2,height:level===0?.6:2.7,depth:.18,angle:-Math.atan2(plan.entrance.along.z,plan.entrance.along.x)},
    ...(plan.courtyardWalkable?plan.courtyards??[]:[]).map(c=>({x:c.point.x,z:c.point.z,y:y+2.4,width:c.width,height:.6,depth:.18,angle:-Math.atan2(c.along.z,c.along.x)})),
  ],[plan,y,level])
  const rails=useMemo(()=>plan.walls.filter(w=>w.kind==='rail').map(wall=>({x:(wall.a.x+wall.b.x)/2,z:(wall.a.z+wall.b.z)/2,y:y+.55,width:Math.hypot(wall.b.x-wall.a.x,wall.b.z-wall.a.z),height:1.1,depth:.1,angle:-Math.atan2(wall.b.z-wall.a.z,wall.b.x-wall.a.x)})),[plan,y])
  const furnishings=useMemo(()=> {
    const frame:Box[]=[],mattress:Box[]=[],pillows:Box[]=[],desks:Box[]=[],wardrobes:Box[]=[],rugs:Box[]=[]
    for(const room of plan.kind==='classroom'?[]:plan.rooms){const angle=-Math.atan2(room.along.z,room.along.x)
      frame.push({x:room.bed.x,z:room.bed.z,y:y+.22,width:1,height:.44,depth:2,angle})
      mattress.push({x:room.bed.x,z:room.bed.z,y:y+.49,width:.98,height:.12,depth:1.98,angle})
      pillows.push({x:room.bed.x-room.inward.x*.7,z:room.bed.z-room.inward.z*.7,y:y+.59,width:.75,height:.12,depth:.4,angle})
      desks.push({x:room.desk.x,z:room.desk.z,y:y+.4,width:.8,height:.8,depth:1.1,angle})
      wardrobes.push({x:room.center.x+room.along.x*1.35+room.inward.x*1.1,z:room.center.z+room.along.z*1.35+room.inward.z*1.1,y:y+.9,width:.65,height:1.8,depth:.75,angle})
      rugs.push({x:room.center.x,z:room.center.z,y:y+.008,width:room.width-.3,height:.015,depth:room.depth-.3,angle})
    }return {frame,mattress,pillows,desks,wardrobes,rugs}
  },[plan,y])
  return <group>
    <mesh position={[0,y-.14,0]} rotation={[-Math.PI/2,0,0]} receiveShadow><extrudeGeometry args={[shape,floorExtrusion]} /><meshStandardMaterial color={level%2?'#cbd5cc':'#ddd5c4'} roughness={.9} /></mesh>
    <Boxes boxes={walls} color="#efe6d4" /><Boxes boxes={rails} color="#718a80" />
    <Boxes boxes={furnishings.rugs} color="#d6ded4" /><Boxes boxes={furnishings.frame} color="#ac855b" /><Boxes boxes={furnishings.mattress} color="#668f91" /><Boxes boxes={furnishings.pillows} color="#faf2df" /><Boxes boxes={furnishings.desks} color="#c69d6a" /><Boxes boxes={furnishings.wardrobes} color="#a08464" />
    {plan.kind==='classroom'&&<ClassroomFitout plan={plan} y={y} />}
    {plan.lifts&&<HostelLobbyFitout plan={plan} y={y} level={level}/>}
    {[...plan.rooms,...(plan.readingRoom?[plan.readingRoom]:[])].map(room=><Plaque key={room.id} text={interiorRoomLabel(plan,level,room.id)} point={{x:room.door.x+room.inward.x*.11,z:room.door.z+room.inward.z*.11}} normal={room.inward} y={y+2.35} />)}
    <Plaque text={plan.kind==='classroom'?(level===0?'GYAN MANDIR · EXIT':`FLOOR ${level} · ${level===1?'16–45':'46–75'}`):level===0?'TALPONA · EXIT':`FLOOR ${level} · DEMO`} point={{x:plan.entrance.point.x+plan.entrance.inward.x*.12,z:plan.entrance.point.z+plan.entrance.inward.z*.12}} normal={plan.entrance.inward} y={y+2.35} width={2.2} />
  </group>
})
function HostelLobbyFitout({plan,y,level}:{plan:HostelPlan;y:number;level:number}) {
  const fittings=useMemo(()=>{
    const bodies:Box[]=[],doors:Box[]=[],frames:Box[]=[],buttons:Box[]=[],paths:Box[]=[],lights:Box[]=[]
    for(const lift of plan.lifts??[]) {
      const angle=-Math.atan2(lift.along.z,lift.along.x),front={x:lift.center.x+lift.facing.x*(lift.depth/2+.025),z:lift.center.z+lift.facing.z*(lift.depth/2+.025)}
      bodies.push({...lift.center,y:y+1.4,width:lift.width,height:2.8,depth:lift.depth,angle})
      for(const side of [-1,1])doors.push({x:front.x+lift.along.x*side*.38,z:front.z+lift.along.z*side*.38,y:y+1.12,width:.74,height:2.24,depth:.035,angle})
      frames.push({...front,y:y+2.35,width:1.72,height:.14,depth:.1,angle})
      buttons.push({x:front.x+lift.along.x*.9,z:front.z+lift.along.z*.9,y:y+1.15,width:.12,height:.25,depth:.06,angle})
      lights.push({...front,y:y+2.65,width:1.5,height:.05,depth:.08,angle})
    }
    for(const corridor of plan.corridors??[])for(let i=1;i<corridor.points.length;i++) {
      const a=corridor.points[i-1],b=corridor.points[i],length=Math.hypot(b.x-a.x,b.z-a.z),angle=-Math.atan2(b.z-a.z,b.x-a.x)
      paths.push({x:(a.x+b.x)/2,z:(a.z+b.z)/2,y:y+.008,width:length,height:.012,depth:corridor.width,angle})
      lights.push({x:(a.x+b.x)/2,z:(a.z+b.z)/2,y:y+2.85,width:1.1,height:.035,depth:.3,angle})
    }
    return {bodies,doors,frames,buttons,paths,lights}
  },[plan,y])
  return <group name="hostel-lobby-four-lifts-and-corridors">
    <Boxes boxes={fittings.paths} color="#cad7ce"/>
    <Boxes boxes={fittings.bodies} color="#e2d9c6"/><Boxes boxes={fittings.doors} color="#849698"/><Boxes boxes={fittings.frames} color="#3d5b56"/><Boxes boxes={fittings.buttons} color="#d8bf7b" glow/><Boxes boxes={fittings.lights} color="#fff3d0" glow/>
    {(plan.lifts??[]).map(lift=><Plaque key={lift.id} text={`LIFT ${lift.id} · ${level===0?'G':level}`} point={{x:lift.center.x+lift.facing.x*1.06,z:lift.center.z+lift.facing.z*1.06}} normal={lift.facing} y={y+2.52} width={1.5}/>)}
    {(plan.corridors??[]).map(c=>{
      const a=c.points[0],b=c.points[1],length=Math.hypot(b.x-a.x,b.z-a.z),normal={x:(a.x-b.x)/length,z:(a.z-b.z)/length}
      return <Plaque key={c.id} text={c.name.toUpperCase()} point={a} normal={normal} y={y+2.55} width={2.6}/>
    })}
    {plan.courtyardWalkable&&(plan.courtyards??[]).map(c=><Plaque key={c.id} text={c.id==='plain'?'OPEN COURTYARD':'BADMINTON COURTYARD'} point={{x:c.point.x-c.inward.x*.12,z:c.point.z-c.inward.z*.12}} normal={{x:-c.inward.x,z:-c.inward.z}} y={y+2.4} width={c.width}/>)}
  </group>
}
function ClassroomFitout({plan,y}:{plan:HostelPlan;y:number}) {
  const furniture=useMemo(()=> {
    const wood:Box[]=[],metal:Box[]=[],seats:Box[]=[],shelves:Box[]=[],books:Box[]=[]
    for(const room of [...plan.rooms,...(plan.readingRoom?[plan.readingRoom]:[])]) {
      const angle=-Math.atan2(room.along.z,room.along.x)
      for(const item of room.id==='reading'?readingFurniture(room):classroomFurniture(room)) {
        const box={x:item.point.x,z:item.point.z,angle,width:item.width,depth:item.depth}
        if(item.kind==='chair') {
          seats.push({...box,y:y+.44,height:.07},{...box,x:box.x+room.inward.x*.19,z:box.z+room.inward.z*.19,y:y+.7,height:.48,depth:.07})
          metal.push({...box,y:y+.21,height:.42,width:.07,depth:.07})
        } else if(item.kind==='shelf') {
          shelves.push({...box,y:y+.9,height:1.8})
          for(let i=0;i<12;i++)books.push({...box,x:box.x-room.along.x*.31,z:box.z+(i%6-2.5)*.7,y:y+.55+Math.floor(i/6)*.7,width:.13,height:.45,depth:.35})
        } else {
          wood.push({...box,y:y+.77,height:.08})
          for(const side of [-1,1])metal.push({...box,x:box.x+room.along.x*side*(box.width/2-.12),z:box.z+room.along.z*side*(box.width/2-.12),y:y+.36,height:.72,width:.07,depth:Math.max(.1,box.depth-.16)})
        }
      }
    }
    return {wood,metal,seats,shelves,books}
  },[plan,y])
  return <group name="classrooms-and-reading-room">
    <Boxes boxes={furniture.wood} color="#bc956c"/><Boxes boxes={furniture.metal} color="#5d6d68"/><Boxes boxes={furniture.seats} color="#3e7a75"/><Boxes boxes={furniture.shelves} color="#a87b53"/><Boxes boxes={furniture.books} color="#d4bd80"/>
    {plan.rooms.map(room=><Plaque key={room.id} text={`NIT GOA · CLASS ${room.id}`} point={{x:room.center.x-room.inward.x*(room.depth/2-.15),z:room.center.z-room.inward.z*(room.depth/2-.15)}} normal={room.inward} y={y+1.65} width={3} />)}
    {plan.readingRoom&&<Plaque text="READING ROOM · QUIET STUDY" point={{x:plan.readingRoom.center.x,z:plan.readingRoom.center.z-plan.readingRoom.depth/2+.15}} normal={plan.readingRoom.inward} y={y+1.8} width={5}/>}
  </group>
}
function StairFlight({plan,level}:{plan:HostelPlan;level:number}) {
  // Thin treads leave headroom below the next stacked flight; solid wedges
  // would enclose the avatar while it climbs the lower staircase.
  const steps=useMemo(()=>Array.from({length:20},(_,i)=> {const t=(i+.5)/20,top=(i+1)/20*plan.floorHeight,height=plan.floorHeight/20;return {x:plan.stairs.start.x+plan.stairs.along.x*t*plan.stairs.length,z:plan.stairs.start.z+plan.stairs.along.z*t*plan.stairs.length,y:plan.base+level*plan.floorHeight+.14+top-height/2,width:plan.stairs.width,height,depth:plan.stairs.length/20,angle:Math.atan2(plan.stairs.along.x,plan.stairs.along.z)}}),[plan,level])
  return <Boxes boxes={steps} color="#a8b3a8" />
}
function InteriorNightLights({root,floor}:{root:HostelPlan;floor:number}) {
  const plan=interiorFloorPlan(root,floor), lights=useRef<(PointLight|null)[]>([]),elapsed=useRef(1)
  const panels=useMemo(()=>[...[...plan.rooms,...(plan.readingRoom?[plan.readingRoom]:[])].map(room=>({x:room.center.x,z:room.center.z,y:plan.base+(floor+1)*plan.floorHeight-.07,width:1.1,height:.035,depth:.35,angle:-Math.atan2(room.along.z,room.along.x)})),...(plan.lifts??[]).map(lift=>({x:lift.landing.x,z:lift.landing.z,y:plan.base+(floor+1)*plan.floorHeight-.07,width:1.1,height:.035,depth:.35,angle:0}))],[plan,floor])
  const sources=useMemo(()=>[...panels,{...plan.entrance.inside,y:plan.base+(floor+1)*plan.floorHeight-.07},{...plan.stairs.start,y:plan.base+(floor+1)*plan.floorHeight-.07}], [panels,plan,floor])
  useFrame(({camera},delta)=>{elapsed.current+=delta;if(elapsed.current<.2)return;elapsed.current=0
    const closest=[...sources].sort((a,b)=>Math.hypot(a.x-camera.position.x,a.z-camera.position.z)-Math.hypot(b.x-camera.position.x,b.z-camera.position.z)).slice(0,2)
    closest.forEach((p,i)=>{const light=lights.current[i];if(light)light.position.set(p.x,p.y-.12,p.z)})
  })
  return <group name="interior-night-lights">
    <Boxes boxes={panels} color="#fff3d0" glow/>
    {[0,1].map(i=><pointLight key={i} ref={value=>{lights.current[i]=value}} intensity={35} color="#fff0cd" distance={12} decay={2} castShadow={false}/>)}
  </group>
}
function BuildingInterior({plan,floor,stairLowFloor,onSelect,night=false}:{night?:boolean;plan:HostelPlan;floor:number|null;stairLowFloor:number|null;onSelect:()=>void}) {
  if(floor===null) return <group name="interior-entry-sign" onClick={event=>{event.stopPropagation();if(event.delta<=2)onSelect()}}>
    <Plaque text={plan.kind==='classroom'?'GYAN MANDIR · ENTER':'TALPONA · DEMO ENTRY'} point={{x:plan.entrance.point.x-plan.entrance.inward.x*.13,z:plan.entrance.point.z-plan.entrance.inward.z*.13}} normal={{x:-plan.entrance.inward.x,z:-plan.entrance.inward.z}} y={plan.base+2.55} width={2.5} />
  </group>
  const levels=stairLowFloor===null?[floor]:[stairLowFloor,stairLowFloor+1]
  const flights=[...new Set(levels.flatMap(level=>[level-1,level]))].filter(level=>level>=0&&level<plan.levels-1)
  return <group name={plan.kind==='classroom'?'gyan-mandir-interior':'boys-hostel-approximate-interior'} onClick={event=> {event.stopPropagation();if(event.delta<=2)onSelect()}}>
    {levels.map(level=><Floor key={level} plan={plan} level={level} />)}
    {flights.map(level=><StairFlight key={level} plan={plan} level={level} />)}
    {night&&<InteriorNightLights root={plan} floor={floor}/>}
    <ambientLight intensity={night?.45:.28} color="#fff4db" />
  </group>
}

export default memo(BuildingInterior)
