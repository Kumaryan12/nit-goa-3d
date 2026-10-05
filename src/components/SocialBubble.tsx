import { useRef } from 'react'
import { Html } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import type { CampusSession } from '../lib/campusProtocol'
import { SOCIAL_LABELS, SOCIAL_SYMBOLS } from '../lib/social'

export default function SocialBubble({ session, personId, height = 2.35 }: { session: React.RefObject<CampusSession>; personId?: string; height?: number }) {
  const bubble = useRef<HTMLSpanElement>(null)
  useFrame(() => {
    const element = bubble.current, social = session.current.snapshot?.people.find(p => p.id === (personId ?? session.current.id))?.social
    if (!element) return
    const visible = !!social && social.action !== 'sit' && social.until > Date.now()
    element.hidden = !visible
    if (visible && social) { element.textContent = SOCIAL_SYMBOLS[social.action]; element.setAttribute('aria-label', SOCIAL_LABELS[social.action]) }
  })
  return <Html center position={[0, height, 0]} distanceFactor={12} zIndexRange={[18, 0]} style={{ pointerEvents: 'none' }}><span ref={bubble} className="campus-reaction" role="img" hidden /></Html>
}
