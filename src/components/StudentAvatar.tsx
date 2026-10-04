import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { BoxGeometry, CapsuleGeometry, Euler, Matrix4, Quaternion, SphereGeometry, Vector3 } from 'three'
import type { Group } from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { avatarPose, motionDelta } from '../lib/avatarMotion'
import type { AvatarMotion } from '../lib/avatarMotion'

type Triple = [number, number, number]
interface Part { shape: 'box' | 'sphere' | 'capsule'; size: Triple; at: Triple; scale?: Triple; rotation?: Triple }
const capsule = (radius: number, length: number, at: Triple, scale?: Triple): Part => ({ shape: 'capsule', size: [radius, length, 0], at, scale })
const sphere = (radius: number, at: Triple, scale?: Triple): Part => ({ shape: 'sphere', size: [radius, 0, 0], at, scale })
const box = (size: Triple, at: Triple): Part => ({ shape: 'box', size, at })

// Merge fixed detail by material so facial features and clothing details do not
// each need a separate draw call in the multiplayer crowd.
function Parts({ parts, color, roughness = .85 }: { parts: Part[]; color: string; roughness?: number }) {
  const geometry = useMemo(() => {
    const pieces = parts.map(part => {
      const geometry = part.shape === 'capsule' ? new CapsuleGeometry(part.size[0], part.size[1], 4, 10)
        : part.shape === 'sphere' ? new SphereGeometry(part.size[0], 12, 8) : new BoxGeometry(...part.size)
      geometry.applyMatrix4(new Matrix4().compose(new Vector3(...part.at), new Quaternion().setFromEuler(new Euler(...(part.rotation ?? [0, 0, 0]))), new Vector3(...(part.scale ?? [1, 1, 1]))))
      return geometry
    })
    const combined = mergeGeometries(pieces)!
    pieces.forEach(piece => piece.dispose())
    return combined
  }, [parts])
  useEffect(() => () => geometry.dispose(), [geometry])
  return <mesh geometry={geometry} castShadow receiveShadow><meshStandardMaterial color={color} roughness={roughness} /></mesh>
}

const torsoParts = [capsule(.23, .22, [0, .31, 0], [1, 1, .66])]
const skinParts = [capsule(.07, .07, [0, .65, 0]), sphere(.20, [0, .84, -.01], [.91, 1.06, .88]), sphere(.043, [-.18, .84, 0]), sphere(.043, [.18, .84, 0]), sphere(.035, [0, .825, -.183], [.65, .75, 1])]
const hairParts = [sphere(.195, [0, .955, .015], [1, .63, .85]), sphere(.11, [-.10, .945, -.09], [1, .7, .8]), sphere(.115, [.075, .973, -.065], [1, .6, 1]), capsule(.028, .09, [-.175, .87, .025]), capsule(.028, .09, [.175, .87, .025])]
const faceParts = [sphere(.017, [-.065, .875, -.177], [1, 1.2, .5]), sphere(.017, [.065, .875, -.177], [1, 1.2, .5]), box([.045, .011, .013], [0, .767, -.178]), box([.05, .011, .013], [-.065, .911, -.168]), box([.05, .011, .013], [.065, .911, -.168])]
const bagParts = [capsule(.18, .16, [0, .31, .245], [1, 1, .53]), box([.27, .18, .065], [0, .23, .34])]
const straps = [capsule(.022, .47, [-.16, .32, -.157], [1, 1, .6]), capsule(.022, .47, [.16, .32, -.157], [1, 1, .6]), box([.23, .017, .015], [0, .31, .38])]
const shirtDetail = [box([.105, .033, .015], [-.073, .46, -.156]), box([.07, .026, .016], [.072, .46, -.156]), box([.36, .025, .018], [0, .08, -.145])]
const upperLeg = [capsule(.083, .22, [0, -.185, 0])], lowerLeg = [capsule(.075, .225, [0, -.185, 0])]
const shoe = [{ ...capsule(.075, .15, [0, -.045, -.07], [1.13, 1, .78]), rotation: [Math.PI / 2, 0, 0] as Triple }]
const soles = [box([.18, .042, .29], [0, -.108, -.07]), box([.12, .018, .045], [0, .016, -.08]), box([.12, .018, .045], [0, .011, -.13])]
const sleeve = [capsule(.083, .12, [0, -.11, 0])]
const forearm = [capsule(.06, .16, [0, -.105, 0]), sphere(.067, [0, -.24, -.007], [.85, 1.1, .85])]

