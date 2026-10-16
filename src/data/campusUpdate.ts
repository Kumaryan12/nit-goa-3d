// Announce new things visitors can use or explore, newest first, with unique IDs.
// Keep maintenance and performance notes in CHANGELOG.md. New IDs become unread.
export type CampusUpdateDestination = 'nescafe' | 'football' | 'oat' | 'hostel' | 'entrance' | 'seminar'
export interface CampusUpdate {
  id: string
  kind: 'Added'
  title: string
  detail: string
  destination?: CampusUpdateDestination
  action?: string
}
export const campusUpdates: readonly CampusUpdate[] = [
  { id: 'chapora-walk-up-seating', destination: 'seminar', action: 'Visit Chapora Hall', kind: 'Added', title: 'Take a seat in Chapora.', detail: 'While exploring Chapora Hall, stand beside an available chair and choose Actions → Sit. Sit facing the stage with friends; move or choose Stand up to return to the aisle. Join Screenings for a front-centre movie seat.' },
  { id: 'chapora-movie-nights', destination: 'seminar', action: 'Visit Chapora Hall', kind: 'Added', title: 'Movie nights in Chapora.', detail: 'Open Screenings to watch NIT Goa’s welcome film on repeat. Join anytime, take an assigned seat facing the screen, choose your own volume or fullscreen view, and use quiet chat and reactions. Everyone joins the same screening; no host needs to be online.' },
  { id: 'seminar-courtyard-halls', destination: 'seminar', action: 'Explore the Seminar Complex', kind: 'Added', title: 'Inside the Seminar Complex.', detail: 'Explore Chapora Hall with auditorium seating and Sal Seminar Hall without seats. Take either entrance staircase to the wide shared upper walkway connecting both rear entrances, or follow the courtyard to their lower entrances. Chapora slopes toward its stage; Sal has broad steps descending toward its stage.' },
  { id: 'cafe-table-conversations', destination: 'nescafe', action: 'Visit Nescafé', kind: 'Added', title: 'Coffee and conversation at Nescafé.', detail: 'Sit with friends and chat over live voice while ordering and sipping coffee, cold coffee or water. Choose Start talking or Listen, mute your mic or tablemates, and adjust volume. Voice sessions last 10 minutes, with a one-minute warning and a two-minute break before restarting. Before standing up, choose Stay seated to keep chatting or Leave and stand up to finish.' },
  { id: 'nescafe-coffee-breaks', destination: 'nescafe', action: 'Visit Nescafé', kind: 'Added', title: 'Nescafé, now serving.', detail: 'Choose coffee, cold coffee or water at a serving window. Take a sip, sit at a shaded table and catch up with friends. Nearby players can see your drink too.' },
  { id: 'concert-seating', destination: 'oat', action: 'Visit the OAT', kind: 'Added', title: 'Live concerts at the OAT.', detail: 'Join the audience and take a seat facing the stage, or perform with music and your microphone. Listener volume and mute controls let you choose how to listen.' },
  { id: 'buggy-passengers', kind: 'Added', title: 'Bring your friends along.', detail: 'A buggy carries its driver and three passengers. Walk beside a stopped buggy and choose Hop in, or press F, to ride together around campus.' },
  { id: 'social-actions', kind: 'Added', title: 'Express yourself.', detail: 'Open Actions to wave, dance, applaud or send a reaction. Walk beside a Chapora chair, a Nescafé chair or the rear OAT benches to sit with friends; move or choose Stand up to get going again.' },
  { id: 'football-play', destination: 'football', action: 'Play football', kind: 'Added', title: 'Football, together.', detail: 'Join the shared game, pass to teammates and shoot at goal. Goals bring a team-coloured confetti celebration. On computers, use Q to pass and Space to shoot; phones have separate action buttons.' },
  { id: 'buggy-impacts', kind: 'Added', title: 'Dashing buggies.', detail: 'Take a buggy out with friends and try playful bumper-style collisions. Your speed affects the bounce, and everyone riding along shares the experience.' },
  { id: 'avatar-choice', kind: 'Added', title: 'Choose your avatar.', detail: 'Choose a boy or girl avatar and save your preference. Visitors have their own avatar colours, so friends are easier to recognise around campus.' },
]
