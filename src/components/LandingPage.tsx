import NitGoaLogo from './NitGoaLogo'
import SignInForm from './SignInForm'
import { navigate } from '../lib/community'
import './landing.css'

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
          <img className="experience-art" src={`/brand/experience-${item.kind}.jpg`} alt="" width="1536" height="1024" loading="lazy" decoding="async" />
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