export default function StudentAvatar({ motion, jersey = '#277c77' }: { motion: React.RefObject<AvatarMotion>; jersey?: string }) {
  const root = useRef<Group>(null), torso = useRef<Group>(null)
  const leftHip = useRef<Group>(null), rightHip = useRef<Group>(null), leftKnee = useRef<Group>(null), rightKnee = useRef<Group>(null), leftFoot = useRef<Group>(null), rightFoot = useRef<Group>(null)
  const leftArm = useRef<Group>(null), rightArm = useRef<Group>(null), leftElbow = useRef<Group>(null), rightElbow = useRef<Group>(null)
  const speed = useRef(0), clock = useRef(0), kickTime = useRef(0), lastKick = useRef(motion.current.kick ?? 0)
  useFrame((_, delta) => {
    const dt = motionDelta(delta), state = motion.current
    if (state.paused) return
    clock.current += dt
    const actualSpeed = state.speed ?? (state.moving ? state.running ? 5.5 : 2.3 : 0)
    speed.current += (actualSpeed - speed.current) * (1 - Math.exp(-dt * 14))
    if ((state.kick ?? 0) !== lastKick.current) { lastKick.current = state.kick ?? 0; kickTime.current = .45 }
    kickTime.current = Math.max(0, kickTime.current - dt)
    const pose = avatarPose(state.phase, speed.current, !!state.running, clock.current, state.turn, kickTime.current > 0 ? 1 - kickTime.current / .45 : 0, !!state.airborne)
    ;[leftHip, rightHip].forEach((ref, i) => { if (ref.current) ref.current.rotation.x = pose.hips[i] })
    ;[leftKnee, rightKnee].forEach((ref, i) => { if (ref.current) ref.current.rotation.x = pose.knees[i] })
    ;[leftFoot, rightFoot].forEach((ref, i) => { if (ref.current) ref.current.rotation.x = pose.ankles[i] })
    ;[leftArm, rightArm].forEach((ref, i) => { if (ref.current) { ref.current.rotation.x = pose.arms[i]; ref.current.rotation.z = i ? -.07 : .07 } })
    ;[leftElbow, rightElbow].forEach((ref, i) => { if (ref.current) ref.current.rotation.x = pose.elbows[i] })
    if (root.current) root.current.position.y = pose.rootY
    if (torso.current) { torso.current.rotation.x = pose.lean; torso.current.rotation.z = pose.sway + pose.bank }
  })
  return <group ref={root} name="campus-student-avatar">
    <group ref={torso} position={[0, .88, 0]}>
      <Parts parts={torsoParts} color={jersey} />
      <Parts parts={skinParts} color="#c99066" />
      <Parts parts={hairParts} color="#302a28" />
      <Parts parts={faceParts} color="#302a28" />
      <Parts parts={shirtDetail} color="#e9e9ce" />
      <Parts parts={bagParts} color="#cf9254" />
      <Parts parts={straps} color="#333b3b" />
    </group>
    {[[leftHip, leftKnee, leftFoot], [rightHip, rightKnee, rightFoot]].map(([hip, knee, foot], i) => <group key={`leg-${i}`} ref={hip} position={[i ? .115 : -.115, .88, 0]}>
      <Parts parts={upperLeg} color="#304255" />
      <group ref={knee} position={[0, -.37, 0]}>
        <Parts parts={lowerLeg} color="#304255" />
        <group ref={foot} position={[0, -.37, 0]}><Parts parts={shoe} color="#e4e8df" /><Parts parts={soles} color="#f8f5e9" /></group>
      </group>
    </group>)}
    {[[leftArm, leftElbow], [rightArm, rightElbow]].map(([arm, elbow], i) => <group key={`arm-${i}`} ref={arm} position={[i ? .29 : -.29, 1.40, 0]}>
      <Parts parts={sleeve} color={jersey} />
      <group ref={elbow} position={[0, -.235, 0]}><Parts parts={forearm} color="#c99066" /></group>
    </group>)}
  </group>
}
