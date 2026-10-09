import { memo } from 'react'
import type { TerrainModel } from '../lib/terrain'
import type { CampusLocation } from '../types/campus'
import MainEntrance from './MainEntrance'
import CampusGardens from './CampusGardens'
import type { MainEntranceLayout } from '../lib/mainEntrance'
import type { CampusGardens as GardenModel } from '../lib/campusGardens'

function Goal({ x }: { x: number }) {
  return <group position={[x, 0.14, 0]}>
    {[-3.6, 3.6].map((z) => <mesh key={z} position={[0, 1.25, z]} castShadow><boxGeometry args={[0.16, 2.5, 0.16]} /><meshStandardMaterial color={x > 0 ? '#5cadd5' : '#d3b35a'} roughness={0.6} /></mesh>)}
    <group position={[x > 0 ? 1.4 : -1.4, 0, 0]}>
      {Array.from({length:15},(_,i)=><mesh key={`net-v${i}`} position={[0,1.25,-3.6+i*.514]}><boxGeometry args={[.025,2.5,.025]} /><meshStandardMaterial color="#ebe8da" transparent opacity={.55} /></mesh>)}
      {Array.from({length:6},(_,i)=><mesh key={`net-h${i}`} position={[0,i*.5,0]}><boxGeometry args={[.025,.025,7.2]} /><meshStandardMaterial color="#ebe8da" transparent opacity={.55} /></mesh>)}
    </group>
    <mesh position={[0, 2.5, 0]} castShadow><boxGeometry args={[0.16, 0.16, 7.35]} /><meshStandardMaterial color={x > 0 ? '#5cadd5' : '#d3b35a'} roughness={0.6} /></mesh>
  </group>
}

function POIObjects({ locations, terrain, entrance, entranceGardens, night }: { locations: CampusLocation[]; terrain: TerrainModel; entrance?: MainEntranceLayout; entranceGardens?: GardenModel; night: boolean }) {
  const sports = locations.find((location) => location.id === 'sports-ground')!
  return <group>
    <group position={[sports.coordinates.x, sports.elevation ?? 0, sports.coordinates.z]} rotation={[0, (sports.rotationDegrees ?? 0) * Math.PI / 180, 0]} name="sports-ground">
      <mesh position={[0, 0.055, 0]} receiveShadow><boxGeometry args={[90, 0.1, 50]} /><meshStandardMaterial color="#648c47" roughness={1} /></mesh>
      {[-22, 22].map((z) => <mesh key={`side${z}`} position={[0, 0.12, z]}><boxGeometry args={[84, 0.025, 0.22]} /><meshStandardMaterial color="#f5f2df" /></mesh>)}
      {[-42, 0, 42].map((x) => <mesh key={`line${x}`} position={[x, 0.12, 0]}><boxGeometry args={[0.22, 0.025, 44]} /><meshStandardMaterial color="#f5f2df" /></mesh>)}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.135, 0]}><ringGeometry args={[6.8, 7, 48]} /><meshStandardMaterial color="#f5f2df" /></mesh>
      <Goal x={-42} /><Goal x={42} />
    </group>
    {entrance && <MainEntrance layout={entrance} terrain={terrain} night={night} />}
    {entranceGardens && <CampusGardens gardens={entranceGardens} terrain={terrain} />}
  </group>
}

export default memo(POIObjects)
