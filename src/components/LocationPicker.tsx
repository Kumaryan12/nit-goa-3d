import { useEffect, useMemo } from 'react'
import { useThree } from '@react-three/fiber'
import { Plane, Raycaster, Vector2, Vector3 } from 'three'
import type { LocalCoordinate } from '../lib/geo'
import type { TerrainModel } from '../lib/terrain'
import { terrainHeightAt } from '../lib/terrain'

// A flat ground projection picks local X/Z without changing or intercepting OSM meshes.
// Pointer distance distinguishes a deliberate placement click from an orbit drag.
export default function LocationPicker({ active, preview, terrain, onPick }: { active: boolean; preview: LocalCoordinate | null; terrain: TerrainModel; onPick: (point: LocalCoordinate) => void }) {
  const { gl, camera } = useThree()
  const plane = useMemo(() => new Plane(new Vector3(0, 1, 0), 0), [])
  useEffect(() => {
    if (!active) return
    let down: { x: number; y: number; id: number } | null = null
    const start = (event: PointerEvent) => { if (event.button === 0 && event.isPrimary) down = { x: event.clientX, y: event.clientY, id: event.pointerId }; else down = null }
    const cancel = () => { down = null }
    const finish = (event: PointerEvent) => {
      const beginning = down; down = null
      if (!beginning || event.pointerId !== beginning.id || event.button !== 0 || Math.hypot(event.clientX - beginning.x, event.clientY - beginning.y) > 4) return
      const bounds = gl.domElement.getBoundingClientRect(), pointer = new Vector2((event.clientX - bounds.left) / bounds.width * 2 - 1, -(event.clientY - bounds.top) / bounds.height * 2 + 1)
      const raycaster = new Raycaster(), point = new Vector3(); raycaster.setFromCamera(pointer, camera)
      if (raycaster.ray.intersectPlane(plane, point) && Math.abs(point.x) <= 5000 && Math.abs(point.z) <= 5000) onPick({ x: Math.round(point.x * 100) / 100, z: Math.round(point.z * 100) / 100 })
    }
    gl.domElement.addEventListener('pointerdown', start, true); gl.domElement.addEventListener('pointerup', finish, true); gl.domElement.addEventListener('pointercancel', cancel)
    return () => { gl.domElement.removeEventListener('pointerdown', start, true); gl.domElement.removeEventListener('pointerup', finish, true); gl.domElement.removeEventListener('pointercancel', cancel) }
  }, [active, camera, gl, onPick, plane])
  return preview && <group position={[preview.x, terrainHeightAt(terrain, preview.x, preview.z) + 0.5, preview.z]}>
    <mesh rotation={[-Math.PI / 2, 0, 0]} renderOrder={1000} raycast={() => null}><ringGeometry args={[3.5, 5, 24]} /><meshBasicMaterial color="#ffce38" toneMapped={false} depthTest={false} /></mesh>
    <mesh position={[0, 4, 0]} renderOrder={1000} raycast={() => null}><sphereGeometry args={[2, 12, 8]} /><meshBasicMaterial color="#ffce38" toneMapped={false} depthTest={false} /></mesh>
  </group>
}
