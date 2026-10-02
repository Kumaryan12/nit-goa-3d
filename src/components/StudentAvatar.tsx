import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group } from 'three'

export default function StudentAvatar({ motion }: { motion: React.RefObject<{ phase: number; moving: boolean }> }) {
  const leftLeg = useRef<Group>(null), rightLeg = useRef<Group>(null), leftArm = useRef<Group>(null), rightArm = useRef<Group>(null)
  useFrame((_, delta) => {
    const target = motion.current.moving ? Math.sin(motion.current.phase) * 0.6 : 0, blend = 1 - Math.exp(-delta * 15)
    for (const [limb, angle] of [[leftLeg, target], [rightLeg, -target], [leftArm, -target * 0.75], [rightArm, target * 0.75]] as const) if (limb.current) limb.current.rotation.x += (angle - limb.current.rotation.x) * blend
  })
  return <group name="campus-student-avatar">
    <mesh position={[0, 1.16, 0]} castShadow><boxGeometry args={[0.46, 0.62, 0.28]} /><meshStandardMaterial color="#277c77" roughness={0.9} /></mesh>
    <mesh position={[0, 1.63, -0.01]} castShadow><sphereGeometry args={[0.19, 16, 12]} /><meshStandardMaterial color="#c99066" roughness={0.95} /></mesh>
    <mesh position={[0, 1.73, 0.025]} castShadow><sphereGeometry args={[0.18, 12, 8]} /><meshStandardMaterial color="#2e2926" roughness={1} /></mesh>
    {[-0.065, 0.065].map(x => <mesh key={x} position={[x, 1.65, -0.181]}><sphereGeometry args={[0.017, 8, 6]} /><meshStandardMaterial color="#302823" /></mesh>)}
    <mesh position={[0, 1.16, 0.23]} castShadow><boxGeometry args={[0.35, 0.43, 0.18]} /><meshStandardMaterial color="#d99d53" roughness={1} /></mesh>
    {[leftLeg, rightLeg].map((ref, i) => <group ref={ref} key={`leg${i}`} position={[i ? 0.13 : -0.13, 0.79, 0]}>
      <mesh position={[0, -0.34, 0]} castShadow><cylinderGeometry args={[0.085, 0.07, 0.68, 8]} /><meshStandardMaterial color="#27394d" roughness={1} /></mesh>
      <mesh position={[0, -0.72, -0.06]} castShadow><boxGeometry args={[0.18, 0.14, 0.3]} /><meshStandardMaterial color="#e7ede4" roughness={1} /></mesh>
    </group>)}
    {[leftArm, rightArm].map((ref, i) => <group ref={ref} key={`arm${i}`} position={[i ? 0.31 : -0.31, 1.4, 0]}>
      <mesh position={[0, -0.15, 0]} castShadow><cylinderGeometry args={[0.08, 0.075, 0.3, 8]} /><meshStandardMaterial color="#277c77" roughness={1} /></mesh>
      <mesh position={[0, -0.39, 0]} castShadow><cylinderGeometry args={[0.065, 0.06, 0.22, 8]} /><meshStandardMaterial color="#c99066" roughness={1} /></mesh>
      <mesh position={[0, -0.53, 0]} castShadow><sphereGeometry args={[0.07, 8, 6]} /><meshStandardMaterial color="#c99066" roughness={1} /></mesh>
    </group>)}
  </group>
}
