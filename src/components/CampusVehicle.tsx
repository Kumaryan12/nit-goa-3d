import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Quaternion, Vector3 } from 'three'
import type { Group } from 'three'
import StudentAvatar from './StudentAvatar'
import type { AvatarMotion } from '../lib/avatarMotion'
import { motionDelta } from '../lib/avatarMotion'
import { VEHICLES } from '../lib/vehicles'
import type { TransportMode } from '../lib/vehicles'

type Triple = [number, number, number]
function Tube({ a, b, color = '#287e78', radius = .035 }: { a: Triple; b: Triple; color?: string; radius?: number }) {
  const { centre, rotation, length } = useMemo(() => {
    const start = new Vector3(...a), end = new Vector3(...b), direction = end.clone().sub(start)
    return { centre: start.add(end).multiplyScalar(.5), rotation: new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), direction.clone().normalize()), length: direction.length() }
  }, [a, b])
  return <mesh position={centre} quaternion={rotation} castShadow><cylinderGeometry args={[radius, radius, length, 8]} /><meshStandardMaterial color={color} metalness={.3} roughness={.55} /></mesh>
}
function Wheel({ radius, width, car = false }: { radius: number; width: number; car?: boolean }) {
  return <group rotation={[0, Math.PI / 2, 0]}>
    <mesh castShadow><torusGeometry args={[radius - width / 2, width / 2, 6, 20]} /><meshStandardMaterial color="#202c31" roughness={.9} /></mesh>
    <mesh rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[radius * (car ? .58 : .13), radius * (car ? .58 : .13), width + .01, 10]} /><meshStandardMaterial color="#c2cfc9" metalness={.65} roughness={.4} /></mesh>
    {!car && [0, Math.PI / 3, Math.PI * 2 / 3].map(angle => <mesh key={angle} rotation={[0, 0, angle]}><boxGeometry args={[radius * 1.8, .018, .018]} /><meshStandardMaterial color="#b8c5c6" /></mesh>)}
    {car && <mesh position={[0, 0, width / 2 + .012]}><boxGeometry args={[radius * 1.1, .04, .02]} /><meshStandardMaterial color="#748b91" /></mesh>}
  </group>
}
export default function CampusVehicle({ mode, motion, jersey }: { mode: TransportMode; motion: React.RefObject<AvatarMotion>; jersey?: string }) {
  const wheels = useRef<(Group | null)[]>([]), front = useRef<Group>(null), spin = useRef(0)
  useFrame((_, delta) => {
    motion.current.vehicle = mode
    if (mode === 'walk' || motion.current.paused) return
    spin.current -= (motion.current.driveSpeed ?? motion.current.speed ?? 0) * motionDelta(delta) / VEHICLES[mode].wheelRadius
    wheels.current.forEach(wheel => { if (wheel) wheel.rotation.x = spin.current })
    if (front.current) front.current.rotation.y = Math.max(-.38, Math.min(.38, motion.current.turn ?? 0))
  })
  if (mode === 'walk') return <StudentAvatar motion={motion} jersey={jersey} />
  if (mode === 'bicycle') return <group name="campus-bicycle">
    <StudentAvatar motion={motion} jersey={jersey} />
    <group position={[0, 0, -.04]}>
      <group ref={node => { wheels.current[0] = node }} position={[0, .37, .7]}><Wheel radius={.37} width={.055} /></group>
      <group ref={front} position={[0, .37, -.7]}><group ref={node => { wheels.current[1] = node }}><Wheel radius={.37} width={.055} /></group></group>
      {([[[0, .37, .7], [0, .36, .12]], [[0, .36, .12], [0, 1.0, .15]], [[0, 1.0, .15], [0, .37, .7]], [[0, 1.0, .15], [0, .95, -.53]], [[0, .95, -.53], [0, .36, .12]], [[0, .95, -.53], [0, .37, -.7]], [[0, .95, -.53], [0, 1.23, -.52]]] as [Triple, Triple][]).map(([a, b], i) => <Tube key={i} a={a} b={b} />)}
      <Tube a={[-.3, 1.23, -.52]} b={[.3, 1.23, -.52]} color="#bcc8ca" />
      <mesh position={[0, 1.02, .13]} castShadow><boxGeometry args={[.23, .07, .32]} /><meshStandardMaterial color="#343f45" /></mesh>
      <Tube a={[-.19, .36, .12]} b={[.19, .36, .12]} radius={.035} color="#b3bbbc" />
      <mesh position={[0, 1.1, -.58]}><boxGeometry args={[.1, .07, .07]} /><meshStandardMaterial color="#fff2cf" emissive="#fff2cf" emissiveIntensity={1.4} /></mesh>
      <mesh position={[0, .96, .34]}><boxGeometry args={[.08, .05, .035]} /><meshStandardMaterial color="#ff654d" emissive="#ff4029" emissiveIntensity={.8} /></mesh>
    </group>
  </group>
  return <group name="campus-car">
    <mesh position={[0, .6, 0]} castShadow receiveShadow><boxGeometry args={[1.66, .52, 3.5]} /><meshStandardMaterial color="#4b9993" roughness={.55} metalness={.22} /></mesh>
    <mesh position={[0, .93, -1.12]} castShadow><boxGeometry args={[1.6, .14, 1.16]} /><meshStandardMaterial color="#7dbab0" roughness={.5} /></mesh>
    <mesh position={[0, .98, 1.35]} castShadow><boxGeometry args={[1.6, .22, .65]} /><meshStandardMaterial color="#7dbab0" /></mesh>
    <group position={[.34, .23, .05]}><StudentAvatar motion={motion} jersey={jersey} /></group>
    <mesh position={[0, 1.42, -.58]} rotation={[-.2, 0, 0]}><boxGeometry args={[1.47, .9, .03]} /><meshStandardMaterial color="#b3d7e0" transparent opacity={.24} roughness={.2} depthWrite={false} /></mesh>
    <mesh position={[0, 1.44, .92]} rotation={[.15, 0, 0]}><boxGeometry args={[1.47, .85, .03]} /><meshStandardMaterial color="#b3d7e0" transparent opacity={.26} depthWrite={false} /></mesh>
    <mesh position={[0, 1.96, .17]} castShadow><boxGeometry args={[1.65, .1, 1.58]} /><meshStandardMaterial color="#e4e5cf" /></mesh>
    {[-.76, .76].flatMap(x => [-.58, .91].map(z => <Tube key={`${x}:${z}`} a={[x, .85, z]} b={[x, 1.91, z + (z < 0 ? .1 : -.06)]} radius={.045} color="#d9e1d4" />))}
    {[-.81, .81].flatMap(x => [-1.08, 1.08].map((z, i) => <group key={`${x}:${z}`} ref={node => { wheels.current[(x < 0 ? 0 : 2) + i] = node }} position={[x, .33, z]}><Wheel radius={.33} width={.2} car /></group>))}
    {[-.56, .56].map(x => <group key={x}><mesh position={[x, .74, -1.76]}><boxGeometry args={[.38, .16, .035]} /><meshStandardMaterial color="#fff3ce" emissive="#fff3ce" emissiveIntensity={2} /></mesh><mesh position={[x, .74, 1.76]}><boxGeometry args={[.3, .12, .035]} /><meshStandardMaterial color="#f87157" emissive="#ff4c3b" emissiveIntensity={1.2} /></mesh></group>)}
    <mesh position={[0, .45, -1.78]}><boxGeometry args={[1.5, .12, .05]} /><meshStandardMaterial color="#32494d" /></mesh>
    <mesh position={[.34, 1.05, -.3]} rotation={[.7, 0, 0]}><torusGeometry args={[.16, .022, 6, 12]} /><meshStandardMaterial color="#26393d" /></mesh>
  </group>
}
