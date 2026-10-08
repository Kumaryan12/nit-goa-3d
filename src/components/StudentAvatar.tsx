import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { BoxGeometry, CapsuleGeometry, Euler, Matrix4, Quaternion, SphereGeometry, Vector3 } from 'three'
import type { BufferGeometry } from 'three'
import type { Group } from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { avatarPose, motionDelta, ridingPose, socialPoseForMotion } from '../lib/avatarMotion'
import type { AvatarStyle } from '../lib/profile'
import type { AvatarMotion } from '../lib/avatarMotion'

type Triple = [number, number, number]
interface Part { shape: 'box' | 'sphere' | 'capsule'; size: Triple; at: Triple; scale?: Triple; rotation?: Triple }
const capsule = (radius: number, length: number, at: Triple, scale?: Triple): Part => ({ shape: 'capsule', size: [radius, length, 0], at, scale })
const sphere = (radius: number, at: Triple, scale?: Triple): Part => ({ shape: 'sphere', size: [radius, 0, 0], at, scale })
const box = (size: Triple, at: Triple): Part => ({ shape: 'box', size, at })
const sharedParts = new Map<Part[], { geometry: BufferGeometry; users: number }>()

// Merge fixed detail by material so facial features and clothing details do not
// each need a separate draw call in the multiplayer crowd.
function Parts({ parts, color, roughness = .85 }: { parts: Part[]; color: string; roughness?: number }) {
  const shared = useMemo(() => {
    const existing = sharedParts.get(parts)
    if (existing) return existing
    const pieces = parts.map(part => {
      const geometry = part.shape === 'capsule' ? new CapsuleGeometry(part.size[0], part.size[1], 4, 10)
        : part.shape === 'sphere' ? new SphereGeometry(part.size[0], 12, 8) : new BoxGeometry(...part.size)
      geometry.applyMatrix4(new Matrix4().compose(new Vector3(...part.at), new Quaternion().setFromEuler(new Euler(...(part.rotation ?? [0, 0, 0]))), new Vector3(...(part.scale ?? [1, 1, 1]))))
      return geometry
    })
    const combined = mergeGeometries(pieces)!
    pieces.forEach(piece => piece.dispose())
    const shared = { geometry: combined, users: 0 }; sharedParts.set(parts, shared); return shared
  }, [parts])
  useEffect(() => {
    shared.users++
    return () => { shared.users--; queueMicrotask(() => { if (!shared.users && sharedParts.get(parts) === shared) { shared.geometry.dispose(); sharedParts.delete(parts) } }) }
  }, [parts, shared])
  return <mesh geometry={shared.geometry} castShadow receiveShadow><meshStandardMaterial color={color} roughness={roughness} /></mesh>
}

const torsoParts = [capsule(.23, .22, [0, .31, 0], [1, 1, .66]), sphere(.12, [0, .56, .11], [1.35, .8, .85])]
const skinParts = [capsule(.07, .07, [0, .65, 0]), sphere(.20, [0, .84, -.01], [.91, 1.06, .88]), sphere(.043, [-.18, .84, 0]), sphere(.043, [.18, .84, 0]), sphere(.035, [0, .825, -.183], [.65, .75, 1])]
const boyHairParts = [sphere(.195, [0, .955, .015], [1, .63, .85]), sphere(.11, [-.10, .945, -.09], [1, .7, .8]), sphere(.115, [.075, .973, -.065], [1, .6, 1]), capsule(.028, .09, [-.175, .87, .025]), capsule(.028, .09, [.175, .87, .025])]
const girlHairParts = [sphere(.195, [0, .955, .02], [1, .68, .88]), sphere(.11, [-.1, .94, -.08], [1, .65, .78]), sphere(.09, [.12, .93, -.03], [.65, 1, .8]), capsule(.048, .22, [-.17, .82, .065]), capsule(.048, .22, [.17, .82, .065]), sphere(.075, [0, .93, .185]), { ...capsule(.078, .17, [.025, .78, .235], [1, 1, .7]), rotation: [-.2, 0, -.12] as Triple }]
const faceParts = [box([.05, .011, .013], [-.065, .911, -.168]), box([.05, .011, .013], [.065, .911, -.168]), { ...capsule(.005, .032, [-.016, .77, -.179]), rotation: [0, 0, 1.25] as Triple }, { ...capsule(.005, .032, [.016, .77, -.179]), rotation: [0, 0, -1.25] as Triple }]
const eyeWhites = [-.065, .065].map(x => sphere(.026, [x, 0, -.177], [.9, 1, .34]))
const eyePupils = [-.065, .065].map(x => sphere(.012, [x, 0, -.187], [.85, 1.1, .3]))
const eyeLight = [-.065, .065].map(x => sphere(.004, [x + .003, .005, -.191], [1, 1, .4]))

