import { memo, useEffect, useMemo } from 'react'
import { MeshStandardMaterial } from 'three'
import { createTerrainPatches, terrainPatchGeometry } from '../lib/terrainPatches'
import type { TerrainPatchData } from '../lib/terrainPatches'
import type { TerrainModel } from '../lib/terrain'

function Terrain({ model, patches, onReady }: { model: TerrainModel; patches?: TerrainPatchData[]; onReady: () => void }) {
  const data = useMemo(() => patches ?? createTerrainPatches(model), [model, patches])
  const geometry = useMemo(() => data.map(terrainPatchGeometry), [data])
  const material = useMemo(() => new MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 }), [])
  useEffect(() => { onReady() }, [geometry, onReady])
  useEffect(() => () => geometry.forEach(g => g.dispose()), [geometry])
  useEffect(() => () => material.dispose(), [material])
  return <group name="campus-terrain-patches">
    {geometry.map((g, i) => <mesh key={data[i].id} name={`campus-terrain-${data[i].id}`} geometry={g} material={material} castShadow receiveShadow />)}
  </group>
}
export default memo(Terrain)
