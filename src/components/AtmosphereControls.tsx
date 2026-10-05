import { useEffect, useId, useRef, useState } from 'react'
import type { RefObject } from 'react'
import type { CampusPose } from '../lib/campusProtocol'
import { CampusAudio } from '../lib/campusAudio'
import { advanceAtmosphereMotion, atmosphereSettings, ATMOSPHERE_STORAGE_KEY, DEFAULT_ATMOSPHERE, freshAtmosphereMotion } from '../lib/campusAtmosphere'
import type { AtmosphereSettings } from '../lib/campusAtmosphere'
import './AtmosphereControls.css'

export interface AtmosphereControlsProps { pose: RefObject<CampusPose | null>; night: boolean; walking: boolean; concert: boolean }
function readSettings() {
  try { return atmosphereSettings(JSON.parse(localStorage.getItem(ATMOSPHERE_STORAGE_KEY) ?? 'null')) } catch { return { ...DEFAULT_ATMOSPHERE } }
}

export default function AtmosphereControls({ pose, night, walking, concert }: AtmosphereControlsProps) {
  const [settings, setSettings] = useState(readSettings), [enabled, setEnabled] = useState(false), [open, setOpen] = useState(false)
  const [status, setStatus] = useState('Enable sounds to hear the campus.'), [resumeNeeded, setResumeNeeded] = useState(false)
  const audio = useRef<CampusAudio | null>(null), preferences = useRef(settings), permission = useRef(false), motion = useRef(freshAtmosphereMotion())
  const environment = useRef({ pose, night, walking, concert }), container = useRef<HTMLDivElement>(null), toggle = useRef<HTMLButtonElement>(null)
  const id = useId()
  environment.current = { pose, night, walking, concert }

  function resetMotion() { motion.current = freshAtmosphereMotion() }
  async function resume() {
    const current = audio.current
    if (!current || !permission.current || preferences.current.muted || preferences.current.volume === 0 || document.hidden || !document.hasFocus()) return
    resetMotion()
    try {
      const running = await current.resume()
      if (audio.current !== current || document.hidden || !document.hasFocus()) return
      setResumeNeeded(!running); setStatus(running ? 'Campus sounds are on.' : 'Press Resume sounds to listen.')
    } catch {
      if (audio.current !== current) return
      setResumeNeeded(true); setStatus('Press Resume sounds to listen.')
    }
  }
  function updateSettings(update: Partial<AtmosphereSettings>) {
    const next = atmosphereSettings({ ...preferences.current, ...update })
    preferences.current = next; setSettings(next)
    try { localStorage.setItem(ATMOSPHERE_STORAGE_KEY, JSON.stringify(next)) } catch { /* Private storage can be unavailable. */ }
    audio.current?.setSettings(next)
    if (next.muted || next.volume === 0) { audio.current?.pause(); resetMotion(); setStatus('Campus sounds are muted.'); setResumeNeeded(false) }
    else if (permission.current) void resume()
  }
  function enable() {
    try {
      if (!audio.current) audio.current = new CampusAudio()
      permission.current = true; setEnabled(true)
      updateSettings({ muted: false, volume: preferences.current.volume || DEFAULT_ATMOSPHERE.volume })
    } catch {
      audio.current?.close(); audio.current = null; permission.current = false; setEnabled(false)
      setStatus('Campus sounds are unavailable in this browser.')
    }
  }
  function disable() {
    permission.current = false; audio.current?.close(); audio.current = null; resetMotion()
    setEnabled(false); setResumeNeeded(false); setStatus('Campus sounds are off.')
  }

  useEffect(() => {
    const pause = () => { audio.current?.pause(); resetMotion() }
    const visibility = () => { if (document.hidden || !document.hasFocus()) pause(); else void resume() }
    window.addEventListener('blur', pause); window.addEventListener('focus', visibility); document.addEventListener('visibilitychange', visibility)
    return () => {
      window.removeEventListener('blur', pause); window.removeEventListener('focus', visibility); document.removeEventListener('visibilitychange', visibility)
      permission.current = false; audio.current?.close(); audio.current = null
    }
  }, [])

  useEffect(() => {
    if (!enabled) return
    const timer = window.setInterval(() => {
      if (!audio.current || document.hidden || !document.hasFocus() || preferences.current.muted || preferences.current.volume === 0) return
      const current = environment.current
      audio.current.update(advanceAtmosphereMotion(motion.current, current.pose.current, performance.now() / 1000, current.walking), current.night, current.concert)
    }, 80)
    return () => window.clearInterval(timer)
  }, [enabled])

  useEffect(() => {
    if (!open) return
    const outside = (event: PointerEvent) => { if (event.target instanceof Node && !container.current?.contains(event.target)) setOpen(false) }
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setOpen(false); toggle.current?.focus() } }
    document.addEventListener('pointerdown', outside); document.addEventListener('keydown', escape)
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape) }
  }, [open])

  const audible = enabled && !settings.muted && settings.volume > 0
  return <div className="atmosphere-controls" ref={container}>
    <button ref={toggle} type="button" className="toolbar-button" aria-expanded={open} aria-controls={id} onClick={() => setOpen(value => !value)}>
      <span aria-hidden="true">{audible ? '♫' : '♪'}</span> Sounds {audible ? 'on' : 'off'}
    </button>
    {open && <section id={id} className="atmosphere-panel" aria-labelledby={`${id}-heading`}>
      <div className="atmosphere-heading"><h2 id={`${id}-heading`}>Campus sounds</h2><button type="button" className="panel-close" aria-label="Close sound settings" onClick={() => { setOpen(false); toggle.current?.focus() }}>×</button></div>
      <p className="atmosphere-description">A little breeze, birds in the trees, and the sound of exploring.</p>
      <div className="atmosphere-actions">
        {!enabled ? <button type="button" className="navigate-button" onClick={enable}>Enable campus sounds</button> : <>
          <button type="button" className="navigate-button" aria-pressed={settings.muted || settings.volume === 0} onClick={() => updateSettings(settings.muted || settings.volume === 0 ? { muted: false, volume: settings.volume || DEFAULT_ATMOSPHERE.volume } : { muted: true })}>{settings.muted || settings.volume === 0 ? 'Unmute' : 'Mute'}</button>
          <button type="button" className="fly-button" onClick={disable}>Turn off</button>
          {resumeNeeded && <button type="button" className="fly-button" onClick={() => void resume()}>Resume sounds</button>}
        </>}
      </div>
      <label className="atmosphere-volume" htmlFor={`${id}-volume`}><span>Volume <output>{Math.round(settings.volume * 100)}%</output></span>
        <input id={`${id}-volume`} type="range" min="0" max="100" step="1" value={Math.round(settings.volume * 100)} onChange={event => updateSettings({ volume: Number(event.target.value) / 100 })} />
      </label>
      <fieldset className="atmosphere-channels"><legend>Choose your sounds</legend>
        {([['wind', 'Wind in the trees'], ['birds', 'Birdsong'], ['movement', 'Footsteps & bicycle']] as const).map(([key, label]) => <label key={key}><input type="checkbox" checked={settings[key]} onChange={event => updateSettings({ [key]: event.target.checked })} />{label}</label>)}
      </fieldset>
      <p className="atmosphere-status" role="status">{status}</p>
      <p className="atmosphere-note">Quieter indoors and during concerts. Pauses when you leave this tab.</p>
    </section>}
  </div>
}
