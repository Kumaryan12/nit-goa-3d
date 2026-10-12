import { memo, useEffect, useMemo } from 'react'
import type { CafeLayout } from '../lib/cafe'
import { createCafeGeometry } from '../lib/cafeGeometry'
import type { TerrainModel } from '../lib/terrain'
import { Sign } from './BuildingFacadeParts'

function CampusCafe({ cafe, terrain, night }: { cafe: CafeLayout; terrain: TerrainModel; night: boolean }) {
  const geometry = useMemo(() => createCafeGeometry(cafe, terrain), [cafe, terrain])
  useEffect(() => () => { Object.values(geometry).forEach(part => part.dispose()) }, [geometry])
  return <group name="nescafe-social-terrace">
    <mesh geometry={geometry.pavement} receiveShadow><meshStandardMaterial color="#d8c6a5" roughness={.95} emissive="#d6a35d" emissiveIntensity={night ? .18 : 0} /></mesh>
    <mesh geometry={geometry.solid} castShadow receiveShadow><meshStandardMaterial vertexColors roughness={.8} emissive="#bb8950" emissiveIntensity={night ? .035 : 0} /></mesh>
    <mesh geometry={geometry.glass}><meshStandardMaterial vertexColors roughness={.28} metalness={.2} emissive="#ffd092" emissiveIntensity={night ? .32 : 0} /></mesh>
    <mesh geometry={geometry.glow}><meshStandardMaterial vertexColors emissive="#ffca75" emissiveIntensity={night ? 2.2 : .05} toneMapped={!night} /></mesh>
    <group position={[cafe.front.center.x, cafe.base, cafe.front.center.z]} rotation={[0, cafe.front.angle, 0]}>
      <Sign text="NESCAFÉ" width={5.2} height={.62} position={[0, 3.08, .30]} color="#fff6e5" />
    </group>
    <group position={[cafe.terrace.center.x, cafe.base, cafe.terrace.center.z]} rotation={[0, cafe.terrace.angle, 0]}>
      <Sign text="NESCAFÉ" width={4.6} height={.52} position={[0, 2.91, .25]} color="#f5e5c7" />
    </group>
  </group>
}
export default memo(CampusCafe)
