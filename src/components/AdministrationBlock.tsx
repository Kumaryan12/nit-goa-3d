import { useMemo } from 'react'
import { Shape } from 'three'
import { facadePoint, instituteHindiSign, instituteSign } from '../lib/administrationFacade'
import type { AdministrationFacadePlan } from '../lib/administrationFacade'
import { Boxes, Sign, Roof } from './BuildingFacadeParts'
import type { Box } from './BuildingFacadeParts'

const cream = '#f0deaf', white = '#f5f0df'

export default function AdministrationBlock({ plan, night }: { plan: AdministrationFacadePlan; night: boolean }) {
  const { front, width, height, depth, porticoWidth: porch, porticoDepth: out } = plan
  const windows = useMemo(() => {
    const frames: Box[] = [], panes: Box[] = [], trim: Box[] = []
    for (const wall of plan.walls) {
      const count = Math.max(1, Math.floor(wall.length / 3.7)), spacing = wall.length / count
      const isFront = wall === plan.front
      for (let floor = 0; floor < plan.floors; floor++) for (let i = 0; i < count; i++) {
        const u = (i + .5) * spacing - wall.length / 2
        if (isFront && floor === 0 && Math.abs(u) < 3.5) continue
        const y = 1.8 + floor * (height - .9) / plan.floors, w = Math.min(1.85, spacing - .8), h = 1.65
        const box = (offset: number, size: Box['size'], du = 0, dy = 0): Box => {
          const p = facadePoint(wall, u + du, offset)
          return { position: [p.x, y + dy, p.z], size, angle: wall.angle }
        }
        frames.push(box(.10, [w + .30, h + .30, .18]), box(.22, [.075, h, .08]), box(.22, [w, .065, .08], 0, -.28), box(.25, [w + .52, .13, .4], 0, -h / 2 - .1))
        panes.push(box(.20, [w, h, .08]))
      }
      for (const y of [.22, height - .1]) {
        const p = facadePoint(wall, 0, .13)
        trim.push({ position: [p.x, y, p.z], size: [wall.length + .3, .22, .34], angle: wall.angle })
      }
      for (let i = 0; i <= count; i++) {
        if (i % 2 !== 0 && i !== count) continue
        const p = facadePoint(wall, (i / count - .5) * (wall.length - .3), .14)
        trim.push({ position: [p.x, height / 2, p.z], size: [.26, height, .25], angle: wall.angle })
      }
    }
    return { frames, panes, trim }
  }, [plan, height])
  const crown = useMemo(() => {
    const w = width * .39, shape = new Shape()
    shape.moveTo(-w / 2, 0); shape.lineTo(w / 2, 0); shape.quadraticCurveTo(0, 3.4, -w / 2, 0)
    return shape
  }, [width])
  const porchColumns = useMemo(() => {
    const count = Math.max(4, Math.round(porch / 4.2)), positions = Array.from({ length: count + 1 }, (_, i) => (i / count - .5) * porch)
    return positions.filter(x => Math.abs(x) > 2.8)
  }, [porch])
  const arches = useMemo(() => {
    const bays = Math.max(4, Math.round(porch / 4.2)), span = porch / bays, shape = new Shape()
    shape.moveTo(-span / 2, .6); shape.lineTo(span / 2, .6); shape.lineTo(span / 2, 0); shape.quadraticCurveTo(0, .8, -span / 2, 0); shape.closePath()
    return { shape, centers: Array.from({ length: bays }, (_, i) => (i + .5) * span - porch / 2).filter(x => Math.abs(x) > 3.3) }
  }, [porch])
  const roofs = useMemo(() => {
    const half = width / 2 + .3, back = -depth - .3, ridgeY = height + Math.min(2.6, depth * .13), ridgeHalf = Math.max(0, half - depth / 2)
    return {
      main: [-half, height + .1, .3, half, height + .1, .3, half, height + .1, back, -half, height + .1, back, -ridgeHalf, ridgeY, -depth / 2, ridgeHalf, ridgeY, -depth / 2],
      porch: [-porch / 2 - .3, 3.65, .05, porch / 2 + .3, 3.65, .05, porch / 2 + .3, 3.2, out + .35, -porch / 2 - .3, 3.2, out + .35],
      entry: [-3.6, 3.45, out - .3, 0, 4.35, out - .3, 3.6, 3.45, out - .3, -3.6, 3.45, 5.6, 0, 4.35, 5.6, 3.6, 3.45, 5.6],
    }
  }, [width, depth, height, porch, out])
  const gable = useMemo(() => {
    const shape = new Shape(); shape.moveTo(-3.45, 0); shape.lineTo(3.45, 0); shape.lineTo(0, .88); shape.closePath(); return shape
  }, [])
  return <group name="administration-facade">
    <Boxes boxes={windows.frames} color={white} />
    <Boxes boxes={windows.trim} color={white} />
    <Boxes boxes={windows.panes} color={night ? '#b5a079' : '#526c77'} night={night} />
    <group position={[front.center.x, 0, front.center.z]} rotation={[0, front.angle, 0]}>
      {plan.pitchedRoof && <Roof vertices={roofs.main} indices={[0, 4, 5, 0, 5, 1, 1, 5, 2, 2, 5, 4, 2, 4, 3, 3, 4, 0]} />}
      <mesh position={[0, height + .05, .15]} castShadow><boxGeometry args={[width * .78, 1.25, .6]} /><meshStandardMaterial color={cream} roughness={.9} /></mesh>
      <Sign text={instituteSign} width={width * .74} height={.86} position={[0, height + .06, .47]} />
      <mesh position={[0, height + 1.04, .02]} castShadow><boxGeometry args={[width * .58, .9, .6]} /><meshStandardMaterial color={cream} roughness={.9} /></mesh>
      <Sign text={instituteHindiSign} width={width * .54} height={.70} position={[0, height + 1.08, .34]} />
      <mesh position={[0, height + 1.57, -.12]} castShadow><extrudeGeometry args={[crown, { depth: .4, bevelEnabled: false }]} /><meshStandardMaterial color={cream} roughness={.9} /></mesh>
      {[-1, 1].map(side => <group key={side} position={[side * width * .32, 0, .04]}>
        <mesh position={[0, (height + 1.25) / 2, 0]} castShadow><boxGeometry args={[.75, height + 1.25, .75]} /><meshStandardMaterial color={cream} roughness={.9} /></mesh>
        <mesh position={[0, height + 1.3, 0]} castShadow><boxGeometry args={[2.2, .18, 1.25]} /><meshStandardMaterial color={white} /></mesh>
      </group>)}
      {[{ w: width * .79, y: height + .73 }, { w: width * .60, y: height + 1.55 }, { w: width * .40, y: height + 1.64 }].map(({ w, y }) => <mesh key={y} position={[0, y, .18]} castShadow><boxGeometry args={[w, .14, .78]} /><meshStandardMaterial color={white} /></mesh>)}
      <mesh position={[0, 1.48, .13]}><boxGeometry args={[3.5, 2.95, .15]} /><meshStandardMaterial color="#263d43" roughness={.5} emissive="#dbc089" emissiveIntensity={night ? .15 : 0} /></mesh>
      <mesh position={[0, 1.48, .25]}><boxGeometry args={[.09, 2.9, .12]} /><meshStandardMaterial color={white} /></mesh>
      {plan.porchScale > .02 && <group scale={[1, 1, plan.porchScale]}>
      <Roof vertices={roofs.porch} indices={[0, 2, 1, 0, 3, 2]} />
      <mesh position={[0, 3.12, out + .15]} castShadow><boxGeometry args={[porch + .6, .22, .25]} /><meshStandardMaterial color={white} /></mesh>
      {porchColumns.map(x => <group key={x} position={[x, 0, out]}>
        <mesh position={[0, 1.65, 0]} castShadow><boxGeometry args={[.32, 3.1, .32]} /><meshStandardMaterial color={white} /></mesh>
        {[.18, 3.12].map(y => <mesh key={y} position={[0, y, 0]} castShadow><boxGeometry args={[.48, .25, .48]} /><meshStandardMaterial color={white} /></mesh>)}
      </group>)}
      {arches.centers.map(x => <mesh key={x} position={[x, 2.55, out + .03]} castShadow><extrudeGeometry args={[arches.shape, { depth: .20, bevelEnabled: false }]} /><meshStandardMaterial color={white} /></mesh>)}
      <Roof vertices={roofs.entry} indices={[0, 3, 4, 0, 4, 1, 1, 4, 5, 1, 5, 2]} />
      <mesh position={[0, 3.45, 5.57]} castShadow><extrudeGeometry args={[gable, { depth: .18, bevelEnabled: false }]} /><meshStandardMaterial color={white} /></mesh>
      <Sign text="ADMIN BLOCK" width={4.6} height={.36} position={[0, 3.7, 5.78]} />
      {[-3, 3].map(x => <group key={x} position={[x, 0, 5.1]}>
        <mesh position={[0, 1.8, 0]} castShadow><boxGeometry args={[.42, 3.3, .42]} /><meshStandardMaterial color={white} /></mesh>
        <mesh position={[0, .2, 0]} castShadow><boxGeometry args={[.65, .4, .65]} /><meshStandardMaterial color={white} /></mesh>
      </group>)}
      {[0, 1, 2].map(i => <mesh key={i} position={[0, .06 + i * .09, 4.1 - i * .3]} receiveShadow><boxGeometry args={[7.3, .12 + i * .18, 4.7 - i * .6]} /><meshStandardMaterial color="#c5b99f" roughness={.95} /></mesh>)}
      </group>}
    </group>
  </group>
}
