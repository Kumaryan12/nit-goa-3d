import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { Color, DoubleSide, InstancedMesh, Object3D } from 'three'
import type { BufferGeometry } from 'three'
import type { CampusGardens as GardenModel } from '../lib/campusGardens'
import { createFlowerLeaves, createFlowerPetals, createGardenSoil } from '../lib/gardenGeometry'
import type { TerrainModel } from '../lib/terrain'

interface Part { x: number; y: number; z: number; width: number; height: number; depth: number; rotation: number; color?: string }
const ignoreRaycast = () => undefined
function PlantInstances({ parts, geometry, color, kind }: { parts: Part[]; geometry?: BufferGeometry; color: string; kind: 'stem' | 'petal' | 'centre' | 'leaf' | 'shrub' }) {
  const mesh = useRef<InstancedMesh>(null)
  useLayoutEffect(() => {
    const dummy = new Object3D(), tint = new Color()
    parts.forEach((part, i) => {
      dummy.position.set(part.x, part.y, part.z); dummy.rotation.set(0, part.rotation, 0)
      dummy.scale.set(part.width, part.height, part.depth); dummy.updateMatrix()
      mesh.current?.setMatrixAt(i, dummy.matrix)
      if (part.color) mesh.current?.setColorAt(i, tint.set(part.color))
    })
    if (mesh.current) {
      mesh.current.instanceMatrix.needsUpdate = true
      if (mesh.current.instanceColor) mesh.current.instanceColor.needsUpdate = true
      mesh.current.computeBoundingSphere()
    }
  }, [parts])
  return <instancedMesh name={`garden-${kind}`} ref={mesh} args={[geometry, undefined, parts.length]} raycast={ignoreRaycast} receiveShadow>
    {!geometry && (kind === 'stem' ? <cylinderGeometry args={[.7, 1, 1, 5]} /> : <icosahedronGeometry args={[1, 0]} />)}
    <meshStandardMaterial color={color} roughness={.95} side={kind === 'petal' || kind === 'leaf' ? DoubleSide : undefined} />
  </instancedMesh>
}

export default function CampusGardens({ gardens, terrain }: { gardens: GardenModel; terrain: TerrainModel }) {
  const soil = useMemo(() => createGardenSoil(gardens.beds, terrain), [gardens.beds, terrain])
  const petals = useMemo(createFlowerPetals, []), leaves = useMemo(createFlowerLeaves, [])
  useEffect(() => () => { soil.dispose() }, [soil])
  useEffect(() => () => { petals.dispose(); leaves.dispose() }, [petals, leaves])
  const parts = useMemo(() => {
    const stems: Part[] = [], blooms: Part[] = [], centres: Part[] = [], foliage: Part[] = [], shrubs: Part[] = []
    for (const flower of gardens.flowers) {
      const base = { x: flower.x, z: flower.z, rotation: flower.rotation }
      stems.push({ ...base, y: flower.y + flower.height / 2, width: .014, height: flower.height, depth: .014 })
      blooms.push({ ...base, y: flower.y + flower.height, width: flower.radius, height: flower.radius, depth: flower.radius, color: flower.color })
      centres.push({ ...base, y: flower.y + flower.height + .014, width: flower.radius * .28, height: .026, depth: flower.radius * .28 })
      foliage.push({ ...base, y: flower.y + flower.height * .46, width: flower.radius, height: flower.radius, depth: flower.radius })
    }
    for (const shrub of gardens.shrubs) {
      for (const side of [-1, 0, 1]) shrubs.push({ x: shrub.x + Math.cos(shrub.rotation) * side * shrub.radius * .36, z: shrub.z + Math.sin(shrub.rotation) * side * shrub.radius * .36,
        y: shrub.y + shrub.height * (side ? .39 : .53), width: shrub.radius * (side ? .6 : .72), height: shrub.height * (side ? .4 : .52), depth: shrub.radius * .72, rotation: shrub.rotation, color: shrub.color })
    }
    return { stems, blooms, centres, foliage, shrubs }
  }, [gardens])
  return <group name="campus-flower-gardens">
    <mesh name="terrain-draped-flowerbeds" geometry={soil} raycast={ignoreRaycast} receiveShadow><meshStandardMaterial color="#6b5941" roughness={1} polygonOffset polygonOffsetFactor={-1} /></mesh>
    <PlantInstances parts={parts.stems} color="#4d7040" kind="stem" />
    <PlantInstances parts={parts.blooms} color="white" kind="petal" geometry={petals} />
    <PlantInstances parts={parts.centres} color="#e9bd4c" kind="centre" />
    <PlantInstances parts={parts.foliage} color="#527c42" kind="leaf" geometry={leaves} />
    <PlantInstances parts={parts.shrubs} color="white" kind="shrub" />
  </group>
}
