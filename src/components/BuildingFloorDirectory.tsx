import { useId, useState } from 'react'
import type { BuildingDetails } from '../types/buildingDetails'

export default function BuildingFloorDirectory({ details }: { details: BuildingDetails }) {
  const selectId = useId(), [floorId, setFloorId] = useState(details.floors[0]?.id)
  const floor = details.floors.find(item => item.id === floorId) ?? details.floors[0]
  return <section className="panel-section building-floor-directory">
    <h3>Floor directory</h3>
    <p className="panel-muted">Ground + {details.floors.filter(item => item.level > 0).length} upper floors</p>
    <label htmlFor={selectId}>Choose a floor</label>
    <select id={selectId} value={floor?.id ?? ''} onChange={event => setFloorId(event.target.value)}>
      {details.floors.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
    </select>
    {floor && (floor.rooms.length ? <ul className="hostel-room-list">{floor.rooms.map(room => <li key={room.number}><strong>Room {room.number}</strong>{room.description && <span>{room.description}</span>}</li>)}</ul> : <p className="panel-muted">Room numbers for {floor.label.toLowerCase()} have not been mapped yet.</p>)}
    {details.interiorStatus === 'not-modeled' && <p className="panel-muted">Interior walking is not available yet.</p>}
  </section>
}
