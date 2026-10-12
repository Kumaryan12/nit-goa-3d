import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Quaternion } from 'three'
import type { Group } from 'three'
import type { AvatarMotion } from '../lib/avatarMotion'
import { createCafeDrinkGeometry } from '../lib/cafeDrinkGeometry'
import type { CafeDrinkKind } from '../lib/cafeDrinks'

export default function AvatarDrink({ motion, arm, elbow }: { motion: React.RefObject<AvatarMotion>; arm: React.RefObject<Group | null>; elbow: React.RefObject<Group | null> }) {
  const root = useRef<Group>(null), rotation = useMemo(() => new Quaternion(), [])
  const [kind, setKind] = useState<CafeDrinkKind>('coffee')
  const geometry = useMemo(() => createCafeDrinkGeometry(kind), [kind])
  useEffect(() => () => geometry.dispose(), [geometry])
  useFrame(() => {
    if (!root.current) return
    const state = motion.current, drink = state.drink, now = Date.now()
    const shown = !!drink && now >= drink.takenAt && now < drink.until && !state.paused && !state.airborne && !state.passenger
      && (!state.vehicle || state.vehicle === 'walk') && (!state.social || now >= state.social.until || state.social.action === 'sit')
    root.current.visible = shown
    if (!shown || !drink || !arm.current || !elbow.current) return
    if (kind !== drink.kind) setKind(drink.kind)
    // Keep the drink upright while the articulated arm follows the actual hand.
    rotation.copy(arm.current.quaternion).multiply(elbow.current.quaternion).invert()
    root.current.quaternion.copy(rotation)
  })
  return <group ref={root} position={[0, -.24, -.007]} visible={false} name="held-cafe-drink"><mesh geometry={geometry}><meshStandardMaterial vertexColors roughness={.55} /></mesh></group>
}
