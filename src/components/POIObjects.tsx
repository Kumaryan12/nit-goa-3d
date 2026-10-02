import { useEffect, useMemo } from 'react'
import { createRoadGeometry } from '../lib/roadGeometry'
import type { TerrainModel } from '../lib/terrain'
import type { CampusLocation } from '../types/campus'
import type { RoadFootprint } from '../types/osm'

function Goal({ x }: { x: number }) {
  return <group position={[x, 0.14, 0]}>
    {[-3.6, 3.6].map((z) => <mesh key={z} position={[0, 1.25, z]} castShadow><boxGeometry args={[0.16, 2.5, 0.16]} /><meshStandardMaterial color="#f6f2df" roughness={0.6} /></mesh>)}
    <mesh position={[0, 2.5, 0]} castShadow><boxGeometry args={[0.16, 0.16, 7.35]} /><meshStandardMaterial color="#f6f2df" roughness={0.6} /></mesh>
  </group>
}

export default function POIObjects({ locations, roads, terrain }: { locations: CampusLocation[]; roads: RoadFootprint[]; terrain?: TerrainModel }) {
  const sports = locations.find((location) => location.id === 'sports-ground')!
  const entrance = locations.find((location) => location.id === 'main-entrance')!
  const pathway = useMemo(() => {
    const start = entrance.coordinates
    let end = { x: start.x + 20, z: start.z }
    let distance = Infinity
    for (const road of roads) for (const path of road.paths) for (let i = 1; i < path.length; i++) {
      const a = path[i - 1], b = path[i], dx = b.x - a.x, dz = b.z - a.z
      const t = Math.max(0, Math.min(1, ((start.x - a.x) * dx + (start.z - a.z) * dz) / (dx * dx + dz * dz || 1)))
      const candidate = { x: a.x + dx * t, z: a.z + dz * t }
      const d = Math.hypot(candidate.x - start.x, candidate.z - start.z)
      if (d < distance) { distance = d; end = candidate }
    }
    // Connect the illustrative gate to the nearest real road when available.
    return createRoadGeometry([[start, end]], 5, 0.1, terrain)
  }, [entrance, roads, terrain])
  useEffect(() => () => pathway.dispose(), [pathway])
  return <group>
    <group position={[sports.coordinates.x, sports.elevation ?? 0, sports.coordinates.z]} rotation={[0, (sports.rotationDegrees ?? 0) * Math.PI / 180, 0]} name="sports-ground">
      <mesh position={[0, 0.055, 0]} receiveShadow><boxGeometry args={[90, 0.1, 50]} /><meshStandardMaterial color="#648c47" roughness={1} /></mesh>
      {[-22, 22].map((z) => <mesh key={`side${z}`} position={[0, 0.12, z]}><boxGeometry args={[84, 0.025, 0.22]} /><meshStandardMaterial color="#f5f2df" /></mesh>)}
      {[-42, 0, 42].map((x) => <mesh key={`line${x}`} position={[x, 0.12, 0]}><boxGeometry args={[0.22, 0.025, 44]} /><meshStandardMaterial color="#f5f2df" /></mesh>)}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.135, 0]}><ringGeometry args={[6.8, 7, 48]} /><meshStandardMaterial color="#f5f2df" /></mesh>
      <Goal x={-42} /><Goal x={42} />
    </group>
    <mesh geometry={pathway} receiveShadow><meshStandardMaterial color="#c7bca5" roughness={1} polygonOffset polygonOffsetFactor={-1} /></mesh>
    <group position={[entrance.coordinates.x, entrance.elevation ?? 0, entrance.coordinates.z]} rotation={[0, (entrance.rotationDegrees ?? 0) * Math.PI / 180, 0]} name="main-entrance">
      {[-6, 6].map((z) => <mesh key={z} position={[0, 2.6, z]} castShadow receiveShadow><boxGeometry args={[1.3, 5.2, 1.3]} /><meshStandardMaterial color="#e2d3b6" roughness={1} /></mesh>)}
      <mesh position={[0, 5.1, 0]} castShadow><boxGeometry args={[1.6, 1.1, 14]} /><meshStandardMaterial color="#a65a3b" roughness={1} /></mesh>
    </group>
  </group>
}
