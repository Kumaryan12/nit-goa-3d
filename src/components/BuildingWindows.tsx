import { useLayoutEffect, useMemo, useRef } from 'react'
import { InstancedMesh, Object3D } from 'three'
import { gpsToLocal } from '../lib/geo'
import type { BuildingFootprint } from '../types/osm'

export default function BuildingWindows({ buildings, night }: { buildings: BuildingFootprint[]; night: boolean }) {
  const mesh = useRef<InstancedMesh>(null)
  const windows = useMemo(() => buildings.flatMap((building) => {
    const points = building.outer.map(gpsToLocal)
    const signedArea = points.slice(1).reduce((sum, b, i) => sum + points[i].x * b.z - b.x * points[i].z, 0)
    const sign = signedArea > 0 ? -1 : 1
    return points.slice(1).flatMap((b, i) => {
      const a = points[i], dx = b.x - a.x, dz = b.z - a.z, length = Math.hypot(dx, dz)
      const count = Math.floor(length / 4.5), floors = Math.min(12, Math.max(1, Math.floor(building.height / 3.2)))
      return Array.from({ length: count * floors }, (_, j) => {
        const t = ((j % count) + 0.5) / count
        return { x: a.x + dx * t - dz / length * 0.07 * sign, z: a.z + dz * t + dx / length * 0.07 * sign, y: 1.9 + Math.floor(j / count) * 3.2, angle: -Math.atan2(dz, dx) }
      })
    })
  }), [buildings])
  useLayoutEffect(() => {
    const dummy = new Object3D()
    windows.forEach((window, i) => {
      dummy.position.set(window.x, window.y, window.z); dummy.rotation.set(0, window.angle, 0); dummy.updateMatrix()
      mesh.current?.setMatrixAt(i, dummy.matrix)
    })
    if (mesh.current) { mesh.current.instanceMatrix.needsUpdate = true; mesh.current.computeBoundingSphere() }
  }, [windows])
  return <instancedMesh ref={mesh} args={[undefined, undefined, windows.length]}>
    <boxGeometry args={[1.3, 1.4, 0.06]} />
    <meshStandardMaterial color={night ? '#d8b875' : '#6d8586'} emissive="#ffc274" emissiveIntensity={night ? 1.7 : 0} roughness={0.45} />
  </instancedMesh>
}
