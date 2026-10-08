import { createAvatarGeometry } from '../lib/avatarGeometry'
import type { AvatarStyle } from '../lib/profile'
import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { BoxGeometry, Color, Float32BufferAttribute, SphereGeometry, TorusGeometry } from 'three'
import type { BufferGeometry, Group } from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { AvatarMotion } from '../lib/avatarMotion'

// One draw call for distant visitors. Close friends keep the articulated model.
export default function CrowdAvatar({ style = 'boy', motion, color, seated = false, passenger = false, vehicle = 'walk' }: { style?: AvatarStyle; motion: React.RefObject<AvatarMotion>; color: string; seated?: boolean; passenger?: boolean; vehicle?: 'walk' | 'bicycle' | 'buggy' }) {
  const root = useRef<Group>(null)
  const geometry = useMemo(() => {
    const pieces: { geometry: BufferGeometry; x: number; y: number; z: number; color: string }[] = [
      { geometry: new BoxGeometry(.47, .49, .31), x: 0, y: 1.19, z: 0, color },
      { geometry: new SphereGeometry(.215, 8, 6), x: 0, y: 1.72, z: 0, color: '#cf9871' },
      { geometry: createAvatarGeometry([{ shape: 'scalp', sweep: style === 'boy' ? 1 : 0, size: [.224, 1.12, style === 'girl' ? 2.3 : 2.15], at: [0, 0, 0], scale: [.95, 1.03, .9] }]), x: 0, y: 1.725, z: -.008, color: '#242529' },
      { geometry: new BoxGeometry(.01, .38, .015), x: 0, y: 1.19, z: -.162, color: '#f1ead4' },
      { geometry: new BoxGeometry(.46, .065, .322), x: 0, y: .96, z: 0, color: '#253735' },
      { geometry: new BoxGeometry(.34, .009, .012), x: 0, y: 1.32, z: .157, color: '#f1ead4' },
      ...(style === 'girl' ? [{ geometry: new SphereGeometry(.1, 6, 4).scale(.8, 1.6, .8), x: .025, y: 1.63, z: .28, color: '#242529' }] : []),
      ...[-.12, .12].flatMap(x => seated || vehicle !== 'walk' ? [
        { geometry: new BoxGeometry(.15, .15, .42), x, y: .88, z: -.2, color: '#304255' },
        { geometry: new BoxGeometry(.15, .27, .15), x, y: .71, z: -.42, color: '#304255' },
      ] : [{ geometry: new BoxGeometry(.15, .78, .18), x, y: .43, z: 0, color: '#304255' }]),
      ...[-.12, .12].map(x => ({ geometry: new BoxGeometry(.18, .11, .29), x, y: seated || vehicle !== 'walk' ? .61 : .068, z: seated || vehicle !== 'walk' ? -.47 : -.07, color: '#f8f5e9' })),
      ...[-.29, .29].flatMap(x => [
        { geometry: new BoxGeometry(.12, .48, .13), x, y: 1.12, z: 0, color: '#f1ead4' },
        { geometry: new BoxGeometry(.125, .025, .135), x, y: 1.23, z: 0, color },
        { geometry: new BoxGeometry(.125, .04, .135), x, y: .91, z: 0, color: '#253735' },
      ]),
    ].map(part => ({ ...part, x: part.x + (vehicle === 'buggy' ? .36 : 0), y: part.y + (vehicle === 'buggy' ? -.03 : passenger ? -.26 : seated ? -.55 : vehicle === 'bicycle' ? .15 : 0), z: part.z + (vehicle === 'buggy' ? -.46 : 0) }))
    if (vehicle === 'bicycle') {
      for (const z of [-.7,.7]) pieces.push({ geometry: new TorusGeometry(.34,.04,4,12).rotateY(Math.PI/2), x:0,y:.37,z,color:'#202c31' })
      pieces.push({geometry:new BoxGeometry(.06,.55,1.1),x:0,y:.72,z:0,color})
    } else if (vehicle === 'buggy') {
      pieces.push({geometry:new BoxGeometry(1.66,.18,3.5),x:0,y:.35,z:0,color:'#31554f'}, {geometry:new BoxGeometry(1.75,.12,2.75),x:0,y:1.98,z:.08,color:'#f0e4c8'})
      for (const x of [-.81,.81]) for (const z of [-1.08,1.08]) pieces.push({geometry:new BoxGeometry(.2,.6,.6),x,y:.33,z,color:'#202c31'})
    }
    const colored = pieces.map(part => {
      part.geometry.translate(part.x, part.y, part.z)
      const c = new Color(part.color), count = part.geometry.getAttribute('position').count, colors = new Float32Array(count * 3)
      for (let i = 0; i < count; i++) colors.set([c.r, c.g, c.b], i * 3)
      part.geometry.setAttribute('color', new Float32BufferAttribute(colors, 3))
      return part.geometry
    })
    const result = mergeGeometries(colored)!
    colored.forEach(piece => piece.dispose()); return result
  }, [style, color, seated, passenger, vehicle])
  useEffect(() => () => geometry.dispose(), [geometry])
  useFrame(() => {
    if (!root.current || motion.current.paused) return
    root.current.position.y = vehicle === 'walk' && !seated && motion.current.moving ? Math.sin(motion.current.phase * 2) * .025 : 0
  })
  return <group ref={root} name="distant-campus-avatar"><mesh geometry={geometry}><meshStandardMaterial vertexColors roughness={.9} /></mesh></group>
}
