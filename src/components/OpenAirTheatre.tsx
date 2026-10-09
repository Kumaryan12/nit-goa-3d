import { useEffect, useMemo, useState } from 'react'
import { DoubleSide } from 'three'
import type { ThreeEvent } from '@react-three/fiber'
import type { TheatreLayout } from '../lib/theatre'
import { createTheatreSectorGeometry, THEATRE_AISLE_HALF_WIDTH, THEATRE_INNER_RADIUS, THEATRE_OUTER_RADIUS, THEATRE_RISE, THEATRE_ROWS, THEATRE_TREAD } from '../lib/theatre'
import { createRoadGeometry } from '../lib/roadGeometry'
import type { TerrainModel } from '../lib/terrain'

export default function OpenAirTheatre({ theatre, terrain, selected, night, onSelect }: {
  theatre: TheatreLayout; terrain: TerrainModel; selected: boolean; night: boolean; onSelect: () => void
}) {
  const [hovered, setHovered] = useState(false)
  const geometry = useMemo(() => {
    const tiers = Array.from({ length: THEATRE_ROWS }, (_, row) => {
      const inner = THEATRE_INNER_RADIUS + row * THEATRE_TREAD, outer = inner + THEATRE_TREAD
      const end = Math.acos(THEATRE_AISLE_HALF_WIDTH / inner), seatStart = Math.asin(.9 / inner)
      return { height: (row + 1) * THEATRE_RISE,
        steps: [createTheatreSectorGeometry(inner, outer, (row + 1) * THEATRE_RISE, 0, end), createTheatreSectorGeometry(inner, outer, (row + 1) * THEATRE_RISE, Math.PI - end, Math.PI)],
        benches: [createTheatreSectorGeometry(inner + .48, outer - .04, .22, seatStart, end), createTheatreSectorGeometry(inner + .48, outer - .04, .22, Math.PI - end, Math.PI - seatStart)] }
    })
    return { tiers, access: createRoadGeometry([theatre.access], 2.4, .09, terrain) }
  }, [theatre, terrain])
  useEffect(() => () => { geometry.tiers.forEach(tier => [...tier.steps, ...tier.benches].forEach(mesh => mesh.dispose())); geometry.access.dispose() }, [geometry])
  const choose = (event: ThreeEvent<MouseEvent>) => { event.stopPropagation(); if (event.delta <= 2) onSelect() }
  const plaza = hovered ? '#d2cbb8' : '#c7bea9'
  return <group name="open-air-theatre" onClick={choose} onPointerOver={event => { event.stopPropagation(); setHovered(true) }} onPointerOut={() => setHovered(false)}>
    <mesh geometry={geometry.access} receiveShadow><meshStandardMaterial color="#c8bea6" roughness={1} /></mesh>
    <group position={[theatre.center.x, theatre.elevation, theatre.center.z]} rotation={[0, theatre.rotation, 0]} scale={[theatre.widthScale, 1, theatre.depthScale]}>
      <mesh position={[0, .035, 4.75]} receiveShadow><boxGeometry args={[23, .09, 19.5]} /><meshStandardMaterial color={plaza} roughness={1} /></mesh>
      {selected && <group>
        {[-11.4, 11.4].map(x => <mesh key={`edge-x-${x}`} position={[x, .088, 4.75]}><boxGeometry args={[.12, .02, 19.3]} /><meshBasicMaterial color="#dca255" /></mesh>)}
        {[-4.9, 14.4].map(z => <mesh key={`edge-z-${z}`} position={[0, .088, z]}><boxGeometry args={[22.8, .02, .12]} /><meshBasicMaterial color="#dca255" /></mesh>)}
      </group>}
      <mesh position={[0, .305, -2]} castShadow receiveShadow><boxGeometry args={[9.6, .45, 4]} /><meshStandardMaterial color="#ad8060" roughness={.95} /></mesh>
      <mesh position={[0, .54, -2]} receiveShadow><boxGeometry args={[9.7, .035, 4.1]} /><meshStandardMaterial color="#d4b992" roughness={1} /></mesh>
      {/* A shallow ramp gives walking visitors access to the stage. */}
      <mesh position={[0, .305, 1.5]} rotation={[Math.atan(.45 / 3), 0, 0]} receiveShadow>
        <boxGeometry args={[2.2, .04, Math.hypot(3, .45)]} /><meshStandardMaterial color="#bfb59f" roughness={1} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, .088, 0]}><circleGeometry args={[THEATRE_INNER_RADIUS, 64, Math.PI, Math.PI]} /><meshStandardMaterial color="#dfd5be" roughness={1} side={DoubleSide} /></mesh>
      {geometry.tiers.map((tier, row) => <group key={row} position={[0, .08, 0]}>
        {tier.steps.map((mesh, side) => <mesh key={`step-${side}`} geometry={mesh} castShadow receiveShadow><meshStandardMaterial color={row % 2 ? '#c4bba6' : '#cec5b1'} roughness={1} /></mesh>)}
        {tier.benches.map((mesh, side) => <mesh key={`bench-${side}`} geometry={mesh} position={[0, tier.height, 0]} castShadow receiveShadow><meshStandardMaterial color="#ab8466" roughness={1} /></mesh>)}
      </group>)}
      {Array.from({ length: THEATRE_ROWS * 2 }, (_, step) => {
        const height = (step + 1) * THEATRE_RISE / 2
        return <mesh key={step} position={[0, .08 + height / 2, THEATRE_INNER_RADIUS + (step + .5) * THEATRE_TREAD / 2]} receiveShadow castShadow>
          <boxGeometry args={[THEATRE_AISLE_HALF_WIDTH * 2, height, THEATRE_TREAD / 2]} /><meshStandardMaterial color="#e0d7c3" roughness={1} emissive="#cba46b" emissiveIntensity={night?.06:0} />
        </mesh>
      })}
      {/* The reverse flight joins the raised last row to the roadside entrance. */}
      {Array.from({ length: THEATRE_ROWS * 2 }, (_, step) => {
        const height = (THEATRE_ROWS * 2 - step) * THEATRE_RISE / 2
        return <mesh key={`rear-${step}`} position={[0, .08 + height / 2, THEATRE_OUTER_RADIUS + (step + .5) * .3]} receiveShadow>
          <boxGeometry args={[2.4, height, .3]} /><meshStandardMaterial color="#e0d7c3" roughness={1} emissive="#cba46b" emissiveIntensity={night?.06:0} />
        </mesh>
      })}
      {night && Array.from({length:THEATRE_ROWS},(_,row)=><group key={`aisle-light-${row}`} position={[0,.10+(row+1)*THEATRE_RISE,THEATRE_INNER_RADIUS+(row+.8)*THEATRE_TREAD]}>
        {[-1.05,1.05].map(x=><mesh key={x} position={[x,.01,0]} raycast={()=>null}><boxGeometry args={[.10,.018,.24]}/><meshBasicMaterial color="#ffc985" toneMapped={false}/></mesh>)}
      </group>)}
      {[-7, 7].map(x => <group key={x} position={[x, 0, -3]}>
        <mesh position={[0, 2.15, 0]} castShadow><cylinderGeometry args={[.075, .1, 4.3, 8]} /><meshStandardMaterial color="#445a50" roughness={.75} /></mesh>
        <mesh position={[0, 4.35, 0]}><boxGeometry args={[.65, .12, .4]} /><meshStandardMaterial color="#f2e7cb" emissive="#ffe2a3" emissiveIntensity={night ? 2 : 0} /></mesh>
        {night && <pointLight position={[0, 4, 0]} color="#ffe3ad" intensity={150} distance={48} decay={2} />}
      </group>)}
    </group>
  </group>
}
