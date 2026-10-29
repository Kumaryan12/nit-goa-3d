import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import type { ScenePhotoCapture as Capture } from '../lib/postcard'

// One extra render only on capture; no persistent GPU buffer or per-frame readback.
export default function ScenePhotoCapture({ target }: { target?: React.RefObject<Capture | null> }) {
  const invalidate = useThree(state => state.invalidate)
  const pending = useRef<{ resolve: (canvas: HTMLCanvasElement) => void; reject: (error: Error) => void; timer: number } | null>(null)
  useEffect(() => {
    if (!target) return
    const capture = () => new Promise<HTMLCanvasElement>((resolve, reject) => {
      if (pending.current) { reject(Error('A photo is already being taken.')); return }
      const timer = window.setTimeout(() => {
        pending.current = null
        reject(Error('The campus paused before the photo was ready. Return to this tab and try again.'))
      }, 8000)
      pending.current = { resolve, reject, timer }; invalidate()
    })
    const handle = { capture }; target.current = handle
    return () => {
      if (target.current === handle) target.current = null
      if (pending.current) { clearTimeout(pending.current.timer); pending.current.reject(Error('The campus closed before the photo was ready.')); pending.current = null }
    }
  }, [target, invalidate])
  useFrame(({ gl, scene, camera }) => {
    const request = pending.current
    if (!request) return
    pending.current = null; clearTimeout(request.timer)
    try {
      if (gl.getContext().isContextLost()) throw Error('The campus renderer is recovering. Try again shortly.')
      gl.render(scene, camera)
      const source = gl.domElement, canvas = document.createElement('canvas')
      // Bound memory even on large/high-DPI monitors. Preserve the viewport ratio.
      const scale = Math.min(1, 2048 / Math.max(source.width, source.height))
      canvas.width = Math.max(1, Math.round(source.width * scale)); canvas.height = Math.max(1, Math.round(source.height * scale))
      const context = canvas.getContext('2d')
      if (!context) throw Error('Your browser could not take this photo.')
      context.drawImage(source, 0, 0, canvas.width, canvas.height)
      request.resolve(canvas)
    } catch (error) { request.reject(error instanceof Error ? error : Error('The photo could not be taken. Try again.')) }
  })
  return null
}
