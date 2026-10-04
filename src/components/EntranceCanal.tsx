import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { DoubleSide, Object3D } from 'three'
import type { InstancedMesh } from 'three'
import { canalPoint } from '../lib/canal'
import type { CanalLayout } from '../lib/canal'
import { canalWaterHeight, createBridgeSlabGeometry, createCanalGeometry } from '../lib/canalGeometry'
import { terrainHeightAt } from '../lib/terrain'
import type { TerrainModel } from '../lib/terrain'

const ignoreRaycast = () => undefined
const RIPPLE_COUNT = 36

function FlowRipples({ canal, terrain, night }: { canal: CanalLayout; terrain: TerrainModel; night: boolean }) {
  const mesh = useRef<InstancedMesh>(null), phase = useRef(0)
  const dummy = useMemo(() => new Object3D(), [])
  const reducedMotion = useMemo(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches, [])
  useFrame((_, delta) => {
    if (!mesh.current) return
    if (!reducedMotion) phase.current = (phase.current + Math.min(delta, 0.1) * 0.65) % canal.length
    for (let i = 0; i < RIPPLE_COUNT; i++) {
      const along = (i * canal.length / RIPPLE_COUNT + phase.current) % canal.length - canal.length / 2
      const p = canalPoint(canal, along, Math.sin(i * 2.4) * canal.width * 0.18)
      dummy.position.set(p.x, canalWaterHeight(canal, terrain, along) + 0.015, p.z)
      dummy.rotation.set(0, -Math.atan2(canal.across.z, canal.across.x), 0)
      dummy.scale.set(0.45 + (i % 4) * 0.2, 1, 1)
      dummy.updateMatrix(); mesh.current.setMatrixAt(i, dummy.matrix)
    }
    mesh.current.instanceMatrix.needsUpdate = true
  })
  return <instancedMesh ref={mesh} args={[undefined, undefined, RIPPLE_COUNT]} raycast={ignoreRaycast} frustumCulled={false}>
    <boxGeometry args={[1, 0.006, 0.04]} />
    <meshBasicMaterial color={night ? '#629599' : '#aed6cc'} transparent opacity={0.42} depthWrite={false} />
  </instancedMesh>
}

export default function EntranceCanal({ canal, terrain, night }: { canal: CanalLayout; terrain: TerrainModel; night: boolean }) {
  const geometry = useMemo(() => ({ ...createCanalGeometry(canal, terrain), deck: createBridgeSlabGeometry(canal, terrain) }), [canal, terrain])
  useEffect(() => () => { geometry.water.dispose(); geometry.lining.dispose(); geometry.deck.dispose() }, [geometry])
  const base = terrainHeightAt(terrain, canal.center.x, canal.center.z)
  const height = (x: number, z: number) => { const p = canalPoint(canal, z, x); return terrainHeightAt(terrain, p.x, p.z) - base }
  const span = canal.bridge.length, halfWidth = canal.bridge.width / 2
  return <group name="main-entrance-canal-and-bridge">
    <mesh name="entrance-canal-water" geometry={geometry.water} raycast={ignoreRaycast} receiveShadow>
      <meshStandardMaterial color={night ? '#285b67' : '#4f969c'} roughness={0.24} metalness={0.15} side={DoubleSide} />
    </mesh>
    <mesh name="entrance-canal-lining" geometry={geometry.lining} receiveShadow raycast={ignoreRaycast}>
      <meshStandardMaterial color="#b6bfb3" roughness={0.94} side={DoubleSide} />
    </mesh>
    <FlowRipples canal={canal} terrain={terrain} night={night} />
    <mesh name="entrance-bridge-deck" geometry={geometry.deck} castShadow receiveShadow>
      <meshStandardMaterial color="#b5b8aa" roughness={0.95} side={DoubleSide} />
    </mesh>
    <group position={[canal.center.x, base, canal.center.z]} rotation={[0, -Math.atan2(canal.across.z, canal.across.x), 0]}>
      {[-1, 1].map(side => {
        const z = side * (halfWidth - 0.14), rise = height(span / 2, z) - height(-span / 2, z)
        return <group key={side} name={`bridge-railing-${side}`}>
          <mesh position={[0, height(0, z) + 0.13, z]} rotation={[0, 0, Math.atan2(rise, span)]} castShadow receiveShadow>
            <boxGeometry args={[Math.hypot(span, rise), 0.24, 0.28]} /><meshStandardMaterial color="#d4d3c4" roughness={0.9} />
          </mesh>
          {Array.from({ length: 6 }, (_, i) => -span / 2 + 0.2 + i * (span - 0.4) / 5).map(x => <mesh key={x} position={[x, height(x, z) + 0.75, z]} castShadow>
            <boxGeometry args={[0.12, 1.25, 0.12]} /><meshStandardMaterial color="#dde1d6" roughness={0.7} />
          </mesh>)}
          {[0.72, 1.34].map(y => <mesh key={y} position={[0, height(0, z) + y, z]} rotation={[0, 0, Math.atan2(rise, span)]} castShadow>
            <boxGeometry args={[Math.hypot(span, rise), 0.09, 0.1]} /><meshStandardMaterial color="#dce1d8" roughness={0.7} />
          </mesh>)}
        </group>
      })}
      {[-1, 1].map(side => <mesh key={side} name="bridge-abutment" position={[side * (span / 2 - 0.35), height(side * (span / 2 - 0.35), 0) - 0.52, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.7, 1.05, canal.bridge.width]} /><meshStandardMaterial color="#b6bfb3" roughness={1} />
      </mesh>)}
    </group>
  </group>
}
