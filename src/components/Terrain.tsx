import { useEffect, useMemo } from 'react'
import { createTerrainGeometry } from '../lib/terrain'
import type { TerrainModel } from '../lib/terrain'

export default function Terrain({ model, onReady }: { model: TerrainModel; onReady: () => void }) {
  const geometry = useMemo(() => createTerrainGeometry(model), [model])
  useEffect(() => { onReady(); return () => geometry.dispose() }, [geometry, onReady])
  return <mesh name="campus-terrain" geometry={geometry} castShadow receiveShadow><meshStandardMaterial vertexColors roughness={1} metalness={0} /></mesh>
}