const bagParts = [capsule(.18, .16, [0, .31, .245], [1, 1, .53]), box([.27, .18, .065], [0, .23, .34])]
const straps = [capsule(.022, .47, [-.16, .32, -.157], [1, 1, .6]), capsule(.022, .47, [.16, .32, -.157], [1, 1, .6]), box([.23, .017, .015], [0, .31, .38])]
const shirtDetail = [capsule(.008, .11, [-.038, .42, -.164]), capsule(.008, .11, [.038, .42, -.164]), { ...capsule(.008, .09, [-.03, .55, -.164]), rotation: [0, 0, .6] as Triple }, { ...capsule(.008, .09, [.03, .55, -.164]), rotation: [0, 0, -.6] as Triple }]
const upperLeg = [capsule(.083, .22, [0, -.185, 0])], lowerLeg = [capsule(.075, .225, [0, -.185, 0])]
const shoe = [{ ...capsule(.075, .15, [0, -.045, -.07], [1.13, 1, .78]), rotation: [Math.PI / 2, 0, 0] as Triple }]
const soles = [box([.18, .042, .29], [0, -.108, -.07]), box([.12, .018, .045], [0, .016, -.08]), box([.12, .018, .045], [0, .011, -.13])]
const sleeve = [capsule(.083, .12, [0, -.11, 0])]
const forearm = [capsule(.06, .16, [0, -.105, 0]), sphere(.067, [0, -.24, -.007], [.85, 1.1, .85])]

