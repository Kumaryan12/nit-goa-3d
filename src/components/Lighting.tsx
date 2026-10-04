import { sceneConfig } from '../lib/sceneConfig'

export default function Lighting({ groundSize = sceneConfig.groundSize, night = false }: { groundSize?: number; night?: boolean }) {
  const scale = groundSize / sceneConfig.groundSize
  const [sunX, sunY, sunZ] = sceneConfig.sunPosition
  const shadowExtent = groundSize / 2
  return <>
    {night&&<mesh name="campus-moon" position={[-groundSize*.55,groundSize*.8,-groundSize*.8]} raycast={()=>null}>
      <sphereGeometry args={[groundSize*.016,24,16]}/><meshBasicMaterial color="#dce7ff" toneMapped={false} fog={false}/>
    </mesh>}
    <ambientLight color={night ? '#a6bce0' : '#f5f7ff'} intensity={night ? 0.26 : 0.65} />
    <hemisphereLight args={[night ? '#92b0dc' : '#d9eeff', night ? '#243247' : '#7b8c52', night ? 0.5 : 0.8]} />
    <directionalLight color={night ? '#c0d3fa' : '#fff2d4'}
      position={[sunX * scale, sunY * scale, sunZ * scale]} intensity={night ? 0.65 : 2.3} castShadow
      shadow-mapSize={[2048, 2048]} shadow-camera-left={-shadowExtent} shadow-camera-right={shadowExtent}
      shadow-camera-top={shadowExtent} shadow-camera-bottom={-shadowExtent} shadow-camera-near={1}
      shadow-camera-far={600 * scale} shadow-bias={-0.00015} shadow-normalBias={0.16} />
  </>
}
