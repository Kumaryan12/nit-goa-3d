import { useId, useState } from 'react'
import { demoRoomNumber } from '../lib/hostelInterior'
import type { HostelPlan } from '../lib/hostelInterior'
import type { BuildingDetails } from '../types/buildingDetails'

export default function BuildingFloorDirectory({ details, plan, onEnter }: { details: BuildingDetails; plan?: HostelPlan | null; onEnter?: () => void }) {
  const selectId = useId(), [floorId, setFloorId] = useState(details.floors[0]?.id)
  const floor = details.floors.find(item => item.id === floorId) ?? details.floors[0]
  const rooms = floor?.rooms.length ? floor.rooms : plan && floor ? plan.rooms.map(room => ({ number: demoRoomNumber(floor.level, room.id), description: 'Provisional room in the approximate layout' })) : []
  return <section className="panel-section building-floor-directory">
    <h3>Floor directory</h3>
    <p className="panel-muted">Ground + {details.floors.filter(item => item.level > 0).length} upper floors</p>
    <label htmlFor={selectId}>Choose a floor</label>
    <select id={selectId} value={floor?.id ?? ''} onChange={event => setFloorId(event.target.value)}>
      {details.floors.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
    </select>
    {details.interiorStatus === 'approximate' && <><p className="panel-muted">Approximate interior · DEMO room labels and layout are provisional.</p>{plan && onEnter && <button className="navigate-button" onClick={onEnter}>Enter approximate interior →</button>}</>}
    {details.interiorStatus === 'not-modeled' && <p className="panel-muted">Interior walking is not available yet.</p>}
    {floor && (rooms.length ? <ul className="hostel-room-list">{rooms.map(room => <li key={room.number}><strong>Room {room.number}</strong>{room.description && <span>{room.description}</span>}</li>)}</ul> : <p className="panel-muted">Room numbers for {floor.label.toLowerCase()} have not been mapped yet.</p>)}

  </section>
}
