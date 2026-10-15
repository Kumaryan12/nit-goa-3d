import { theatreSeats } from './social.ts'
import type { SocialSeat } from './social.ts'
import type { TheatreLayout } from './theatre.ts'
import type { OatSnapshot } from './oatProtocol.ts'

export interface ConcertPlace { x: number; y: number; z: number; yaw: number }
export interface ConcertLayout { stage: ConcertPlace; seats: SocialSeat[] }
export interface ConcertPlacement extends ConcertPlace { space?: 'seminar:0'; seat: number; role: 'audience' | 'performer' }
export function createConcertLayout(theatre: Pick<TheatreLayout, 'center' | 'rotation' | 'depthScale' | 'widthScale' | 'elevation'>): ConcertLayout {
  const angle = theatre.rotation, z = -2 * theatre.depthScale
  return { stage: { x: theatre.center.x + Math.sin(angle) * z, z: theatre.center.z + Math.cos(angle) * z, y: theatre.elevation + .53, yaw: Math.atan2(Math.sin(angle + Math.PI), Math.cos(angle + Math.PI)) }, seats: theatreSeats(theatre).filter(seat => seat.row < 3) }
}
export function concertPlacement(layout: ConcertLayout, concert: OatSnapshot | null, id: string | null): ConcertPlacement | null {
  if (!concert || !id) return null
  const index = concert.participants.findIndex(person => person.id === id)
  if (index < 0) return null
  const seat = concert.participants[index].seat ?? index
  const place = id === concert.performerId ? layout.stage : layout.seats[seat]
  if (!place) return null
  return { x: place.x, y: place.y, z: place.z, yaw: place.yaw, seat, role: id === concert.performerId ? 'performer' : 'audience' }
}
