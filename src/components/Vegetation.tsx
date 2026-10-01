import { useLayoutEffect, useMemo, useRef } from 'react'
import { Color, InstancedMesh, Object3D } from 'three'
import type { TreeInstance } from '../lib/vegetation'

export default function Vegetation({ trees, onReady }: { trees: TreeInstance[]; onReady: (count: number) => void }) {
  const trunks = useRef<InstancedMesh>(null), crowns = useRef<InstancedMesh>(null), fronds = useRef<InstancedMesh>(null)
  const broadleaf = useMemo(() => trees.filter((tree) => !tree.palm), [trees])
  const palms = useMemo(() => trees.filter((tree) => tree.palm), [trees])
  useLayoutEffect(() => {
    const dummy = new Object3D(), color = new Color()
    trees.forEach((tree, i) => {
      const height = (tree.palm ? 8 : 4.8) * tree.scale
      dummy.position.set(tree.x, tree.y + height / 2, tree.z); dummy.rotation.set(0, tree.rotation, tree.palm ? 0.045 : 0)
      dummy.scale.set((tree.palm ? 0.3 : 0.45) * tree.scale, height, (tree.palm ? 0.3 : 0.45) * tree.scale); dummy.updateMatrix()
      trunks.current?.setMatrixAt(i, dummy.matrix)
    })
    broadleaf.forEach((tree, i) => {
      dummy.position.set(tree.x, tree.y + 6 * tree.scale, tree.z); dummy.rotation.set(0, tree.rotation, 0)
      dummy.scale.set(2.7 * tree.scale, 3.1 * tree.scale, 2.7 * tree.scale); dummy.updateMatrix()
      crowns.current?.setMatrixAt(i, dummy.matrix)
      crowns.current?.setColorAt(i, color.set('#628445').lerp(new Color('#355d3b'), tree.shade))
    })
    palms.forEach((tree, i) => {
      for (let leaf = 0; leaf < 6; leaf++) {
        const angle = tree.rotation + leaf * Math.PI / 3
        dummy.position.set(tree.x + Math.sin(angle) * 1.7 * tree.scale, tree.y + 8 * tree.scale, tree.z + Math.cos(angle) * 1.7 * tree.scale)
        dummy.rotation.set(0.18, angle, 0); dummy.scale.set(0.7 * tree.scale, 0.25 * tree.scale, 3.8 * tree.scale); dummy.updateMatrix()
        fronds.current?.setMatrixAt(i * 6 + leaf, dummy.matrix)
        fronds.current?.setColorAt(i * 6 + leaf, color.set('#4d7a44').lerp(new Color('#2d603c'), tree.shade))
      }
    })
    for (const mesh of [trunks.current, crowns.current, fronds.current]) if (mesh) {
      mesh.instanceMatrix.needsUpdate = true
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
      mesh.computeBoundingSphere()
    }
    onReady(trees.length)
  }, [trees, broadleaf, palms, onReady])
  return <group>
    <instancedMesh ref={trunks} args={[undefined, undefined, trees.length]} castShadow receiveShadow>
      <cylinderGeometry args={[0.75, 1, 1, 6]} /><meshStandardMaterial color="#877254" roughness={1} />
    </instancedMesh>
    <instancedMesh ref={crowns} args={[undefined, undefined, broadleaf.length]} castShadow receiveShadow>
      <icosahedronGeometry args={[1, 0]} /><meshStandardMaterial color="white" roughness={1} />
    </instancedMesh>
    <instancedMesh ref={fronds} args={[undefined, undefined, palms.length * 6]} castShadow receiveShadow>
      <octahedronGeometry args={[1, 0]} /><meshStandardMaterial color="white" roughness={1} />
    </instancedMesh>
  </group>
}
