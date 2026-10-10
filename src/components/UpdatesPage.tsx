import { navigate } from '../lib/community'
import './updates.css'

export const feedbackReleaseURL = 'https://github.com/Kumaryan12/nit-goa-3d/releases/tag/campus-update-2026-10-10'

const updates = [
  { kind: 'Improved', title: 'More at home in the hostel.', detail: 'Faster indoor movement, entrance stairs, four lifts and clearer corridor routes connect both Boys Hostel courtyards. The southeast court keeps its badminton space, with warmer lighting and more greenery.' },
  { kind: 'Added', title: 'Find your people.', detail: 'In avatar mode, see campus friends on the map with direction, distance and floor. Hide your shared location, switch off markers or mute individual markers whenever you want.' },
  { kind: 'Fixed', title: 'Let the OAT hear you.', detail: 'Live voice now uses a relay when direct connections fail, with input and received-audio meters, listener volume and mute controls, and automatic connection recovery.' },
  { kind: 'Fixed', title: 'Keep moving.', detail: 'WASD keeps responding after arrivals and control changes. Delayed multiplayer updates no longer reset movement, and bicycle and buggy turns preserve momentum.' },
  { kind: 'Fixed', title: 'Take a seat at the OAT.', detail: 'Actions → Sit gives clear guidance when you need to stop, dismount or move closer to a bench. Sitting requests resolve with feedback, and moving gets you back on your feet.' },
  { kind: 'Improved', title: 'Arrive at the entrance.', detail: 'Building arrivals place you outside accessible entrances. CSE and ECE arrivals face the OAT, keeping you out of enclosed courtyards.' },
  { kind: 'Improved', title: 'A little more you.', detail: 'Saved girl and boy avatar choices, clean varsity jackets, fuller hairstyles and refined faces. Smoother strides and expressive actions bring the characters to life.' },
  { kind: 'Added', title: 'Buggies with a little bounce.', detail: 'Shared, speed-based buggy impacts push riders apart with bounded, smooth recoil. Bicycles now reach about 32 km/h and buggies 43 km/h, with gradual acceleration and stronger brakes.' },
  { kind: 'Improved', title: 'Room to explore.', detail: 'A rebuilt, landscaped Main Entrance extends out to NH66. The gateway, approach lanes and exterior road are part of the explorable campus.' },
  { kind: 'Improved', title: 'Less UI. More campus.', detail: 'Compact translucent panels work across phones and desktops. Minimize chat and concert controls, keep rotation as the default, or choose Move in Controls to drag across the campus. Pinch and scroll both zoom.' },
  { kind: 'Fixed', title: 'Two thumbs welcome.', detail: 'Phone movement and action buttons accept simultaneous touches, so you can steer while pressing Run or another action. Disabled buttons no longer steal active touches.' },
  { kind: 'Improved', title: 'One entrance. One intro.', detail: 'The black-and-gold AK loading intro stays continuous while the campus prepares, then reveals the scene. No duplicate intro or rotating circle. Made by Aryan · 23ECE1006.' },
] as const

export default function UpdatesPage() {
  return <main className="updates-page community-container" aria-labelledby="updates-title">
    <header className="updates-intro">
      <p className="updates-eyebrow">THE CAMPUS KEEPS GETTING BETTER</p>
      <h1 id="updates-title">You said it.<br /><em>We built on it.</em></h1>
      <p className="updates-description">Your feedback, brought into the campus.</p>
      <div className="updates-release"><span>Campus update</span><time dateTime="2026-10-10">8–10 October 2026</time></div>
    </header>
    <section className="updates-grid" aria-label="Changes in this update">
      {updates.map((update, index) => <article className="update-card" key={update.title}>
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
