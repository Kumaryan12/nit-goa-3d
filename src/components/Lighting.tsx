import { sceneConfig } from '../lib/sceneConfig'

export default function Lighting({ groundSize = sceneConfig.groundSize, night = false }: { groundSize?: number; night?: boolean }) {
  const scale = groundSize / sceneConfig.groundSize
  const [sunX, sunY, sunZ] = sceneConfig.sunPosition
  const shadowExtent = groundSize / 2
  return <>
    <ambientLight color={night ? '#94b2de' : '#f5f7ff'} intensity={night ? 0.32 : 0.65} />
    <hemisphereLight args={[night ? '#749dcc' : '#d9eeff', night ? '#1c2b30' : '#7b8c52', night ? 0.4 : 0.8]} />
    <directionalLight color={night ? '#a2c4f8' : '#fff2d4'}
      position={[sunX * scale, sunY * scale, sunZ * scale]} intensity={night ? 0.8 : 2.3} castShadow
      shadow-mapSize={[2048, 2048]} shadow-camera-left={-shadowExtent} shadow-camera-right={shadowExtent}
      shadow-camera-top={shadowExtent} shadow-camera-bottom={-shadowExtent} shadow-camera-near={1}
      shadow-camera-far={600 * scale} shadow-bias={-0.00015} shadow-normalBias={0.16} />
  </>
}
