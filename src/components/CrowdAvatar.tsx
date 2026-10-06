import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { BoxGeometry, Color, Float32BufferAttribute, SphereGeometry, TorusGeometry } from 'three'
import type { BufferGeometry, Group } from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { AvatarMotion } from '../lib/avatarMotion'

// One draw call for distant visitors. Close friends keep the articulated model.
export default function CrowdAvatar({ motion, color, seated = false, passenger = false, vehicle = 'walk' }: { motion: React.RefObject<AvatarMotion>; color: string; seated?: boolean; passenger?: boolean; vehicle?: 'walk' | 'bicycle' | 'buggy' }) {
  const root = useRef<Group>(null)
  const geometry = useMemo(() => {
    const pieces: { geometry: BufferGeometry; x: number; y: number; z: number; color: string }[] = [
      { geometry: new BoxGeometry(.42, .54, .27), x: 0, y: 1.15, z: 0, color },
      { geometry: new SphereGeometry(.19, 8, 6), x: 0, y: 1.68, z: 0, color: '#c99066' },
      ...[-.12, .12].flatMap(x => seated || vehicle !== 'walk' ? [
        { geometry: new BoxGeometry(.15, .15, .42), x, y: .88, z: -.2, color: '#304255' },
        { geometry: new BoxGeometry(.15, .27, .15), x, y: .71, z: -.42, color: '#304255' },
      ] : [{ geometry: new BoxGeometry(.15, .78, .18), x, y: .43, z: 0, color: '#304255' }]),
      ...[-.29, .29].map(x => ({ geometry: new BoxGeometry(.12, .48, .13), x, y: 1.12, z: 0, color })),
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
  }, [color, seated, passenger, vehicle])
  useEffect(() => () => geometry.dispose(), [geometry])
  useFrame(() => {
    if (!root.current || motion.current.paused) return
    root.current.position.y = vehicle === 'walk' && !seated && motion.current.moving ? Math.sin(motion.current.phase * 2) * .025 : 0
  })
  return <group ref={root} name="distant-campus-avatar"><mesh geometry={geometry}><meshStandardMaterial vertexColors roughness={.9} /></mesh></group>
}
