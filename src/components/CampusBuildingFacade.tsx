import { useMemo } from 'react'
import { Shape } from 'three'
import type { CampusFacadePlan } from '../lib/campusFacade'
import { Boxes, Roof, Sign } from './BuildingFacadeParts'
import type { Box } from './BuildingFacadeParts'

const white = '#f5f1e6', glass = '#287583'
function GlassTower({ x, bottom, top, width, night }: { x: number; bottom: number; top: number; width: number; night: boolean }) {
  const grid = useMemo(() => {
    const boxes: Box[] = [], h = top - bottom, rows = Math.max(2, Math.round(h / 1.5))
    for (let i = 0; i <= rows; i++) boxes.push({ position: [x, bottom + h * i / rows, .46], size: [width, .055, .05] })
    for (const u of [-.5, -.25, 0, .25, .5]) boxes.push({ position: [x + u * width, (bottom + top) / 2, .46], size: [.055, h, .05] })
    return boxes
  }, [x, bottom, top, width])
  return <group>
    <mesh position={[x, (bottom + top) / 2, .13]} castShadow><boxGeometry args={[width + .45, top - bottom + .45, .4]} /><meshStandardMaterial color={white} /></mesh>
    <mesh position={[x, (bottom + top) / 2, .39]}><boxGeometry args={[width, top - bottom, .08]} /><meshStandardMaterial color={night ? '#7ea3ab' : glass} roughness={.2} metalness={.3} emissive="#f3ca82" emissiveIntensity={night ? .35 : 0} /></mesh>
    <Boxes boxes={grid} color="#31646d" />
  </group>
}
function ArchedGlass({ x, y, width, height, night }: { x: number; y: number; width: number; height: number; night: boolean }) {
  const arch = useMemo(() => {
    const s = new Shape(); s.moveTo(-width / 2, 0); s.lineTo(width / 2, 0); s.lineTo(width / 2, height - .5); s.quadraticCurveTo(0, height + .5, -width / 2, height - .5); s.closePath(); return s
  }, [width, height])
  return <group position={[x, y, .34]}>
    <mesh><shapeGeometry args={[arch]} /><meshStandardMaterial color={glass} roughness={.3} emissive="#d3ae74" emissiveIntensity={night ? .35 : 0} /></mesh>
    <mesh position={[0, height / 2 - .15, .03]}><boxGeometry args={[.065, height - .2, .05]} /><meshStandardMaterial color={white} /></mesh>
  </group>
}

