import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { InstancedMesh, Object3D } from 'three'
import { createRoadGeometry } from '../lib/roadGeometry'
import { campusLocations } from '../data/campus'
import { distanceToSegment } from '../lib/terrain'
import type { LocalCoordinate } from '../lib/geo'

export default function CampusBoundary({ points, entrance = campusLocations.find((location) => location.id === 'main-entrance')!.coordinates }: { points: LocalCoordinate[]; entrance?: LocalCoordinate }) {
  const wallsRef = useRef<InstancedMesh>(null)
  const postsRef = useRef<InstancedMesh>(null)
  const outline = useMemo(() => createRoadGeometry(points.length > 2 ? [points] : [], 0.8, 0.12), [points])
  const { walls, posts } = useMemo(() => {
    const walls: { x: number; z: number; length: number; angle: number }[] = []
    const posts: LocalCoordinate[] = []
    points.slice(1).forEach((b, i) => {
      const a = points[i], length = Math.hypot(b.x - a.x, b.z - a.z)
      const count = Math.max(1, Math.ceil(length / 10))
      for (let j = 0; j < count; j++) {
        const t = (j + 0.5) / count
        const center = { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t }
        // Leave a small arrival opening at the provisional entrance anchor.
        if (Math.hypot(center.x - entrance.x, center.z - entrance.z) < 15 && distanceToSegment(entrance, a, b) < 18) continue
        walls.push({ ...center, length: length / count, angle: -Math.atan2(b.z - a.z, b.x - a.x) })
        posts.push({ x: a.x + (b.x - a.x) * j / count, z: a.z + (b.z - a.z) * j / count })
      }
    })
    return { walls, posts }
  }, [points, entrance])
  useLayoutEffect(() => {
    const dummy = new Object3D()
    walls.forEach((wall, i) => {
      dummy.position.set(wall.x, 0.52, wall.z); dummy.rotation.set(0, wall.angle, 0); dummy.scale.set(wall.length, 0.8, 0.32); dummy.updateMatrix()
      wallsRef.current?.setMatrixAt(i, dummy.matrix)
    })
    posts.forEach((post, i) => {
      dummy.position.set(post.x, 0.8, post.z); dummy.rotation.set(0, 0, 0); dummy.scale.set(0.5, 1.4, 0.5); dummy.updateMatrix()
      postsRef.current?.setMatrixAt(i, dummy.matrix)
    })
    for (const mesh of [wallsRef.current, postsRef.current]) if (mesh) { mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere() }
  }, [walls, posts])
  useEffect(() => () => outline.dispose(), [outline])
  if (points.length < 3) return null
  return <group>
    <mesh geometry={outline}><meshStandardMaterial color="#6d7458" roughness={1} /></mesh>
    <instancedMesh ref={wallsRef} args={[undefined, undefined, walls.length]} castShadow receiveShadow>
      <boxGeometry /><meshStandardMaterial color="#b6b69b" roughness={1} />
    </instancedMesh>
    <instancedMesh ref={postsRef} args={[undefined, undefined, posts.length]} castShadow>
      <boxGeometry /><meshStandardMaterial color="#7c8468" roughness={1} />
    </instancedMesh>
  </group>
}
