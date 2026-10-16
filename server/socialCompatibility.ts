import type { CampusSnapshot } from '../src/lib/campusProtocol.ts'

// Browsers advertise supported chair types. Preserve avatar positions for older
// clients without sending seat IDs that would make them reject the whole roster.
export function legacySocialSnapshot(snapshot: CampusSnapshot, cafeSeats = false, chaporaSeats = false): CampusSnapshot {
  const unsupported = (id?: string) => !!id && (!cafeSeats && id.startsWith('cafe-') || !chaporaSeats && id.startsWith('chapora-'))
  if (!snapshot.people.some(person => unsupported(person.social?.seatId))) return snapshot
  return { ...snapshot, people: snapshot.people.map(person => {
    if (!unsupported(person.social?.seatId)) return person
    const { social: _social, ...visiblePerson } = person
    return visiblePerson
  }) }
}
