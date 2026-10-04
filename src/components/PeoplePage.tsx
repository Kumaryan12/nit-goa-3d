import { useEffect, useState } from 'react'
import { campusAPI, firebasePublicConfig } from '../lib/firebase'
import { navigate } from '../lib/community'
import type { CampusProfile } from '../lib/community'
import ProfileCard from './ProfileCard'
export default function PeoplePage({ handle }: { handle?: string }) {
  const [profiles, setProfiles] = useState<CampusProfile[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [page, setPage] = useState(0),
    [cursors, setCursors] = useState<string[]>(['']),
    [retry, setRetry] = useState(0),
    [more, setMore] = useState(false)
  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    if (!firebasePublicConfig) {
      setLoading(false)
      return
    }
    void campusAPI(
      handle
        ? '/api/people/' + encodeURIComponent(handle)
        : '/api/people?cursor=' + encodeURIComponent(cursors[page] || ''),
      {},
      false,
    )
      .then((result) => {
        const data = handle ? (result ? [result] : []) : result.profiles,
          error = false
        if (active) {
          if (error) setError('Profiles could not load. Please try again.')
          else {
            setProfiles((data || []).slice(0, 24) as CampusProfile[])
            setMore(!handle && !!result?.more)
            if (result?.next)
              setCursors((values) => [
                ...values.slice(0, page + 1),
                result.next,
              ])
          }
          setLoading(false)
        }
      })
      .catch(() => {
        if (active) {
          setError('Profiles are temporarily unavailable.')
          setLoading(false)
        }
      })
    return () => {
      active = false
    }
  }, [handle, page, retry])
  return (
    <main className="community-container people-page">
      <div className="community-section-heading">
        <span className="community-kicker">THE PEOPLE MAKE THE PLACE</span>
        <h1>{handle ? 'A familiar face.' : 'Find your people.'}</h1>
        <p>
          {handle
            ? 'A small window into someone’s campus story.'
            : 'Campus stories, shared by the people who choose to tell them.'}
        </p>
      </div>
      {loading ? (
        <p role="status">Opening the directory…</p>
      ) : error ? (
        <div className="community-notice" role="alert">
          {error}
          <button
            onClick={() => setRetry((p) => p + 1)}
            className="community-secondary"
          >
            Try again
          </button>
        </div>
      ) : profiles.length ? (
        <div className={`people-grid ${handle ? 'people-single' : ''}`}>
          {profiles.map((profile) => (
            <div key={profile.id}>
              <ProfileCard profile={profile} compact={!handle} />
              {!handle && (
                <button
                  className="profile-view"
                  onClick={() => navigate('/people/' + profile.handle)}
                >
                  Meet {profile.display_name.split(' ')[0]} <span>↗</span>
                </button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="community-empty">
          <span className="empty-flower" aria-hidden="true">
            ✳
          </span>
          <h2>
            {handle
              ? 'This profile isn’t public.'
              : 'The first stories are yet to arrive.'}
          </h2>
          <p>
            {handle
              ? 'It may be private, or the link may have changed.'
              : 'Your profile is optional. Publish yours when you’re ready to be discovered.'}
          </p>
        </div>
      )}
      {!handle && (page > 0 || more) && (
        <div className="people-pagination">
          <button
            className="community-secondary"
            disabled={page === 0}
            onClick={() => setPage((p) => p - 1)}
          >
            ← Previous
          </button>
          <span>Page {page + 1}</span>
          <button
            className="community-secondary"
            disabled={!more}
            onClick={() => setPage((p) => p + 1)}
          >
            Next →
          </button>
        </div>
      )}
    </main>
  )
}
