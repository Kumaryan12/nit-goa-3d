import { useEffect, useState } from 'react'
import { CAMPUS_REOPENS_AT, campusUnderConstruction, reopeningCountdown } from '../lib/maintenance'
import './maintenance.css'

export default function MaintenancePage({ onReopen }: { onReopen: () => void }) {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const title = document.title
    document.title = 'A little pause. A better campus. · NITG Explored'
    const check = () => {
      const time = Date.now()
      setNow(time)
      if (!campusUnderConstruction(time)) onReopen()
    }
    const timer = window.setInterval(check, 1000)
    document.addEventListener('visibilitychange', check)
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', check); document.title = title }
  }, [onReopen])
  const remaining = reopeningCountdown(now)
  return <main className="maintenance">
    <div className="maintenance-scene" aria-hidden="true" />
    <header className="maintenance-header">
      <a className="maintenance-brand" href="/" aria-label="NITG Explored home">
        <img src="/brand/nit-goa-logo.png" alt="NIT Goa" width="46" height="46" />
        <span>NITG<span className="maintenance-brand-light">Explored</span></span>
      </a>
      <span className="maintenance-status"><span aria-hidden="true">↗</span> A campus in the making</span>
    </header>
    <section className="maintenance-content" aria-labelledby="maintenance-title">
      <p className="maintenance-eyebrow"><span aria-hidden="true">01 /</span> Under construction</p>
      <h1 id="maintenance-title">A little pause.<br />A <em>better</em> campus.</h1>
      <p className="maintenance-description">We’re making room for a smoother campus experience. Exploring, hanging out and everything in between will be back soon.</p>
      <div className="maintenance-reopening">
        <div className="maintenance-date" aria-hidden="true"><span>NOV</span><strong>01</strong></div>
        <div><span className="maintenance-label">See you back on campus</span><time dateTime={new Date(CAMPUS_REOPENS_AT).toISOString()}>1 November 2026</time><span className="maintenance-timezone">From midnight · India Standard Time</span></div>
      </div>
      <div className="maintenance-countdown" role="timer" aria-label={`${remaining[0]} days, ${remaining[1]} hours, ${remaining[2]} minutes until reopening`}>
        {remaining.map((value, index) => <div key={index}><strong>{String(value).padStart(2, '0')}</strong><span>{['Days', 'Hours', 'Minutes'][index]}</span></div>)}
      </div>
    </section>
    <div className="maintenance-scene-caption" aria-hidden="true"><span>A familiar place.</span><span>A fresh perspective.</span></div>
    <footer className="maintenance-footer"><span>Built for the people who make this place home.</span><span className="maintenance-credit">Made by Aryan <span>23ECE1006</span></span></footer>
  </main>
}
