import { applyNightWindows } from '../lib/nightWindows'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { BufferGeometry, CanvasTexture, DoubleSide, Float32BufferAttribute, InstancedMesh, Object3D, SRGBColorSpace } from 'three'
import { applyPitchedRoofTiles } from '../lib/roofMaterial'

export interface Box { position: [number, number, number]; size: [number, number, number]; angle?: number }

export function Boxes({ boxes, color, night = false }: { boxes: Box[]; color: string; night?: boolean }) {
  const mesh = useRef<InstancedMesh>(null)
  useLayoutEffect(() => {
    const dummy = new Object3D()
    boxes.forEach((box, i) => {
      dummy.position.set(...box.position); dummy.rotation.set(0, box.angle ?? 0, 0); dummy.scale.set(...box.size); dummy.updateMatrix()
      mesh.current?.setMatrixAt(i, dummy.matrix)
    })
    if (mesh.current) { mesh.current.instanceMatrix.needsUpdate = true; mesh.current.computeBoundingSphere() }
  }, [boxes])
  return <instancedMesh ref={mesh} args={[undefined, undefined, boxes.length]} castShadow receiveShadow>
    <boxGeometry args={[1, 1, 1]} />
    <meshStandardMaterial onBeforeCompile={applyNightWindows} color={color} roughness={night ? .45 : .8} emissive={night ? '#ffc274' : '#000000'} emissiveIntensity={night ? .7 : 0} />
  </instancedMesh>
}

export function Sign({ text, width, height, position, font = 'Arial, sans-serif', color = '#163c70' }: { text: string; width: number; height: number; position: [number, number, number]; font?: string; color?: string }) {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas'); canvas.width = 2048; canvas.height = 192
    const context = canvas.getContext('2d')!
    context.fillStyle = color; context.font = `700 118px ${font}`; context.textAlign = 'center'; context.textBaseline = 'middle'
    context.fillText(text, 1024, 100, 1960)
    const map = new CanvasTexture(canvas); map.colorSpace = SRGBColorSpace; map.anisotropy = 4
    return map
  }, [text, font, color])
  useEffect(() => () => texture.dispose(), [texture])
  return <mesh position={position}>
    <planeGeometry args={[width, height]} />
    <meshBasicMaterial map={texture} transparent toneMapped={false} depthWrite={false} />
  </mesh>
}

export function Roof({ vertices, indices }: { vertices: number[]; indices: number[] }) {
  const geometry = useMemo(() => {
    const value = new BufferGeometry(); value.setAttribute('position', new Float32BufferAttribute(vertices, 3)); value.setIndex(indices); value.computeVertexNormals()
    return value
  }, [vertices, indices])
  useEffect(() => () => geometry.dispose(), [geometry])
  return <mesh geometry={geometry} castShadow receiveShadow>
    <meshStandardMaterial color="#b95f3c" side={DoubleSide} roughness={.9} onBeforeCompile={applyPitchedRoofTiles} />
  </mesh>
}

