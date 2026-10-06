import NitGoaLogo from './NitGoaLogo'
import SignInForm from './SignInForm'
import { navigate } from '../lib/community'
import './landing.css'

function ExperienceArt({ kind }: { kind: 'walk' | 'football' | 'oat' }) {
  return <svg viewBox="0 0 300 150" aria-hidden="true" className={`experience-art art-${kind}`}>
    {kind === 'walk' ? <>
      <path d="M-20 130 100 48 314 107 194 186Z" fill="#d5dfbf" />
      <path d="m16 132 81-52 144 40" fill="none" stroke="#91a288" strokeWidth="10" strokeLinejoin="round" />
      <path d="m100 50 66 18v53l-66-21Z" fill="#e6d7b3" /><path d="m166 68 38-24v53l-38 24Z" fill="#cbbf9e" />
      <path d="m91 47 41-27 80 23-43 28Z" fill="#b96e4a" /><path d="m132 20 80 23-15 4-70-20Z" fill="#d49165" />
      {[0, 1, 2].map(i => <path key={i} d={`M${111 + i * 16} 68l8 3v10l-8-3Z M${111 + i * 16} 87l8 3v10l-8-3Z`} fill="#4b756c" />)}
      <path d="M57 112V70m177 53V81" stroke="#8a7758" strokeWidth="4" />
      <path d="m57 52-18 9-4 18 22 9 20-12-5-17Z" fill="#557f55" /><path d="m234 64-19 10-3 15 23 12 18-14-4-16Z" fill="#446e4c" />
    </> : kind === 'football' ? <>
      <path d="m24 95 141-73 117 48-143 74Z" fill="#709066" /><path d="m44 94 121-62 95 39-122 63Z" fill="none" stroke="#f5f5dc" strokeWidth="1.6" />
      <path d="m105 63 94 40M58 88l31 13 28-14-32-13m145-18-30 16 30 12 29-15" fill="none" stroke="#f5f5dc" strokeWidth="1.6" />
      <ellipse cx="152" cy="83" rx="23" ry="10" transform="rotate(-26 152 83)" fill="none" stroke="#f5f5dc" strokeWidth="1.6" />
      <ellipse cx="164" cy="112" rx="16" ry="5" fill="#294a3530" />
      <circle cx="156" cy="103" r="13" fill="#fffaf1" /><path d="m155 94 7 4-2 7-8 1-4-6Z m-7 13-3 3m17-12 6-1m-9 10 2 6" fill="#3d5547" stroke="#3d5547" strokeWidth="2" />
    </> : <>
      <ellipse cx="158" cy="129" rx="107" ry="13" fill="#142c2825" />
      {[0, 1, 2, 3].map(i => <path key={i} d={`M${59 + i * 16} ${72 + i * 2}a${97 - i * 17} ${45 - i * 7} 0 0 0 ${194 - i * 34} 0`} fill="none" stroke={i % 2 ? '#d9c9a5' : '#b8b991'} strokeWidth="10" />)}
      <path d="m120 75 39-14 39 14-39 16Z" fill="#c18c62" /><path d="m120 75 39 16 39-16v9l-39 17-39-17Z" fill="#9b704f" />
      <path d="M158 77V45m0 9 16 5m-15 18h-8m8 0h8" fill="none" stroke="#f7e6bf" strokeWidth="2" strokeLinecap="round" />
      <rect x="153" y="32" width="10" height="17" rx="5" fill="#d9ae72" />
      <path d="M91 25v12m-6-6h12m117-8v9m-4-4h9" stroke="#d2ddaa" strokeWidth="2" strokeLinecap="round" />
    </>}
  </svg>
}

export default function LandingPage({ signedIn, onEnter }: { signedIn: boolean; onEnter: () => void }) {
  const experiences = [
    { kind: 'walk', title: 'Take the scenic route.', detail: 'Familiar roads. A new perspective.', destination: '/campus?view=walk', label: 'Explore campus' },
    { kind: 'football', title: 'Find your team.', detail: 'A shared ball. A game with friends.', destination: '/campus?view=walk&location=sports-ground', label: 'Visit the sports ground' },
    { kind: 'oat', title: 'Make it an OAT night.', detail: 'Music, live performances and your people.', destination: '/campus?concert=1&location=open-air-theatre', label: 'Visit the Open Air Theatre' },
  ] as const
  return <main className="landing-page">
    <section className="welcome-hero community-container" aria-labelledby="welcome-title">
      <img className="welcome-scene" src="/brand/campus-night-concept.jpg" alt="" width="1672" height="941" fetchPriority="high" decoding="async" />
      <div className="welcome-copy">
        <h1 id="welcome-title">Your campus.<br /><em>Unlocked.</em></h1>
        <p className="welcome-description">Explore. Play. Find your people.</p>
        <div id="join" className="welcome-join">
          {signedIn ? <button className="welcome-enter" onClick={onEnter}>Enter campus <span aria-hidden="true">↗</span></button>
            : <SignInForm destination={window.location.search ? undefined : '/student'} />}
        </div>
        <a className="welcome-discover" href="#experiences">Explore the experience <span aria-hidden="true">↘</span></a>
      </div>
      <div className="welcome-scene-caption"><span>A campus without closing hours.</span><small>Goa-inspired concept artwork</small></div>
    </section>
    <section className="welcome-experiences community-container" id="experiences" aria-labelledby="experiences-title">
      <div className="welcome-section-heading"><h2 id="experiences-title">Make yourself at home.</h2><span>THREE WAYS TO DROP IN ↙</span></div>
      <div className="welcome-experience-grid">
        {experiences.map(item => <button className={`welcome-experience experience-${item.kind}`} key={item.kind} onClick={() => navigate(item.destination)} aria-label={item.label}>
          <ExperienceArt kind={item.kind} />
          <span className="welcome-experience-copy"><strong>{item.title}</strong><span>{item.detail}</span></span><span className="experience-arrow" aria-hidden="true">↗</span>
        </button>)}
      </div>
    </section>
    <footer className="welcome-footer community-container">
      <div className="welcome-footer-brand"><NitGoaLogo /><span>Made for the people of NIT Goa.<small>An independent campus experience.</small></span></div>
      <div><a href="/people" onClick={event => { event.preventDefault(); navigate('/people') }}>The community ↗</a><a href="/admin" onClick={event => { event.preventDefault(); navigate('/admin') }}>Admin</a></div>
    </footer>
  </main>
}
