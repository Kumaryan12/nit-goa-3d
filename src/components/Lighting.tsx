import { sceneConfig } from '../lib/sceneConfig'

export default function Lighting({ groundSize = sceneConfig.groundSize }: { groundSize?: number }) {
  const scale = groundSize / sceneConfig.groundSize
  const [sunX, sunY, sunZ] = sceneConfig.sunPosition
  const shadowExtent = groundSize / 2
  return (
    <>
      <ambientLight color="#f5f7ff" intensity={0.8} />
      <directionalLight
        color="#fff3dc"
        position={[sunX * scale, sunY * scale, sunZ * scale]}
        intensity={2.5}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-shadowExtent}
        shadow-camera-right={shadowExtent}
        shadow-camera-top={shadowExtent}
        shadow-camera-bottom={-shadowExtent}
        shadow-camera-near={1}
        shadow-camera-far={600 * scale}
        shadow-normalBias={0.05}
      />
    </>
  )
}
