import { memo, useContext, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Color, Object3D } from 'three'
import type { InstancedMesh } from 'three'
import { nearbyMeadowChunks } from '../lib/campusMeadow'
import type { MeadowChunk } from '../lib/campusMeadow'
import { createMeadowTuft } from '../lib/meadowGeometry'
import { GraphicsContext } from './ScenePerformance'
import { useFoliageMaterial } from './useFoliageMaterial'

function CampusMeadow({ chunks }: { chunks: MeadowChunk[] }) {
  const meshes = useRef<(InstancedMesh | null)[]>([]), elapsed = useRef(1), profile = useContext(GraphicsContext)
  const geometry = useMemo(createMeadowTuft, []), material = useFoliageMaterial('grass', .035, true)
  useEffect(() => () => geometry.dispose(), [geometry])
  useLayoutEffect(() => {
    const dummy = new Object3D(), color = new Color(), dark = new Color('#39724c')
    chunks.forEach((chunk, i) => {
      const mesh = meshes.current[i]; if (!mesh) return
      chunk.tufts.forEach((tuft, j) => {
        dummy.position.set(tuft.x, tuft.y, tuft.z); dummy.rotation.set(0, tuft.rotation, 0)
        dummy.scale.set(tuft.width, tuft.height, tuft.width); dummy.updateMatrix()
        mesh.setMatrixAt(j, dummy.matrix); mesh.setColorAt(j, color.set('#71945d').lerp(dark, tuft.shade))
      })
      mesh.instanceMatrix.needsUpdate = true
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
      mesh.computeBoundingSphere()
      if (mesh.boundingSphere) mesh.boundingSphere.radius += .06
    })
    elapsed.current = 1
  }, [chunks, profile])
  useFrame(({ camera }, delta) => {
    elapsed.current += delta
    if (elapsed.current < .25) return
    elapsed.current = 0
    const level = profile.shadowSize <= 1024 ? 0 : profile.shadowSize <= 1536 ? 1 : 2
    const visible = nearbyMeadowChunks(chunks, camera.position, level)
    meshes.current.forEach((mesh, i) => { if (mesh) mesh.visible = visible.has(i) })
  })
  return <group name="campus-breeze-meadow">
    {chunks.map((chunk, i) => <instancedMesh key={chunk.id} ref={mesh => { meshes.current[i] = mesh }} args={[geometry, material, chunk.tufts.length]} visible={false} receiveShadow raycast={() => null} />)}
  </group>
}
export default memo(CampusMeadow)
