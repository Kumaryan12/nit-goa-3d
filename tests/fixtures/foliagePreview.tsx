// Development-only browser GPU regression fixture. No accounts or network.
import { StrictMode, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Sky, Stars } from '@react-three/drei'
import { Color, PCFShadowMap, PerspectiveCamera, WebGLRenderTarget } from 'three'
import Vegetation from '../../src/components/Vegetation'
import Lighting from '../../src/components/Lighting'
import CampusNationalFlag from '../../src/components/CampusNationalFlag'
import ScenePerformance from '../../src/components/ScenePerformance'
import { sceneConfig } from '../../src/lib/sceneConfig'
import type { TreeInstance } from '../../src/lib/vegetation'

const trees: TreeInstance[] = [-6, -2, 2, 6].map((x, i) => ({ x, y: 0, z: 0, palm: i % 2 === 0, scale: 1, rotation: i * .7, shade: .3 + i * .1 }))
const modes = ['Day', 'Night', 'Day again']
function Check({ phase, advance, report }: { phase: number; advance: () => void; report: (text: string) => void }) {
  const frames = useRef(0), done = useRef(-1), errors = useRef<string[]>([]), ready = useRef(false), results = useRef<string[]>([])
  const gl = useThree(s => s.gl), target = useMemo(() => new WebGLRenderTarget(128, 128), [])
  const night = phase === 1
  const onReady = useCallback(() => { ready.current = true }, [])
  useEffect(() => {
    const previous = gl.debug.onShaderError
    gl.debug.onShaderError = (context, _, vertex, fragment) => { errors.current.push([context.getShaderInfoLog(vertex), context.getShaderInfoLog(fragment)].join(' ')) }
    return () => { gl.debug.onShaderError = previous; target.dispose() }
  }, [gl, target])
  useEffect(() => { frames.current = 0 }, [phase])
  useFrame(({ scene, camera }) => {
    if (!ready.current) return
    const vegetation = scene.getObjectByName('campus-landscaped-trees')
    vegetation?.children.forEach((mesh, i) => mesh.layers.set(i + 1))
    scene.getObjectByName('indian-tricolour')?.layers.set(5)
    scene.traverse(object => {
      if ('isLight' in object) object.layers.enableAll()
      if ('shadow' in object && object.shadow && typeof object.shadow === 'object' && 'camera' in object.shadow) (object.shadow.camera as PerspectiveCamera).layers.enableAll()
    })
    camera.layers.enableAll(); gl.setRenderTarget(null); gl.render(scene, camera)
    if (++frames.current < 25 || done.current === phase) return
    done.current = phase
    const pixels = new Uint8Array(128 * 128 * 4), counts: number[] = []
    const background = scene.background, clear = gl.getClearColor(new Color()), alpha = gl.getClearAlpha(), mask = camera.layers.mask
    const perspective = camera as PerspectiveCamera, aspect = perspective.aspect
    scene.background = null; gl.setClearColor('#000000', 0); perspective.aspect = 1; perspective.updateProjectionMatrix()
    for (let layer = 1; layer <= 5; layer++) {
      camera.layers.set(layer); gl.setRenderTarget(target); gl.render(scene, camera)
      gl.readRenderTargetPixels(target, 0, 0, 128, 128, pixels)
      let visible = 0; for (let i = 3; i < pixels.length; i += 4) if (pixels[i] > 0) visible++
      counts.push(visible)
    }
    camera.layers.mask = mask; perspective.aspect = aspect; perspective.updateProjectionMatrix()
    scene.background = background; gl.setClearColor(clear, alpha); gl.setRenderTarget(null); gl.render(scene, camera)
    const passed = counts.every(n => n > 0) && errors.current.length === 0
    results.current.push(`${modes[phase]}: ${passed ? 'PASS' : 'FAIL'} · trunks/crowns/lobes/palms/flag pixels ${counts.join('/')} · shader errors ${errors.current.length}`)
    report(results.current.join('\n') + (errors.current.length ? `\n${errors.current.join('\n')}` : ''))
    if (phase < 2) advance()
  }, 1)
  return <>
    <color attach="background" args={[night ? '#101b30' : '#dcebe9']} />
    {night ? <Stars radius={3000} depth={150} count={100} /> : <Sky distance={450000} sunPosition={sceneConfig.sunPosition} turbidity={2.4} rayleigh={1.1} />}
    <ScenePerformance dynamicShadows={false} revision={phase} />
    <Lighting night={night} />
    {night && Array.from({ length: 8 }, (_, i) => <pointLight key={i} position={[i * 2 - 8, 12, 2]} intensity={75} distance={22} />)}
    <Vegetation trees={trees} onReady={onReady} />
    <CampusNationalFlag flag={{ x: 10, y: 0, z: 0, baseElevation: -.3, baseHeight: .3, rotation: 0 }} night={night} />
  </>
}
function Preview() {
  const [phase, setPhase] = useState(0), [report, setReport] = useState('Preparing GPU check…')
  const advance = useCallback(() => setPhase(p => p + 1), [])
  return <><header><h1>Campus foliage GPU check</h1><p>Production trees, wind materials, flag and lighting; fixed camera; actual framebuffer coverage.</p><pre role="status">{report}</pre></header>
    <Canvas shadows={{ type: PCFShadowMap }} dpr={1} camera={{ position: [18, 14, 30], fov: 45, near: 1, far: 10000 }} onCreated={({ camera }) => camera.lookAt(0, 6, 0)}>
      <Check phase={phase} advance={advance} report={setReport} />
    </Canvas></>
}
createRoot(document.getElementById('root')!).render(<StrictMode><Preview /></StrictMode>)
