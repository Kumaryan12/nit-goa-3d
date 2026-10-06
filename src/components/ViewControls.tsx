import { useEffect, useRef, useState } from 'react'
export interface ViewLayout { panels: boolean; minimap: boolean; toolbar: boolean }
const defaults: ViewLayout = { panels: true, minimap: true, toolbar: true }
export function initialViewLayout(): ViewLayout {
  try {
    const value = JSON.parse(localStorage.getItem('nit-goa:view-layout') || 'null')
    if (value && ['panels', 'minimap', 'toolbar'].every(key => typeof value[key] === 'boolean')) return value
  } catch { /* Private browsing may disable saved preferences. */ }
  return { ...defaults }
}
export default function ViewControls({ explorer, layout, onChange }: { explorer: React.RefObject<HTMLElement | null>; layout: ViewLayout; onChange: (layout: ViewLayout) => void }) {
  const root = useRef<HTMLDivElement>(null), previous = useRef(defaults)
  const [open, setOpen] = useState(false), [fullscreen, setFullscreen] = useState(false), [message, setMessage] = useState('')
  const focus = !layout.panels && !layout.minimap && !layout.toolbar
  useEffect(() => {
    const changed = () => setFullscreen(document.fullscreenElement === explorer.current)
    document.addEventListener('fullscreenchange', changed); changed()
    return () => document.removeEventListener('fullscreenchange', changed)
  }, [explorer])
  useEffect(() => {
    if (!open) return
    const outside = (event: PointerEvent) => { if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false) }
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setOpen(false); root.current?.querySelector<HTMLButtonElement>('.view-menu-toggle')?.focus() } }
    window.addEventListener('pointerdown', outside); window.addEventListener('keydown', escape)
    return () => { window.removeEventListener('pointerdown', outside); window.removeEventListener('keydown', escape) }
  }, [open])
  const focusView = () => {
    if (focus) onChange(previous.current)
    else { previous.current = layout; onChange({ panels: false, minimap: false, toolbar: false }) }
    setOpen(false)
  }
  const toggleFullscreen = async () => {
    setMessage(''); setOpen(false)
    try {
      if (document.fullscreenElement === explorer.current) await document.exitFullscreen()
      else if (explorer.current?.requestFullscreen && document.fullscreenEnabled) await explorer.current.requestFullscreen()
      else { if (!focus) focusView(); setMessage('Focus view is on. Fullscreen is unavailable in this browser.') }
    } catch { setMessage('Fullscreen could not open. You can still use Focus view.') }
  }
  return <div className="view-controls" ref={root}>
    {open && <div className="view-options" id="campus-view-options" role="group" aria-label="Campus view options">
      <span className="eyebrow">Make room to explore</span>
      {([['panels', 'Side panels'], ['minimap', 'Minimap'], ['toolbar', 'Toolbar']] as const).map(([key, label]) => <label key={key}><input type="checkbox" checked={layout[key]} onChange={event => onChange({ ...layout, [key]: event.target.checked })} />{label}</label>)}
      <p>Movement controls stay within reach.</p>
    </div>}
    <div className="view-dock" role="group" aria-label="View controls">
      <button type="button" className="view-menu-toggle" aria-expanded={open} aria-controls="campus-view-options" onClick={() => { setOpen(value => !value); setMessage('') }}>☷ View</button>
      <button type="button" aria-pressed={focus} onClick={focusView} title={focus ? 'Restore your panels and toolbar' : 'Hide panels and toolbar'}>{focus ? 'Show controls' : 'Focus view'}</button>
      <button type="button" aria-label={fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'} aria-pressed={fullscreen} onClick={() => void toggleFullscreen()} title={fullscreen ? 'Exit fullscreen · Esc' : 'Enter fullscreen'}>{fullscreen ? '↙' : '⛶'}</button>
    </div>
    {message && <p className="view-feedback" role="status">{message}</p>}
  </div>
}