export default function StudentAvatar({ style = 'boy', motion, jersey = '#277c77', accent = '#cf9254' }: { style?: AvatarStyle; motion: React.RefObject<AvatarMotion>; jersey?: string; accent?: string }) {
  const root = useRef<Group>(null), torso = useRef<Group>(null), head = useRef<Group>(null), eyes = useRef<Group>(null)
  const leftHip = useRef<Group>(null), rightHip = useRef<Group>(null), leftKnee = useRef<Group>(null), rightKnee = useRef<Group>(null), leftFoot = useRef<Group>(null), rightFoot = useRef<Group>(null)
  const leftArm = useRef<Group>(null), rightArm = useRef<Group>(null), leftElbow = useRef<Group>(null), rightElbow = useRef<Group>(null)
  const speed = useRef(0), clock = useRef(0), kickTime = useRef(0), lastKick = useRef(motion.current.kick ?? 0)
  const reducedMotion = useRef(false), socialExit = useRef(0)
  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => { reducedMotion.current = preference.matches }
    update(); preference.addEventListener('change', update)
    return () => preference.removeEventListener('change', update)
  }, [])
  useFrame((_, delta) => {
    const dt = motionDelta(delta), state = motion.current
    if (state.paused) return
    clock.current += dt
    const actualSpeed = state.speed ?? (state.moving ? state.running ? 5.5 : 2.3 : 0)
    speed.current += (actualSpeed - speed.current) * (1 - Math.exp(-dt * 14))
    if ((state.kick ?? 0) !== lastKick.current) { lastKick.current = state.kick ?? 0; kickTime.current = .45 }
    kickTime.current = Math.max(0, kickTime.current - dt)
    const pose = state.vehicle && state.vehicle !== 'walk' ? ridingPose(state.vehicle, state.phase, speed.current) : avatarPose(state.phase, speed.current, !!state.running, clock.current, state.turn, kickTime.current > 0 ? 1 - kickTime.current / .45 : 0, !!state.airborne)
    const social = kickTime.current ? null : socialPoseForMotion(state, Date.now(), reducedMotion.current)
    socialExit.current = social ? .3 : Math.max(0, socialExit.current - dt)
    const easing = socialExit.current ? 1 - Math.exp(-dt * 18) : 1
    const mix = (normal: number, gesture: number | undefined) => normal + ((gesture ?? normal) - normal) * (social?.weight ?? 0)
    const approach = (current: number, target: number) => current + (target - current) * easing
    ;[leftHip, rightHip].forEach((ref, i) => { if (ref.current) ref.current.rotation.x = approach(ref.current.rotation.x, mix(pose.hips[i], social?.hips[i])) })
    ;[leftKnee, rightKnee].forEach((ref, i) => { if (ref.current) ref.current.rotation.x = approach(ref.current.rotation.x, mix(pose.knees[i], social?.knees[i])) })
    ;[leftFoot, rightFoot].forEach((ref, i) => { if (ref.current) ref.current.rotation.x = approach(ref.current.rotation.x, mix(pose.ankles[i], social?.ankles[i])) })
    ;[leftArm, rightArm].forEach((ref, i) => {
      if (ref.current) {
        ref.current.rotation.order = 'YXZ'
        ref.current.rotation.x = approach(ref.current.rotation.x, mix(pose.arms[i], social?.arms[i]))
        ref.current.rotation.y = approach(ref.current.rotation.y, mix(0, social?.armY[i]))
        ref.current.rotation.z = approach(ref.current.rotation.z, mix(i ? -.07 : .07, social?.armZ[i]))
      }
    })
    ;[leftElbow, rightElbow].forEach((ref, i) => { if (ref.current) ref.current.rotation.x = approach(ref.current.rotation.x, mix(pose.elbows[i], social?.elbows[i])) })
    if (root.current) {
      // During sitting/standing transitions, use the actual smoothed leg angles
      // to keep sneakers above the row floor instead of lerping through it.
      if (socialExit.current && !state.airborne && (!state.vehicle || state.vehicle === 'walk')) {
        const soles = [[leftHip, leftKnee], [rightHip, rightKnee]].map(([hip, knee]) => .88 - .37 * Math.cos(hip.current?.rotation.x ?? 0) - .37 * Math.cos((hip.current?.rotation.x ?? 0) + (knee.current?.rotation.x ?? 0)) - .129)
        root.current.position.y = .011 - Math.min(...soles)
      } else root.current.position.y = approach(root.current.position.y, pose.rootY)
    }
    if (head.current) {
      const target = Math.max(-.15, Math.min(.15, (state.turn ?? 0) * .035))
      head.current.rotation.y += (target - head.current.rotation.y) * (1 - Math.exp(-dt * 8))
      head.current.rotation.z = reducedMotion.current ? 0 : Math.sin(clock.current * 1.35) * .008
    }
    if (eyes.current) {
      const cycle = clock.current % 4.8
      const blink = reducedMotion.current ? 0 : Math.max(0, 1 - Math.abs(cycle - 4.5) / .09)
      eyes.current.scale.y = 1 - blink * .94
    }
    if (torso.current) {
      torso.current.rotation.x = approach(torso.current.rotation.x, mix(pose.lean, social?.lean))
      torso.current.rotation.z = approach(torso.current.rotation.z, mix(pose.sway + pose.bank, social ? social.sway + social.bank : undefined))
    }
  })
  return <group ref={root} name={`campus-student-avatar-${style}`}>
    <group ref={torso} position={[0, .88, 0]}>
      <Parts parts={torsoParts} color={jersey} />
      <group ref={head} position={[0, .65, 0]}><group position={[0, -.65, 0]}>
        <Parts parts={skinParts} color="#cf9871" />
        <Parts parts={style === 'girl' ? girlHairParts : boyHairParts} color="#302a28" roughness={.72} />
        <Parts parts={faceParts} color="#644639" />
        <group ref={eyes} position={[0, .875, 0]}>
          <Parts parts={eyeWhites} color="#fff9ec" /><Parts parts={eyePupils} color="#302a28" roughness={.35} /><Parts parts={eyeLight} color="#ffffff" roughness={.25} />
        </group>
      </group></group>
      <Parts parts={shirtDetail} color="#e9e9ce" />
      <Parts parts={bagParts} color={accent} />
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
      <group ref={elbow} position={[0, -.235, 0]}><Parts parts={forearm} color="#cf9871" /></group>
    </group>)}
  </group>
}
