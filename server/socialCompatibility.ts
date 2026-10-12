import type { CampusSnapshot } from '../src/lib/campusProtocol.ts'

// Already-open browsers know only OAT seat IDs and otherwise reject the whole
// roster. Preserve their visible avatar poses until they refresh; new browsers
// advertise chair support and receive the complete sitting animation state.
export function legacySocialSnapshot(snapshot: CampusSnapshot): CampusSnapshot {
  if (!snapshot.people.some(person => person.social?.seatId?.startsWith('cafe-'))) return snapshot
  return { ...snapshot, people: snapshot.people.map(person => {
    if (!person.social?.seatId?.startsWith('cafe-')) return person
    const { social: _social, ...visiblePerson } = person
    return visiblePerson
  }) }
}
