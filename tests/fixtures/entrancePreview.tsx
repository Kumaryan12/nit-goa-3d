// Local-only review of the production gateway in its actual campus terrain.
import { StrictMode, useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, Sky } from '@react-three/drei'
import { PCFShadowMap } from 'three'
import { createDigitalTwin } from '../../src/lib/digitalTwin'
import { extractBuildingFootprints } from '../../src/lib/buildings'
import { extractCampusRoads } from '../../src/lib/roads'
import { savedCampusOverrides } from '../../src/data/campusOverrides'
import MainEntrance from '../../src/components/MainEntrance'
import CampusGardens from '../../src/components/CampusGardens'
import Terrain from '../../src/components/Terrain'
import OSMRoads from '../../src/components/OSMRoads'
import OSMBuildings from '../../src/components/OSMBuildings'
import CampusBoundary from '../../src/components/CampusBoundary'
import EntranceCanal from '../../src/components/EntranceCanal'
import Vegetation from '../../src/components/Vegetation'
import Lighting from '../../src/components/Lighting'
import CampusStreetlights from '../../src/components/CampusStreetlights'
import ScenePerformance from '../../src/components/ScenePerformance'
import { sceneConfig } from '../../src/lib/sceneConfig'
import { terrainHeightAt } from '../../src/lib/terrain'
import campus from './nit-goa-campus.json'
import source from './nit-goa-roads.json'
const noop=()=>{}
const boundary=source.elements.find(e=>e.id===1259742369)!.geometry
const twin=createDigitalTwin({buildings:extractBuildingFootprints(campus.elements),boundary,source:'campus-area',returnedBuildingCount:22},{roads:extractCampusRoads(source.elements,boundary),boundary,source:'campus-area',returnedRoadCount:20},true,savedCampusOverrides)
const gate=twin.mainEntrance!, ground=terrainHeightAt(twin.terrain,gate.center.x,gate.center.z)
function ReviewCamera({rear}:{rear:boolean}){
 const camera=useThree(s=>s.camera)
 useEffect(()=>{camera.position.set(gate.center.x+(rear?48:-44),ground+12,gate.center.z+(rear?25:23));camera.lookAt(gate.center.x+4,ground+3,gate.center.z)},[camera,rear])
 return <OrbitControls makeDefault target={[gate.center.x+4,ground+3,gate.center.z]} minDistance={4} maxDistance={180}/>
}
function Scene({night,rear,stats}:{night:boolean;rear:boolean;stats:(s:string)=>void}){
 const gl=useThree(s=>s.gl)
 let frames=0
 useFrame(()=>{if(++frames%120===0)stats(`${gl.info.render.calls} draw calls · ${gl.info.render.triangles.toLocaleString()} triangles`)})
 const trees=useMemo(()=>twin.trees.filter(t=>Math.hypot(t.x-gate.center.x,t.z-gate.center.z)<130),[])
 return <>
 <color attach="background" args={[night?'#102235':'#d9e8e1']}/>
 {!night&&<Sky distance={450000} sunPosition={sceneConfig.sunPosition}/>}
 <Lighting groundSize={twin.size} night={night}/><ScenePerformance dynamicShadows={false} revision={night?1:0}/>
 <Terrain model={twin.terrain} onReady={noop}/><OSMRoads roads={twin.roads} terrain={twin.terrain} night={night}/>
 <OSMBuildings buildings={twin.buildings} assignments={twin.selections} night={night} selectedBuildingId={null} onSelectBuilding={noop} onRenderedCount={noop}/>
 <CampusBoundary points={twin.boundary} terrain={twin.terrain} entrance={savedCampusOverrides['main-entrance'].coordinates}/>
 <EntranceCanal canal={twin.canal!} terrain={twin.terrain} night={night}/>
 <Vegetation trees={trees} onReady={noop}/><CampusGardens gardens={twin.entranceGardens!} terrain={twin.terrain}/>
 <CampusStreetlights lamps={twin.lamps} terrain={twin.terrain} night={night}/>
 <MainEntrance layout={gate} terrain={twin.terrain} night={night}/><ReviewCamera rear={rear}/>
 </>
}
function Preview(){const[night,setNight]=useState(false),[rear,setRear]=useState(false),[stats,setStats]=useState('Preparing scene…');return <><header><h1>Main Entrance · production geometry</h1><button onClick={()=>setNight(n=>!n)}>{night?'Day view':'Night view'}</button><button onClick={()=>setRear(r=>!r)}>{rear?'Front view':'Inside campus'}</button><p role="status">{stats}</p></header><Canvas shadows={{type:PCFShadowMap}} dpr={[1,1.5]} camera={{position:[gate.center.x-44,ground+12,gate.center.z+23],fov:45,near:.1,far:3000}}><Scene night={night} rear={rear} stats={setStats}/></Canvas></>}
if(import.meta.env.DEV)createRoot(document.getElementById('root')!).render(<StrictMode><Preview/></StrictMode>)
