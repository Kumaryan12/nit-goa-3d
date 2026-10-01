import { sceneConfig } from '../lib/sceneConfig'

interface GroundProps {
  showGrid?: boolean
  size?: number
}

export default function Ground({ showGrid = true, size = sceneConfig.groundSize }: GroundProps) {
  const { gridSpacing, groundColor } = sceneConfig

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[size, size]} />
        <meshStandardMaterial color={groundColor} roughness={1} metalness={0} />
      </mesh>
      {showGrid && (
        <gridHelper
          args={[size, Math.round(size / gridSpacing), '#999d8d', '#b8b9aa']}
          position={[0, 0.02, 0]}
        />
      )}
    </group>
  )
}
