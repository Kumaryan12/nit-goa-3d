import { useEffect, useRef, useState } from 'react'
import { boysHostelDetails } from '../data/buildingDetails'
import type { HostelAction } from '../lib/hostelInterior'
import { emptyWalkInput } from '../lib/walking'
import { joystickInput } from '../lib/avatarMotion'
import type { WalkInput, WalkStatus } from '../lib/walking'
import type { CampusLocation } from '../types/campus'

type Direction = 'forward' | 'back' | 'left' | 'right' | 'turn-left' | 'turn-right'
export default function WalkControls({ input, status, paused, ready, locations, onPause, onSpawn, onInspect, onOverview }: {
  input: React.RefObject<WalkInput>; status: WalkStatus | null; paused: boolean; ready: boolean; locations: CampusLocation[];
  onPause: () => void; onSpawn: (id: string) => void; onInspect: (id: string) => void; onOverview: () => void
}) {
  const stick = useRef({ id: -1, forward: 0, side: 0 }), knob = useRef<HTMLSpanElement>(null)
  const pointers = useRef(new Map<number, Direction>()), [jog, setJog] = useState(false), [startId, setStartId] = useState('main-entrance')
  const riding = !!status?.vehicle && status.vehicle !== 'walk'
  const inside = status?.interior
  const clearStick = () => { stick.current = { id: -1, forward: 0, side: 0 }; if (knob.current) knob.current.style.transform = 'translate(-50%, -50%)' }
  const action = (value: HostelAction) => { pointers.current.clear(); clearStick(); input.current = { ...emptyWalkInput(), action: value } }
  const nearest = locations.find(location => location.id === status?.nearestId)
  const synchronize = (running: boolean) => {
    const held = [...pointers.current.values()]
    input.current = { forward: stick.current.forward + Number(held.includes('forward')) - Number(held.includes('back')), side: stick.current.side + Number(held.includes('right')) - Number(held.includes('left')), turn: Number(held.includes('turn-left')) - Number(held.includes('turn-right')), running, jump: input.current.jump, brake: input.current.brake, vehicle: input.current.vehicle }
  }
  const update = () => synchronize(jog)
  useEffect(() => {
    const clear = () => { pointers.current.clear(); clearStick(); input.current = emptyWalkInput() }
    const hidden = () => { if (document.hidden) clear() }
    const release = (event: PointerEvent) => { pointers.current.delete(event.pointerId); if (stick.current.id === event.pointerId) clearStick(); synchronize(input.current.running) }
    clear(); window.addEventListener('pointerup', release); window.addEventListener('pointercancel', release); window.addEventListener('blur', clear); document.addEventListener('visibilitychange', hidden)
    return () => { clear(); window.removeEventListener('pointerup', release); window.removeEventListener('pointercancel', release); window.removeEventListener('blur', clear); document.removeEventListener('visibilitychange', hidden) }
  }, [paused, input])
  const moveStick = (event: React.PointerEvent<HTMLDivElement>) => {
    if (paused || !ready || status?.error || event.pointerId !== stick.current.id) return
    const bounds = event.currentTarget.getBoundingClientRect(), radius = Math.min(bounds.width, bounds.height) * .32
    const value = joystickInput(event.clientX - bounds.left - bounds.width / 2, event.clientY - bounds.top - bounds.height / 2, radius)
    stick.current.forward = value.forward; stick.current.side = value.side
    if (knob.current) knob.current.style.transform = `translate(-50%, -50%) translate(${value.x}px, ${value.y}px)`
    synchronize(jog)
  }
  const releaseStick = (event: React.PointerEvent<HTMLDivElement>) => { if (stick.current.id === event.pointerId) { clearStick(); synchronize(jog) } }
  const button = (direction: Direction, label: string, symbol: string) => <button type="button" className={`walk-direction walk-${direction}`} aria-label={label} disabled={paused || !ready || !!status?.error}
    onPointerDown={event => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); pointers.current.set(event.pointerId, direction); update() }}
    onPointerUp={event => { pointers.current.delete(event.pointerId); update() }} onPointerCancel={event => { pointers.current.delete(event.pointerId); update() }} onLostPointerCapture={event => { pointers.current.delete(event.pointerId); update() }}
    onKeyDown={event => { if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); pointers.current.set(-1, direction); update() } }}
    onKeyUp={event => { if (event.key === ' ' || event.key === 'Enter') { pointers.current.delete(-1); update() } }} onBlur={() => { pointers.current.delete(-1); update() }}>{symbol}</button>
  return <aside className="walk-controls" aria-label="Avatar exploration controls">
    <div className="walk-heading"><div><span className="eyebrow">Walk the campus</span><h2>{inside ? inside.kind==='classroom'?'Gyan Mandir, on foot':'Talpona, on foot' : riding ? status?.vehicle === 'car' ? 'Cruise the campus' : 'Cycle the campus' : 'Your campus, on foot'}</h2></div><button className="text-button" onClick={onOverview}>Overview ↗</button></div>
    <p className="walk-help">{riding ? 'W / ↑ to accelerate · S / ↓ to brake (hold to reverse the car) · A/D or ←→ to steer · Space to brake · F to dismount.' : <>WASD / ↑↓ to move · ←→ or drag to look · Shift to run · Space / J to jump (J during football) · E to inspect, enter, or use stairs.</>}</p>
    <p className="walk-location" role="status">{status?.error ? status.error : !ready ? 'Waiting for campus geometry…' : paused ? 'Walk paused' : inside ? `${inside.kind==='classroom'?(inside.floor===0?'Ground floor':`Floor ${inside.floor}`):boysHostelDetails.floors[inside.floor]?.label ?? 'Hostel'} · ${inside.stairLowFloor !== null ? 'Using stairs…' : inside.room ?? 'Corridor'}` : nearest ? `Near ${nearest.name} · ${status!.distance.toFixed(1)} m` : 'Explore the paths and open spaces'}{status?.blocked && !paused && ' · Path blocked'}</p>
    <div className="walk-transport" role="group" aria-label="Choose how to explore">
      {(['walk', 'bicycle', 'car'] as const).map(mode => <button key={mode} className="fly-button" aria-pressed={(status?.vehicle ?? 'walk') === mode} disabled={paused || !ready || !!status?.error || mode !== 'walk' && !status?.canRide} onClick={() => { pointers.current.clear(); clearStick(); input.current = { ...emptyWalkInput(), vehicle: mode } }}>{mode === 'walk' ? 'On foot' : mode === 'bicycle' ? 'Bicycle' : 'Car'}</button>)}
      {riding && <span className="walk-speed">{Math.round((status?.speed ?? 0) * 3.6)} km/h</span>}
    </div>
    {status?.rideMessage && <p className="walk-note" role="status">{status.rideMessage}</p>}
    {status?.canEnterHostel && <button className="navigate-button walk-inspect" disabled={paused} onClick={() => action('enter-hostel')}>Enter Boys Hostel · approximate →</button>}
    {status?.canEnterGyan && <button className="navigate-button walk-inspect" disabled={paused} onClick={()=>action('enter-gyan')}>Enter Gyan Mandir →</button>}
    {inside && <div className="walk-interior-actions">
      <p className="walk-demo-note">{inside.kind==='classroom'?'Classrooms · approximate interior layout':'Approximate interior · DEMO room labels'}</p>
      {inside.kind==='classroom'&&inside.floor===1&&<button className="fly-button" disabled={paused||inside.stairLowFloor!==null} onClick={()=>action('find-reading-room')}>Find reading room · north end ↗</button>}
      <button className="fly-button" disabled={paused || inside.stairLowFloor !== null} onClick={() => action('find-stairs')}>Jump to stair landing</button>
      <button className="fly-button" disabled={paused || !inside.canGoUp} onClick={() => action('stairs-up')}>Upstairs ↑</button>
      <button className="fly-button" disabled={paused || !inside.canGoDown} onClick={() => action('stairs-down')}>Downstairs ↓</button>
      <button className="fly-button" disabled={paused || inside.stairLowFloor !== null} onClick={() => action('exit-hostel')}>{inside.kind==='classroom'?'Leave Gyan Mandir ↗':'Leave hostel ↗'}</button>
    </div>}
    {nearest && !inside && <button className="fly-button walk-inspect" onClick={() => onInspect(nearest.id)}>Explore {nearest.name} →</button>}
    <div className="walk-start"><label htmlFor="walk-start-location">Start near</label><select id="walk-start-location" value={startId} onChange={event => setStartId(event.target.value)}>{locations.filter(location => location.name !== 'Unnamed campus building').map(location => <option key={location.id} value={location.id}>{location.name}</option>)}</select><button className="fly-button" disabled={!ready} onClick={() => { pointers.current.clear(); clearStick(); input.current = emptyWalkInput(); onSpawn(startId) }}>Go</button></div>
    <div className="walk-input-row"><div className="walk-movement"><div className="walk-joystick" role="group" aria-label={riding ? 'Drag forward to accelerate, backward to brake, sideways to steer' : 'Drag to walk; drag farther to move faster'} aria-disabled={paused || !ready || !!status?.error}
      onPointerDown={event => { if (paused || !ready || status?.error || stick.current.id !== -1) return; event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); stick.current.id = event.pointerId; moveStick(event) }}
      onPointerMove={moveStick} onPointerUp={releaseStick} onPointerCancel={releaseStick} onLostPointerCapture={releaseStick}><span className="walk-stick-cross">✦</span><span ref={knob} className="walk-stick-knob" /><span className="walk-stick-label">MOVE</span></div><div className="walk-pad" aria-label="Touch movement controls">{button('forward', riding ? 'Accelerate' : 'Walk forward', '↑')}{button('left', riding ? 'Steer left' : 'Step left', '←')}{button('back', riding ? 'Brake or reverse' : 'Walk backward', '↓')}{button('right', riding ? 'Steer right' : 'Step right', '→')}</div></div><div className="walk-look">{button('turn-left', riding ? 'Steer left' : 'Look left', '↶')}{button('turn-right', riding ? 'Steer right' : 'Look right', '↷')}{riding && <button className="fly-button" disabled={paused} onPointerDown={event => { event.currentTarget.setPointerCapture(event.pointerId); input.current.brake = true }} onPointerUp={() => { input.current.brake = false }} onPointerCancel={() => { input.current.brake = false }} onLostPointerCapture={() => { input.current.brake = false }} onKeyDown={event => { if (event.key === ' ' || event.key === 'Enter') input.current.brake = true }} onKeyUp={() => { input.current.brake = false }} onBlur={() => { input.current.brake = false }}>Brake</button>}{!riding && <><button className="fly-button walk-jump" disabled={paused || !ready || !!status?.error || status?.canJump === false} onClick={() => { input.current.jump = true }}>Jump ↑ <small>J</small></button><button className="fly-button" aria-pressed={jog} onClick={() => { setJog(!jog); input.current.running = !jog }}>{jog ? 'Running' : 'Run'}</button></>}<button className="fly-button" aria-pressed={paused} onClick={onPause}>{paused ? 'Resume' : 'Pause'}</button></div></div>
    <p className="walk-note">{inside ? 'Walk through open doorways. E uses stairs at a landing and exits near the ground entrance.' : riding ? 'Cars stay on roads; bicycles can use paths. Dismount to explore interiors or play football.' : 'Take a bicycle from a path or a car from a wider road. Dismount to enter buildings.'}</p>
  </aside>
}
