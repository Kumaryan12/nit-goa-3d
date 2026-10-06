import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { CanvasTexture, DoubleSide, MeshStandardMaterial, PlaneGeometry, SRGBColorSpace } from 'three'
import { INDIAN_FLAG } from '../lib/campusFlag'
import type { CampusFlagLayout } from '../lib/campusFlag'

function flagTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = 768; canvas.height = 512
  const ctx = canvas.getContext('2d')!
  const { width: w, height: h } = canvas
  for (const [index, color] of [INDIAN_FLAG.saffron, INDIAN_FLAG.white, INDIAN_FLAG.green].entries()) {
    ctx.fillStyle = color; ctx.fillRect(0, index * h / 3, w, h / 3)
  }
  ctx.translate(w / 2, h / 2)
  const r = h / 3 * .43
  ctx.strokeStyle = INDIAN_FLAG.chakra; ctx.fillStyle = INDIAN_FLAG.chakra
  ctx.lineWidth = 4
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke()
  ctx.beginPath(); ctx.arc(0, 0, r * .105, 0, Math.PI * 2); ctx.fill()
  ctx.lineWidth = 2
  for (let i = 0; i < INDIAN_FLAG.spokes; i++) {
    const a = i * Math.PI * 2 / INDIAN_FLAG.spokes
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); ctx.stroke()
  }
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace; texture.anisotropy = 4
  return texture
}

// The printed Chakra moves with the cloth, with a fixed hoist and GPU normals.
const windShader = `
uniform float flagTime;
float flagWind(vec2 p) {
  return pow(p.x, 1.3) * (.22 * sin(p.x * 8. - p.y * 3. + flagTime * 2.2)
    + .075 * sin(p.x * 17. + p.y * 5. - flagTime * 3.6));
}
vec3 flagNormal(vec2 p) {
  float a = p.x * 8. - p.y * 3. + flagTime * 2.2;
  float b = p.x * 17. + p.y * 5. - flagTime * 3.6;
  float envelope = pow(p.x, 1.3);
  float dx = 1.3 * pow(p.x, .3) * (.22 * sin(a) + .075 * sin(b))
    + envelope * (1.76 * cos(a) + 1.275 * cos(b));
  float dy = envelope * (-.66 * cos(a) + .375 * cos(b));
  return normalize(vec3(-dx / 4.5, -dy / 3., 1.));
}`

export default function CampusNationalFlag({ flag, night }: { flag: CampusFlagLayout; night: boolean }) {
  const time = useMemo(() => ({ value: 0 }), [])
  const reducedMotion = useRef(false)
  const texture = useMemo(flagTexture, [])
  const geometry = useMemo(() => {
    const plane = new PlaneGeometry(INDIAN_FLAG.width, INDIAN_FLAG.height, 32, 12)
    plane.computeBoundingSphere(); plane.boundingSphere!.radius += .3
    return plane
  }, [])
  const material = useMemo(() => {
    const cloth = new MeshStandardMaterial({ map: texture, roughness: .95, side: DoubleSide, emissive: '#ffffff' })
    cloth.onBeforeCompile = shader => {
      shader.uniforms.flagTime = time
      // Three's source starts with a preprocessor directive, which must begin
      // on its own line after our wind function's closing brace.
      shader.vertexShader = `${windShader}\n${shader.vertexShader}`
      shader.vertexShader = shader.vertexShader.replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nobjectNormal = flagNormal(uv);')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed.z += flagWind(uv);')
    }
    cloth.customProgramCacheKey = () => 'campus-national-flag-wind-v2'
    return cloth
  }, [texture, time])
  useEffect(() => { material.emissiveIntensity = night ? .08 : 0 }, [material, night])
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => { reducedMotion.current = media.matches }
    update(); media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])
  useEffect(() => () => { texture.dispose(); geometry.dispose(); material.dispose() }, [texture, geometry, material])
  useFrame(({ clock }) => { time.value = reducedMotion.current ? 0 : clock.elapsedTime })
  const { poleHeight: height, poleRadius: radius, baseRadius, width, height: clothHeight } = INDIAN_FLAG
  return <group name="campus-national-flag" position={[flag.x, flag.y, flag.z]} rotation={[0, flag.rotation, 0]}>
    <mesh position={[0, -flag.baseHeight / 2, 0]} castShadow receiveShadow>
      <cylinderGeometry args={[baseRadius, baseRadius, flag.baseHeight, 32]} />
      <meshStandardMaterial color="#d6cbb5" roughness={.93} />
    </mesh>
    <mesh position={[0, .085, 0]} castShadow receiveShadow><cylinderGeometry args={[.55, .64, .17, 20]} /><meshStandardMaterial color="#adaca5" roughness={.65} /></mesh>
    <mesh name="national-flag-mast" position={[0, height / 2, 0]} castShadow>
      <cylinderGeometry args={[.055, radius, height, 16]} />
      <meshStandardMaterial color="#c5ced1" metalness={.65} roughness={.3} />
    </mesh>
    <mesh position={[0, height + .07, 0]} castShadow><sphereGeometry args={[.11, 12, 8]} /><meshStandardMaterial color="#c5ced1" metalness={.65} roughness={.3} /></mesh>
    <mesh name="indian-tricolour" geometry={geometry} material={material} position={[width / 2 + .07, height - .28 - clothHeight / 2, 0]} />
    <mesh position={[.12, height / 2, -.04]}><cylinderGeometry args={[.013, .013, height - .4, 6]} /><meshStandardMaterial color="#e9e5d8" /></mesh>
  </group>
}
