import { useEffect, useState } from 'react'
import type { OverviewDrag } from '../lib/cameraGestures'
import type { ExplorerView } from '../lib/walking'
import type { TransportMode } from '../lib/vehicles'
import './GestureGuide.css'

export default function GestureGuide({ view, drag, onDrag, vehicle, football, onClose }: {
  view: ExplorerView; drag: OverviewDrag; onDrag: (drag: OverviewDrag) => void
  vehicle: TransportMode; football: boolean; onClose: () => void
}) {
  const [touch, setTouch] = useState(() => window.matchMedia('(max-width: 760px), (pointer: coarse)').matches)
  const walking = view === 'walk', riding = vehicle !== 'walk'
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
        document.getElementById('campus-controls-toggle')?.focus()
      }
    }
    window.addEventListener('keydown', escape)
    return () => window.removeEventListener('keydown', escape)
  }, [onClose])
  const rows = touch ? walking ? [
    ['Move pad', riding ? 'Accelerate / steer' : 'Walk'],
    ['Drag on campus', 'Look around'],
    ['Pinch', 'Zoom in / out'],
    [riding ? 'Brake button' : 'Run + move pad', riding ? 'Slow down' : 'Run'],
    [riding ? 'Get off' : 'Jump button', riding ? 'Leave vehicle' : 'Jump'],
  ] : [
    ['One finger', 'Rotate view'], ['Pinch', 'Zoom in / out'], ['Three fingers', 'Move view'], ['Tap a building', 'Explore'],
  ] : walking ? [
    ['W A S D', riding ? 'Accelerate / steer' : 'Walk'], ['Left-drag / ← →', 'Look around'],
    ['Scroll / pinch', 'Zoom in / out'],
    [riding ? 'Space' : 'Shift', riding ? 'Brake' : 'Run'],
    [riding ? 'F' : football ? 'J' : 'Space / J', riding ? 'Dismount' : 'Jump'],
    [football && !riding ? 'Space' : 'E', football && !riding ? 'Kick ball' : 'Inspect / enter'],
  ] : [
    ['Left-drag', drag === 'pan' ? 'Move view' : 'Rotate view'], ['Right-drag', 'Rotate view'],
    ['Scroll / pinch', 'Zoom in / out'], ['Click a building', 'Explore'],
  ]
  return <aside className="gesture-guide" id="campus-gesture-guide" aria-label="Campus gesture guide">
    <div className="gesture-guide-heading"><span>Controls <small>{walking ? riding ? 'Riding' : 'Walking' : 'Overview'}</small></span><button type="button" onClick={onClose} aria-label="Hide controls guide">×</button></div>
    <div className="gesture-devices" role="group" aria-label="Input device">
      <button type="button" aria-pressed={!touch} onClick={() => setTouch(false)}>Mouse / trackpad</button>
      <button type="button" aria-pressed={touch} onClick={() => setTouch(true)}>Touch</button>
    </div>
    {!walking && !touch && <div className="gesture-drag-mode" role="group" aria-label="Left-drag action">
      <span>Left-drag</span><button type="button" aria-pressed={drag === 'pan'} onClick={() => onDrag('pan')}>Move</button><button type="button" aria-pressed={drag === 'rotate'} onClick={() => onDrag('rotate')}>Rotate</button>
    </div>}
    <dl>{rows.map(([gesture, action]) => <div key={gesture}><dt>{gesture}</dt><dd>{action}</dd></div>)}</dl>
  </aside>
}
