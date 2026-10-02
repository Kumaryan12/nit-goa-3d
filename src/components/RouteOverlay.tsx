import { memo, useEffect, useMemo, useRef } from 'react'
import { Html, Line } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { BufferGeometry, Float32BufferAttribute } from 'three'
import { terrainHeightAt } from '../lib/terrain'
import type { TerrainModel } from '../lib/terrain'
import type { RoutePresentation } from '../lib/traversal'
import type { LocalCoordinate } from '../lib/geo'

// A strip is linear at every A* corner: smoothing must never cut across buildings.
function RoadStrip({ path, terrain, night }: { path: LocalCoordinate[]; terrain: TerrainModel; night: boolean }) {
  const geometry = useMemo(() => {
    const positions: number[] = [], indices: number[] = []
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1], b = path[i], length = Math.hypot(b.x - a.x, b.z - a.z)
      if (!length) continue
      const ox = -(b.z - a.z) / length * 0.9, oz = (b.x - a.x) / length * 0.9
      const subdivisions = Math.max(1, Math.ceil(length / 4))
      for (let j = 0; j < subdivisions; j++) {
        const start = positions.length / 3
        for (const [t, side] of [[j / subdivisions, 1], [j / subdivisions, -1], [(j + 1) / subdivisions, 1], [(j + 1) / subdivisions, -1]]) {
          const x = a.x + (b.x - a.x) * t + ox * side, z = a.z + (b.z - a.z) * t + oz * side
          positions.push(x, terrainHeightAt(terrain, x, z) + 0.24, z)
        }
        indices.push(start, start + 2, start + 1, start + 1, start + 2, start + 3)
      }
    }
    const result = new BufferGeometry(); result.setAttribute('position', new Float32BufferAttribute(positions, 3)); result.setIndex(indices); return result
  }, [path, terrain])
  useEffect(() => () => geometry.dispose(), [geometry])
  return <mesh geometry={geometry} renderOrder={5} raycast={() => null}><meshBasicMaterial color={night ? '#65efff' : '#007cc2'} toneMapped={false} polygonOffset polygonOffsetFactor={-4} polygonOffsetUnits={-4} /></mesh>
}
function RouteOverlay({ presentation, terrain, night }: { presentation: RoutePresentation; terrain: TerrainModel; night: boolean }) {
  const gl = useThree((state) => state.gl), portal = useRef(gl.domElement.parentElement!)
  const connectors = useMemo(() => {
    const path = presentation.route.path
    if (!path.length) return []
    return [[presentation.start, path[0]], [path[path.length - 1], presentation.end]].map(([a, b]) => {
      const length = Math.hypot(a.x - b.x, a.z - b.z), count = Math.max(1, Math.ceil(length / 3))
      return Array.from({ length: count + 1 }, (_, i): [number, number, number] => {
        const x = a.x + (b.x - a.x) * i / count, z = a.z + (b.z - a.z) * i / count
        return [x, terrainHeightAt(terrain, x, z) + 0.3, z]
      })
    })
  }, [presentation, terrain])
  return <group>
    <RoadStrip path={presentation.route.path} terrain={terrain} night={night} />
    {connectors.map((points, i) => <Line key={i} points={points} color={night ? '#ffe598' : '#b97a20'} lineWidth={3} dashed dashSize={3} gapSize={2} raycast={() => null} />)}
    {[presentation.start, presentation.end].map((point, i) => <group key={i} position={[point.x, terrainHeightAt(terrain, point.x, point.z) + 0.6, point.z]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}><ringGeometry args={[2.1, 3.5, 20]} /><meshBasicMaterial color={i ? '#ed985a' : '#4ee6cb'} toneMapped={false} /></mesh>
      <Html portal={portal} zIndexRange={[20, 0]} pointerEvents="none" position={[0, 8, 0]} center style={{ pointerEvents: 'none' }}><span className="route-marker-label">{i ? 'DESTINATION' : 'START'}</span></Html>
    </group>)}
  </group>
}
export default memo(RouteOverlay)
