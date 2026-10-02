import { memo, useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group } from 'three'
import { cumulativeDistances, positionAtDistance, routePoints } from '../lib/traversal'
import type { Playback, RoutePresentation } from '../lib/traversal'
import { terrainHeightAt } from '../lib/terrain'
import type { TerrainModel } from '../lib/terrain'
import type { LocalCoordinate } from '../lib/geo'
function RouteTraveler({ presentation, terrain, playback, position, onComplete }: {
  presentation: RoutePresentation; terrain: TerrainModel; playback: Playback;
  position: React.RefObject<LocalCoordinate | null>; onComplete: () => void
}) {
  const marker = useRef<Group>(null), distance = useRef(0), completed = useRef(false)
  const path = useMemo(() => routePoints(presentation), [presentation]), lengths = useMemo(() => cumulativeDistances(path), [path])
  useEffect(() => { distance.current = 0; completed.current = false; position.current = null }, [presentation, playback.sequence, position])
  useFrame((_, delta) => {
    if (!marker.current) return
    marker.current.visible = playback.status !== 'stopped'
    if (playback.status === 'stopped') { position.current = null; return }
    if (playback.status === 'playing' && !completed.current) distance.current += Math.min(delta, 0.1) * (80 / 60) * playback.speed
    const point = positionAtDistance(path, lengths, distance.current)
    position.current = point
    marker.current.position.set(point.x, terrainHeightAt(terrain, point.x, point.z) + 1.5, point.z)
    if (!completed.current && distance.current >= lengths[lengths.length - 1]) { completed.current = true; onComplete() }
  })
  return <group ref={marker} visible={false}><mesh raycast={() => null}><sphereGeometry args={[1.7, 12, 8]} /><meshBasicMaterial color="#f4fbff" toneMapped={false} /></mesh><mesh position={[0, -0.7, 0]} raycast={() => null}><cylinderGeometry args={[0.8, 2.2, 1.4, 12]} /><meshBasicMaterial color="#007cc2" toneMapped={false} /></mesh></group>
}
export default memo(RouteTraveler)
