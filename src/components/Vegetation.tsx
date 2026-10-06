import { memo, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { Color, InstancedMesh, Object3D } from 'three'
import type { TreeInstance } from '../lib/vegetation'
import { createPalmFrond } from '../lib/gardenGeometry'
import { useFoliageMaterial } from './useFoliageMaterial'

function Vegetation({ trees, onReady }: { trees: TreeInstance[]; onReady: (count: number) => void }) {
  const trunks = useRef<InstancedMesh>(null), crowns = useRef<InstancedMesh>(null), lobes = useRef<InstancedMesh>(null), fronds = useRef<InstancedMesh>(null)
  const broadleaf = useMemo(() => trees.filter((tree) => !tree.palm), [trees])
  const palms = useMemo(() => trees.filter((tree) => tree.palm), [trees])
  const palmGeometry = useMemo(createPalmFrond, [])
  const canopyMaterial = useFoliageMaterial('canopy', .09)
  const palmMaterial = useFoliageMaterial('palm', .12, true)
  useEffect(() => () => palmGeometry.dispose(), [palmGeometry])
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
      dummy.scale.set(2.7 * tree.scale * .76, 3.1 * tree.scale * .76, 2.7 * tree.scale * .76); dummy.updateMatrix()
      crowns.current?.setMatrixAt(i, dummy.matrix)
      crowns.current?.setColorAt(i, color.set('#50805b').lerp(new Color('#244f3c'), tree.shade))
      // All lobes stay inside the existing collision ellipsoid. Shape/colour
      // variety upgrades the same trees without moving or enlarging obstacles.
      for (let lobe = 0; lobe < 6; lobe++) {
        const a = tree.rotation + lobe * Math.PI / 3
        dummy.position.set(tree.x + Math.sin(a) * 2.7 * .4 * tree.scale, tree.y + (6 + (lobe % 2 ? -.14 : .14) * 3.1) * tree.scale, tree.z + Math.cos(a) * 2.7 * .4 * tree.scale)
        dummy.rotation.set(0, a, 0); dummy.scale.set(2.7 * .48 * tree.scale, 3.1 * .5 * tree.scale, 2.7 * .48 * tree.scale); dummy.updateMatrix()
        lobes.current?.setMatrixAt(i * 6 + lobe, dummy.matrix)
        const tint = tree.shade < .04 ? (lobe % 2 ? '#c3aa81' : '#a4b87b') : (lobe % 2 ? '#648e59' : '#3e7150')
        lobes.current?.setColorAt(i * 6 + lobe, color.set(tint).lerp(new Color('#29553f'), tree.shade * .35))
      }
    })
    palms.forEach((tree, i) => {
      for (let leaf = 0; leaf < 8; leaf++) {
        const angle = tree.rotation + leaf * Math.PI / 4
        dummy.position.set(tree.x - Math.sin(.045) * 4 * tree.scale, tree.y + 8 * tree.scale, tree.z)
        dummy.rotation.set(0, angle, 0); dummy.scale.setScalar(tree.scale * (leaf % 2 ? .92 : 1)); dummy.updateMatrix()
        fronds.current?.setMatrixAt(i * 8 + leaf, dummy.matrix)
        fronds.current?.setColorAt(i * 8 + leaf, color.set('#5c8b58').lerp(new Color('#285940'), tree.shade))
      }
    })
    for (const mesh of [trunks.current, crowns.current, lobes.current, fronds.current]) if (mesh) {
      mesh.instanceMatrix.needsUpdate = true
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
      mesh.computeBoundingSphere()
      if (mesh.boundingSphere) mesh.boundingSphere.radius += .2
    }
    onReady(trees.length)
  }, [trees, broadleaf, palms, onReady])
  return <group name="campus-landscaped-trees">
    <instancedMesh ref={trunks} args={[undefined, undefined, trees.length]} castShadow receiveShadow>
      <cylinderGeometry args={[0.75, 1, 1, 6]} /><meshStandardMaterial color="#786b55" roughness={1} />
    </instancedMesh>
    <instancedMesh ref={crowns} args={[undefined, canopyMaterial, broadleaf.length]} castShadow receiveShadow>
      <icosahedronGeometry args={[1, 1]} />
    </instancedMesh>
    <instancedMesh ref={lobes} args={[undefined, canopyMaterial, broadleaf.length * 6]} castShadow receiveShadow>
      <icosahedronGeometry args={[1, 0]} />
    </instancedMesh>
    <instancedMesh ref={fronds} args={[palmGeometry, palmMaterial, palms.length * 8]} castShadow receiveShadow />
  </group>
}

export default memo(Vegetation)
