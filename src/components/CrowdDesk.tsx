import { useCallback, useEffect, useState } from 'react'
import ModeratorVerification from './ModeratorVerification'
import { campusAPI } from '../lib/firebase'
interface Room {
  capacity: number
  occupancy: number
  waiting: number
  people: { id: string; name: string; role: string; waiting: boolean }[]
}
export default function CrowdDesk({ role }: { role: string }) {
  const [verified, setVerified] = useState(false)
  const onVerified = useCallback((token: string) => {
    setVerified(true)
    setModerationToken(token)
  }, [])
  const [rooms, setRooms] = useState<Record<string, Room>>({}),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(''),
    [target, setTarget] = useState(''),
    [reason, setReason] = useState(''),
    [action, setAction] = useState('kick'),
    [refresh, setRefresh] = useState(0)
  const [moderationToken, setModerationToken] = useState('')
  async function request(method = 'GET', body?: unknown) {
    return campusAPI('/api/crowd', {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(method === 'POST' ? { 'X-Moderator-Token': moderationToken } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
  }
  useEffect(() => {
    if (role !== 'admin' || !verified) return
    let active = true
    const load = () => {
      void request()
        .then((data) => {
          if (active) {
            setRooms(data)
            setError('')
          }
        })
        .catch(() => {
          if (active) setError('Crowd information could not load. Try again.')
        })
    }
    load()
    const timer = setInterval(load, 10000)
    return () => {
      active = false
      clearInterval(timer)
    }
  }, [role, refresh, verified])
  if (role !== 'admin')
    return (
      <div className="community-empty">
        The crowd desk is available only to the campus owner.
      </div>
    )
  if (!verified)
    return (
      <main className="community-container crowd-page">
        <ModeratorVerification onVerified={onVerified} />
      </main>
    )
  return (
    <main className="community-container crowd-page">
      <div className="community-section-heading">
        <span className="community-kicker">CAMPUS MODERATION</span>
        <h1>
          Keep the campus
          <br />a good place to be.
        </h1>
        <p>
          Rooms have limited places. Waiting visitors enter in arrival order as
          places open.
        </p>
      </div>
      {error && (
        <p className="community-notice" role="alert">
          {error}
        </p>
      )}
      <button
        className="community-secondary"
        onClick={() => {
          setVerified(false)
          setModerationToken('')
        }}
      >
        Verify authenticator again
      </button>
      <div className="crowd-rooms">
        {Object.entries(rooms).map(([name, room]) => (
          <section key={name} className="crowd-room">
            <h2>{name === 'oat' ? 'Open Air Theatre' : name === 'campus' ? 'Shared campus' : 'Football ground'}</h2>
            <p>
              {room.occupancy} / {room.capacity} inside · {room.waiting} waiting
            </p>
            <progress
              aria-label={`${name} occupancy`}
              value={room.occupancy}
              max={room.capacity}
            />
            <ul>
              {room.people.map((person) => (
                <li key={person.id}>
                  <span>
                    {person.name}
                    <small>
                      {person.waiting ? 'Waiting' : 'Inside'} · {person.role}
                    </small>
                  </span>
                  <button
                    className="community-secondary"
                    onClick={() => {
                      setTarget(person.id)
                      setAction('kick')
                      document.getElementById('moderation-reason')?.focus()
                    }}
                  >
                    Review
                  </button>
                </li>
              ))}
            </ul>
            {!room.people.length && (
              <p className="crowd-empty">Quiet for now.</p>
            )}
          </section>
        ))}
      </div>
      <form
        className="crowd-form"
        onSubmit={async (event) => {
          event.preventDefault()
          if (busy) return
          setBusy(target)
          setError('')
          try {
            await request('POST', { target, action, reason })
            setTarget('')
            setReason('')
            setRefresh((v) => v + 1)
          } catch (e) {
            setError(e instanceof Error ? e.message : 'Action failed.')
            if (
              e instanceof Error &&
              /verification expired|Verify your authenticator/.test(e.message)
            ) {
              setVerified(false)
              setModerationToken('')
            }
          } finally {
            setBusy('')
          }
        }}
      >
        <h2>Moderate an account</h2>
        <p>
          Every action is recorded. A kick removes someone for one minute; a ban
          blocks all live rooms.
        </p>
        <label htmlFor="moderation-user">
          Account ID
          <input
            id="moderation-user"
            required
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder="Choose Review above, or paste an Firebase account ID"
          />
        </label>
        <label htmlFor="moderation-action">
          Action
          <select
            id="moderation-action"
            value={action}
            onChange={(e) => setAction(e.target.value)}
          >
            <option value="kick">Remove from live rooms</option>
            <option value="end-stage">End OAT stage turn</option>
            <option value="ban">Suspend campus access</option>
            <option value="unban">Restore campus access</option>
          </select>
        </label>
        <label htmlFor="moderation-reason">
          Reason
          <input
            id="moderation-reason"
            required
            maxLength={240}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="A brief reason for the audit record"
          />
        </label>
        <button className="community-primary" disabled={!!busy}>
          {busy ? 'Applying…' : 'Apply action'}
        </button>
      </form>
    </main>
  )
}
