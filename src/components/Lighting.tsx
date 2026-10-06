import { sceneConfig } from '../lib/sceneConfig'
import { useContext, useLayoutEffect, useRef } from 'react'
import type { DirectionalLight } from 'three'
import { GraphicsContext } from './ScenePerformance'

export default function Lighting({ groundSize = sceneConfig.groundSize, night = false }: { groundSize?: number; night?: boolean }) {
  const scale = groundSize / sceneConfig.groundSize
  const [sunX, sunY, sunZ] = sceneConfig.sunPosition
  const shadowExtent = groundSize / 2
  const light = useRef<DirectionalLight>(null), { shadowSize } = useContext(GraphicsContext)
  useLayoutEffect(() => {
    const shadow = light.current?.shadow
    if (shadow?.map && shadow.map.width !== shadowSize) { shadow.map.dispose(); shadow.map = null; shadow.needsUpdate = true }
  }, [shadowSize])
  return <>
    {night&&<mesh name="campus-moon" position={[-groundSize*.55,groundSize*.8,-groundSize*.8]} raycast={()=>null}>
      <sphereGeometry args={[groundSize*.016,24,16]}/><meshBasicMaterial color="#dce7ff" toneMapped={false} fog={false}/>
    </mesh>}
    <ambientLight color={night ? '#a6bce0' : '#ecf4ef'} intensity={night ? 0.26 : 0.5} />
    <hemisphereLight args={[night ? '#92b0dc' : '#deedf4', night ? '#243247' : '#547458', night ? 0.5 : 0.85]} />
    <directionalLight ref={light} color={night ? '#c0d3fa' : '#fff6e6'}
      position={[sunX * scale, sunY * scale, sunZ * scale]} intensity={night ? 0.65 : 1.85} castShadow
      shadow-mapSize={[shadowSize, shadowSize]} shadow-camera-left={-shadowExtent} shadow-camera-right={shadowExtent}
      shadow-camera-top={shadowExtent} shadow-camera-bottom={-shadowExtent} shadow-camera-near={1}
      shadow-camera-far={600 * scale} shadow-bias={-0.00015} shadow-normalBias={0.16} />
  </>
}
