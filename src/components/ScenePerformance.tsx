import { createContext, useContext, useEffect, useLayoutEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import type { Group } from 'three'
import { detailVisible, GRAPHICS_PROFILES } from '../lib/graphics'
import type { GraphicsProfile } from '../lib/graphics'

export const GraphicsContext = createContext<GraphicsProfile>(GRAPHICS_PROFILES[1])

export function DistantDetail({ center, radius, selected = false, children }: { center: readonly number[]; radius: number; selected?: boolean; children: ReactNode }) {
  const group = useRef<Group>(null), elapsed = useRef(1), profile = useContext(GraphicsContext)
  const gl = useThree(s => s.gl)
  useFrame(({ camera }, delta) => {
    elapsed.current += delta
    if (elapsed.current < .2 || !group.current) return
    elapsed.current = 0
    const visible = detailVisible(camera.position, center, radius, profile.detailDistance, group.current.visible, selected)
    if (group.current.visible !== visible) { group.current.visible = visible; gl.shadowMap.needsUpdate = true }
  })
  useLayoutEffect(() => { elapsed.current = 1 }, [profile, selected, center, radius])
  return <group ref={group} name="nearby-building-details">{children}</group>
}

export default function ScenePerformance({ dynamicShadows, revision }: { dynamicShadows: boolean; revision: unknown }) {
  const gl = useThree(s => s.gl), setFrameloop = useThree(s => s.setFrameloop), invalidate = useThree(s => s.invalidate)
  const profile = useContext(GraphicsContext)
  const shadowElapsed = useRef(0)
  useFrame((_, delta) => {
    if (!dynamicShadows) return
    shadowElapsed.current += delta
    if (shadowElapsed.current >= 1 / profile.shadowRate) {
      shadowElapsed.current %= 1 / profile.shadowRate
      gl.shadowMap.needsUpdate = true
    }
  })
  useLayoutEffect(() => {
    gl.shadowMap.autoUpdate = false
    shadowElapsed.current = 0
    gl.shadowMap.needsUpdate = true
  }, [gl, dynamicShadows, revision, profile])
  useEffect(() => {
    const visible = () => { setFrameloop(document.hidden ? 'never' : 'always'); if (!document.hidden) invalidate() }
    document.addEventListener('visibilitychange', visible); visible()
    return () => { document.removeEventListener('visibilitychange', visible); setFrameloop('always'); gl.shadowMap.autoUpdate = true }
  }, [gl, setFrameloop, invalidate])
  return null
}
