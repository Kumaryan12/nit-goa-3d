import { useEffect, useRef, useState } from 'react'
import { emptyWalkInput } from '../lib/walking'
import type { WalkInput, WalkStatus } from '../lib/walking'
import type { CampusLocation } from '../types/campus'

type Direction = 'forward' | 'back' | 'left' | 'right' | 'turn-left' | 'turn-right'
export default function WalkControls({ input, status, paused, ready, locations, onPause, onSpawn, onInspect, onOverview }: {
  input: React.RefObject<WalkInput>; status: WalkStatus | null; paused: boolean; ready: boolean; locations: CampusLocation[];
  onPause: () => void; onSpawn: (id: string) => void; onInspect: (id: string) => void; onOverview: () => void
}) {
  const pointers = useRef(new Map<number, Direction>()), [jog, setJog] = useState(false), [startId, setStartId] = useState('main-entrance')
  const nearest = locations.find(location => location.id === status?.nearestId)
  const synchronize = (running: boolean) => {
    const held = [...pointers.current.values()]
    input.current = { forward: Number(held.includes('forward')) - Number(held.includes('back')), side: Number(held.includes('right')) - Number(held.includes('left')), turn: Number(held.includes('turn-left')) - Number(held.includes('turn-right')), running }
  }
  const update = () => synchronize(jog)
  useEffect(() => {
    const clear = () => { pointers.current.clear(); input.current = emptyWalkInput() }
    const hidden = () => { if (document.hidden) clear() }
    const release = (event: PointerEvent) => { pointers.current.delete(event.pointerId); synchronize(input.current.running) }
    clear(); window.addEventListener('pointerup', release); window.addEventListener('pointercancel', release); window.addEventListener('blur', clear); document.addEventListener('visibilitychange', hidden)
    return () => { clear(); window.removeEventListener('pointerup', release); window.removeEventListener('pointercancel', release); window.removeEventListener('blur', clear); document.removeEventListener('visibilitychange', hidden) }
  }, [paused, input])
  const button = (direction: Direction, label: string, symbol: string) => <button type="button" className={`walk-direction walk-${direction}`} aria-label={label} disabled={paused || !ready || !!status?.error}
    onPointerDown={event => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); pointers.current.set(event.pointerId, direction); update() }}
    onPointerUp={event => { pointers.current.delete(event.pointerId); update() }} onPointerCancel={event => { pointers.current.delete(event.pointerId); update() }} onLostPointerCapture={event => { pointers.current.delete(event.pointerId); update() }}
    onKeyDown={event => { if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); pointers.current.set(-1, direction); update() } }}
    onKeyUp={event => { if (event.key === ' ' || event.key === 'Enter') { pointers.current.delete(-1); update() } }} onBlur={() => { pointers.current.delete(-1); update() }}>{symbol}</button>
  return <aside className="walk-controls" aria-label="Avatar exploration controls">
    <div className="walk-heading"><div><span className="eyebrow">Walk the campus</span><h2>Your campus, on foot</h2></div><button className="text-button" onClick={onOverview}>Overview ↗</button></div>
    <p className="walk-help">WASD / ↑↓ to move · ←→ or drag to look · Shift to jog · E to inspect nearby places.</p>
    <p className="walk-location" role="status">{status?.error ? status.error : !ready ? 'Waiting for campus geometry…' : paused ? 'Walk paused' : nearest ? `Near ${nearest.name} · ${status!.distance.toFixed(1)} m` : 'Explore the paths and open spaces'}{status?.blocked && !paused && ' · Path blocked'}</p>
    {nearest && <button className="fly-button walk-inspect" onClick={() => onInspect(nearest.id)}>Explore {nearest.name} →</button>}
    <div className="walk-start"><label htmlFor="walk-start-location">Start near</label><select id="walk-start-location" value={startId} onChange={event => setStartId(event.target.value)}>{locations.filter(location => location.name !== 'Unnamed campus building').map(location => <option key={location.id} value={location.id}>{location.name}</option>)}</select><button className="fly-button" disabled={!ready} onClick={() => { pointers.current.clear(); input.current = emptyWalkInput(); onSpawn(startId) }}>Go</button></div>
    <div className="walk-input-row"><div className="walk-pad" aria-label="Touch movement controls">{button('forward', 'Walk forward', '↑')}{button('left', 'Step left', '←')}{button('back', 'Walk backward', '↓')}{button('right', 'Step right', '→')}</div><div className="walk-look">{button('turn-left', 'Look left', '↶')}{button('turn-right', 'Look right', '↷')}<button className="fly-button" aria-pressed={jog} onClick={() => { setJog(!jog); input.current.running = !jog }}>{jog ? 'Jogging' : 'Jog'}</button><button className="fly-button" aria-pressed={paused} onClick={onPause}>{paused ? 'Resume' : 'Pause'}</button></div></div>
    <p className="walk-note">Explore outdoors. Buildings stay solid; interiors are not modeled.</p>
  </aside>
}
