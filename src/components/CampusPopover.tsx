import { useEffect, useState } from 'react'
import type { ReactNode, RefObject } from 'react'
import { createPortal } from 'react-dom'

// A scrolling toolbar and its glass filter can clip fixed-position menus.
// On small screens, mount menus directly in the explorer so they also stay
// inside the fullscreen element and inherit its day/night palette.
export default function CampusPopover({ anchor, children }: { anchor: RefObject<HTMLElement | null>; children: ReactNode }) {
  const [compact, setCompact] = useState(() => window.matchMedia('(max-width: 760px), (pointer: coarse)').matches)
  useEffect(() => {
    const query = window.matchMedia('(max-width: 760px), (pointer: coarse)')
    const changed = () => setCompact(query.matches)
    query.addEventListener('change', changed)
    return () => query.removeEventListener('change', changed)
  }, [])
  const host = anchor.current?.closest('.explorer')
  return compact && host ? createPortal(children, host) : children
}
