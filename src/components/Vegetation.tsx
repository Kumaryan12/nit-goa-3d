import { memo, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { Color, DoubleSide, InstancedMesh, Object3D } from 'three'
import type { TreeInstance } from '../lib/vegetation'
import { createPalmFrond } from '../lib/gardenGeometry'

function Vegetation({ trees, onReady }: { trees: TreeInstance[]; onReady: (count: number) => void }) {
  const trunks = useRef<InstancedMesh>(null), crowns = useRef<InstancedMesh>(null), lobes = useRef<InstancedMesh>(null), fronds = useRef<InstancedMesh>(null)
  const broadleaf = useMemo(() => trees.filter((tree) => !tree.palm), [trees])
  const palms = useMemo(() => trees.filter((tree) => tree.palm), [trees])
  const palmGeometry = useMemo(createPalmFrond, [])
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
      crowns.current?.setColorAt(i, color.set('#5a7e45').lerp(new Color('#355d3b'), tree.shade))
      // All lobes stay inside the existing collision ellipsoid. Shape/colour
      // variety upgrades the same trees without moving or enlarging obstacles.
      for (let lobe = 0; lobe < 4; lobe++) {
        const a = tree.rotation + lobe * Math.PI / 2
        dummy.position.set(tree.x + Math.sin(a) * 2.7 * .4 * tree.scale, tree.y + (6 + (lobe % 2 ? -.14 : .14) * 3.1) * tree.scale, tree.z + Math.cos(a) * 2.7 * .4 * tree.scale)
        dummy.rotation.set(0, a, 0); dummy.scale.set(2.7 * .48 * tree.scale, 3.1 * .5 * tree.scale, 2.7 * .48 * tree.scale); dummy.updateMatrix()
        lobes.current?.setMatrixAt(i * 4 + lobe, dummy.matrix)
        const tint = tree.shade < .12 ? (lobe % 2 ? '#e1a5be' : '#cf87a7') : tree.shade < .24 ? (lobe % 2 ? '#e5c578' : '#d9b65c') : (lobe % 2 ? '#638747' : '#4a713e')
        lobes.current?.setColorAt(i * 4 + lobe, color.set(tint))
      }
    })
    palms.forEach((tree, i) => {
      for (let leaf = 0; leaf < 8; leaf++) {
        const angle = tree.rotation + leaf * Math.PI / 4
        dummy.position.set(tree.x - Math.sin(.045) * 4 * tree.scale, tree.y + 8 * tree.scale, tree.z)
        dummy.rotation.set(0, angle, 0); dummy.scale.setScalar(tree.scale * (leaf % 2 ? .92 : 1)); dummy.updateMatrix()
        fronds.current?.setMatrixAt(i * 8 + leaf, dummy.matrix)
        fronds.current?.setColorAt(i * 8 + leaf, color.set('#527e43').lerp(new Color('#2d603c'), tree.shade))
      }
    })
    for (const mesh of [trunks.current, crowns.current, lobes.current, fronds.current]) if (mesh) {
      mesh.instanceMatrix.needsUpdate = true
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
      mesh.computeBoundingSphere()
    }
    onReady(trees.length)
  }, [trees, broadleaf, palms, onReady])
  return <group name="campus-landscaped-trees">
    <instancedMesh ref={trunks} args={[undefined, undefined, trees.length]} castShadow receiveShadow>
      <cylinderGeometry args={[0.75, 1, 1, 6]} /><meshStandardMaterial color="#877254" roughness={1} />
    </instancedMesh>
    <instancedMesh ref={crowns} args={[undefined, undefined, broadleaf.length]} castShadow receiveShadow>
      <icosahedronGeometry args={[1, 1]} /><meshStandardMaterial color="white" roughness={1} />
    </instancedMesh>
    <instancedMesh ref={lobes} args={[undefined, undefined, broadleaf.length * 4]} castShadow receiveShadow>
      <icosahedronGeometry args={[1, 0]} /><meshStandardMaterial color="white" roughness={1} />
    </instancedMesh>
    <instancedMesh ref={fronds} args={[palmGeometry, undefined, palms.length * 8]} castShadow receiveShadow>
      <meshStandardMaterial color="white" roughness={1} side={DoubleSide} />
    </instancedMesh>
  </group>
}

export default memo(Vegetation)
