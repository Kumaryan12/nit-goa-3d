import { useEffect } from 'react'
import { campusUpdates as updates } from '../data/campusUpdate'
import { acknowledgeCampusUpdate } from '../lib/campusUpdate'
import { navigate } from '../lib/community'
import './updates.css'

export const feedbackReleaseURL = 'https://github.com/Kumaryan12/nit-goa-3d/blob/main/CHANGELOG.md'
export default function UpdatesPage() {
  useEffect(() => acknowledgeCampusUpdate(), [])
  return <main className="updates-page community-container" aria-labelledby="updates-title">
    <header className="updates-intro">
      <p className="updates-eyebrow">WHAT’S NEW ON CAMPUS</p>
      <h1 id="updates-title">More to<br /><em>explore.</em></h1>
      <p className="updates-description">New things to try with your people.</p>
      <div className="updates-release"><span>Campus update</span><time dateTime="2026-10-12">8–12 October 2026</time></div>
    </header>
    <section className="updates-grid" aria-label="New campus experiences">
      {updates.map((update, index) => <article className="update-card" key={update.id}>
        <div className="update-card-top"><span className={`update-kind update-kind-${update.kind.toLowerCase()}`}>{update.kind}</span><span className="update-number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span></div>
        <h2>{update.title}</h2>
        <p>{update.detail}</p>
      </article>)}
    </section>
    <footer className="updates-footer">
      <a className="updates-enter" href="/student" onClick={event => { event.preventDefault(); navigate('/student') }}>See you on campus <span aria-hidden="true">↗</span></a>
      <a href={feedbackReleaseURL} target="_blank" rel="noopener noreferrer">Release notes on GitHub ↗</a>
    </footer>
  </main>
}
