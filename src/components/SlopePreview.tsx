import { useEffect, useMemo, useRef } from 'react'
import { useThree } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import { createRoadGeometry } from '../lib/roadGeometry'
import { terrainHeightAt } from '../lib/terrain'
import type { TerrainModel } from '../lib/terrain'
import type { SlopePreviewPoints } from './SlopeEditor'

const ignoreRaycast = () => undefined
export default function SlopePreview({ points, terrain }: { points: SlopePreviewPoints; terrain: TerrainModel }) {
  const gl = useThree(state => state.gl)
  const portal = useRef(gl.domElement.parentElement!)
  const line = useMemo(() => points.lower && points.upper && Math.hypot(points.upper.x - points.lower.x, points.upper.z - points.lower.z) > 0.1
    ? createRoadGeometry([[points.lower, points.upper]], 0.5, 0.15, terrain) : null, [points, terrain])
  useEffect(() => () => line?.dispose(), [line])
  return <group name="slope-preview">
    {line && <mesh geometry={line} raycast={ignoreRaycast}><meshBasicMaterial color="#e8b849" depthTest={false} transparent opacity={0.65} /></mesh>}
    {(['lower', 'upper'] as const).map(end => {
      const point = points[end]
      return point && <group key={end} position={[point.x, terrainHeightAt(terrain, point.x, point.z) + 0.15, point.z]}>
        <mesh rotation={[-Math.PI / 2, 0, 0]} raycast={ignoreRaycast} renderOrder={1000}><ringGeometry args={[2, 3, 24]} /><meshBasicMaterial color={end === 'lower' ? '#55c6bc' : '#f2c44c'} depthTest={false} toneMapped={false} /></mesh>
        <Html portal={portal} position={[0, 5, 0]} center pointerEvents="none" zIndexRange={[21, 0]}><span className={`slope-marker slope-marker-${end}`}>{end === 'lower' ? 'LOWER' : 'HIGHER'}</span></Html>
      </group>
    })}
  </group>
}