export default function CampusBuildingFacade({ plan, night }: { plan: CampusFacadePlan; night: boolean }) {
  const { front, width, height, appearance, canopyWidth: canopy, canopyDepth: out } = plan
  const tutorial = appearance.style === 'tutorial', department = appearance.style === 'department', hostel = appearance.style === 'hostel', seminar = appearance.style === 'seminar', bank = appearance.style === 'bank'
  const canopyY = tutorial ? height - 1.1 : Math.min(3.3, height * .72)
  const shapes = useMemo(() => {
    const gable = new Shape(); gable.moveTo(-canopy / 2, 0); gable.lineTo(canopy / 2, 0); gable.lineTo(0, tutorial ? 1.4 : .75); gable.closePath()
    const span = Math.min(4.5, canopy / 4), arch = new Shape(); arch.moveTo(-span / 2, .5); arch.lineTo(span / 2, .5); arch.lineTo(span / 2, 0); arch.quadraticCurveTo(0, .8, -span / 2, 0); arch.closePath()
    return { gable, arch, span }
  }, [canopy, tutorial])
  const canopyRoof = useMemo(() => ({
    vertices: [-canopy / 2 - .15, canopyY + .12, .30, 0, canopyY + (tutorial ? 1.45 : .85), .3, canopy / 2 + .15, canopyY + .12, .3,
      -canopy / 2 - .15, canopyY + .12, out, 0, canopyY + (tutorial ? 1.45 : .85), out, canopy / 2 + .15, canopyY + .12, out],
    indices: [0, 3, 4, 0, 4, 1, 1, 4, 5, 1, 5, 2],
  }), [canopy, canopyY, out, tutorial])
  const verandaColumns = useMemo(() => {
    if (!department && !tutorial) return []
    return Array.from({ length: Math.max(2, Math.floor(canopy / shapes.span)) + 1 }, (_, i) => (i - Math.floor(canopy / shapes.span) / 2) * shapes.span).filter(x => Math.abs(x) > 2.5)
  }, [canopy, department, tutorial, shapes.span])
  return <group name={`campus-facade-${appearance.style}`}>
    <Boxes boxes={plan.frames} color={white} />
    <Boxes boxes={plan.trim} color={white} />
    <Boxes boxes={plan.panes} color={'#637a79'} night={night} />
    <Roof vertices={plan.roof.vertices} indices={plan.roof.indices} />
    <group position={[front.center.x, 0, front.center.z]} rotation={[0, front.angle, 0]}>
      {department && [-1.15, 1.15].map(x => <ArchedGlass key={x} x={x} y={height * .66} width={2.1} height={height * .24} night={night} />)}
      {hostel && <GlassTower x={0} bottom={3.2} top={height + .65} width={Math.min(5.4, width * .16)} night={night} />}
      {tutorial && [-1, 1].map(side => <GlassTower key={side} x={side * width * .42} bottom={.6} top={height + .45} width={Math.min(3.3, width * .06)} night={night} />)}
      {seminar && <>
        {[-.39, -.26, .26, .39].map(u => <GlassTower key={u} x={u * width} bottom={.7} top={height * .77} width={Math.min(3.1, width * .075)} night={night} />)}
        <mesh position={[0, height + .35, .05]}><boxGeometry args={[width * .48, .6, .4]} /><meshStandardMaterial color={white} /></mesh>
        <mesh position={[0, height + .66, .08]} scale={[width * .43 / Math.max(1, canopy), 1, 1]}><extrudeGeometry args={[shapes.gable, { depth: .22, bevelEnabled: false }]} /><meshStandardMaterial color={appearance.wall} /></mesh>
      </>}
      {bank && [-1, 1].map(side => <GlassTower key={side} x={side * width * .28} bottom={.65} top={height - .55} width={width * .24} night={night} />)}
      <mesh position={[0, 1.45, .14]}><boxGeometry args={[hostel ? 2 : 2.7, 2.85, .08]} /><meshStandardMaterial color="#2c4144" emissive="#c7b384" emissiveIntensity={night ? .15 : 0} /></mesh>
      {out > .8 && canopy > 3 && <>
        {bank || seminar || appearance.style === 'health' ? <mesh position={[0, canopyY, out / 2 + .15]} castShadow><boxGeometry args={[canopy + .3, .27, out - .05]} /><meshStandardMaterial color={white} /></mesh>
          : <><Roof vertices={canopyRoof.vertices} indices={canopyRoof.indices} /><mesh position={[0, canopyY + .08, out - .15]}><extrudeGeometry args={[shapes.gable, { depth: .14, bevelEnabled: false }]} /><meshStandardMaterial color={white} /></mesh></>}
        {[-1, 1].map(side => <group key={side} position={[side * (canopy / 2 - .35), 0, out - .35]}>
          <mesh position={[0, canopyY / 2, 0]} castShadow><boxGeometry args={[tutorial ? .6 : .35, canopyY, .4]} /><meshStandardMaterial color={white} /></mesh>
          <mesh position={[0, .15, 0]} castShadow><boxGeometry args={[.7, .3, .7]} /><meshStandardMaterial color={white} /></mesh>
        </group>)}
        {(department || tutorial) && verandaColumns.map((x, i) => <group key={x} position={[x, 0, Math.min(out - .35, 1.6)]}>
          <mesh position={[0, 1.4, 0]} castShadow><boxGeometry args={[.26, 2.8, .26]} /><meshStandardMaterial color={white} /></mesh>
          {i < verandaColumns.length - 1 && verandaColumns[i + 1] - x <= shapes.span + .1 && <mesh position={[shapes.span / 2, 2.65, 0]} castShadow><extrudeGeometry args={[shapes.arch, { depth: .14, bevelEnabled: false }]} /><meshStandardMaterial color={white} /></mesh>}
        </group>)}
      </>}
      <mesh position={[0, tutorial ? canopyY - .5 : 3.05, Math.max(.25, out - .08)]}><boxGeometry args={[Math.min(canopy - .3, 12), .55, .12]} /><meshStandardMaterial color="#333b38" /></mesh>
      <Sign text={plan.name.toUpperCase()} width={Math.min(canopy - .7, 11.6)} height={.38} position={[0, tutorial ? canopyY - .5 : 3.05, Math.max(.32, out)]} color={white} />
    </group>
  </group>
}
