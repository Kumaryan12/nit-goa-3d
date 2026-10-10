import { memo, useMemo } from 'react'
import { DoubleSide, Shape } from 'three'
import { gpsToLocal } from '../lib/geo'
import { hostelBadmintonCourt } from '../lib/boysHostelGeometry'
import type { BuildingFootprint } from '../types/osm'

function HostelCourtyards({ building }: { building: BuildingFootprint }) {
  const court = useMemo(() => hostelBadmintonCourt(building), [building])
  const surfaces = useMemo(() => building.holes.map(ring => {
    const shape = new Shape()
    ring.map(gpsToLocal).forEach((p, i) => { if (i === 0) shape.moveTo(p.x, -p.z); else shape.lineTo(p.x, -p.z) })
    return shape
  }), [building])
  const net = useMemo(() => {
    const points: number[] = [], width = 6.1
    for (let x = -width / 2; x <= width / 2 + .001; x += width / 61) points.push(x, .8, 0, x, 1.524, 0)
    for (let y = .8; y <= 1.524; y += .06) points.push(-width / 2, y, 0, width / 2, y, 0)
    return new Float32Array(points)
  }, [])
  const base = building.baseElevation ?? 0
  return <group name="talpona-two-courtyards">
    {surfaces.map((shape, i) => <mesh key={i} position={[0, base + .14, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow><shapeGeometry args={[shape]} /><meshStandardMaterial color="#d4c9b4" roughness={.95} side={DoubleSide} /></mesh>)}
    {court && <group name="southeast-courtyard-badminton" position={[court.center.x, base + .14, court.center.z]} rotation={[0, Math.atan2(court.along.x, court.along.z), 0]}>
      <mesh position={[0, .015, 0]} receiveShadow><boxGeometry args={[court.width + 4, .03, court.length + 4]} /><meshStandardMaterial color="#357f78" roughness={.9} /></mesh>
      <mesh position={[0, .034, 0]} receiveShadow><boxGeometry args={[court.width, .008, court.length]} /><meshStandardMaterial color="#4b9485" roughness={.9} /></mesh>
      {[-3.05, -2.59, 2.59, 3.05].map(x => <mesh key={`side${x}`} position={[x, .045, 0]}><boxGeometry args={[.04, .012, 13.4]} /><meshStandardMaterial color="#fff9e5" /></mesh>)}
      {[-6.7, -5.94, -1.98, 1.98, 5.94, 6.7].map(z => <mesh key={`end${z}`} position={[0, .045, z]}><boxGeometry args={[6.1, .012, .04]} /><meshStandardMaterial color="#fff9e5" /></mesh>)}
      {[-1, 1].map(side => <mesh key={`service${side}`} position={[0, .045, side * 4.34]}><boxGeometry args={[.04, .012, 4.72]} /><meshStandardMaterial color="#fff9e5" /></mesh>)}
      {[-3.05, 3.05].map(x => <mesh key={`post${x}`} position={[x, .81, 0]} castShadow><cylinderGeometry args={[.045, .045, 1.55, 8]} /><meshStandardMaterial color="#31505b" /></mesh>)}
      <lineSegments position={[0, .035, 0]}><bufferGeometry><bufferAttribute attach="attributes-position" args={[net, 3]} /></bufferGeometry><lineBasicMaterial color="#f3ecda" transparent opacity={.7} /></lineSegments>
      <mesh position={[0, 1.579, 0]}><boxGeometry args={[6.1, .04, .03]} /><meshStandardMaterial color="#fff9e5" /></mesh>
    </group>}
  </group>
}

export default memo(HostelCourtyards)
