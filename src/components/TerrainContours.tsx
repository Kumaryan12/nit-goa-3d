import { useEffect, useMemo } from 'react'
import { createTerrainContourGeometry } from '../lib/terrainContours'
import type { TerrainModel } from '../lib/terrain'

const ignoreRaycast = () => undefined

export default function TerrainContours({ model, night = false }: { model: TerrainModel; night?: boolean }) {
  const geometry = useMemo(() => createTerrainContourGeometry(model), [model])
  useEffect(() => () => geometry.dispose(), [geometry])
  return <lineSegments name="terrain-contours-2m" geometry={geometry} raycast={ignoreRaycast} renderOrder={1}>
    <lineBasicMaterial color={night ? '#d8bc83' : '#655442'} transparent opacity={night ? 0.34 : 0.3} depthWrite={false} />
  </lineSegments>
}
