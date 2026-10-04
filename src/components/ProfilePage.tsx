import { useEffect, useState } from 'react'
import { campusAPI } from '../lib/firebase'
import { PROFILE_COLORS, profileError } from '../lib/community'
import type { CampusProfile } from '../lib/community'
import ProfileCard from './ProfileCard'
export default function ProfilePage({
  userId,
  onSaved,
}: {
  userId: string
  onSaved: () => void
}) {
  const [savedShare, setSavedShare] = useState('')
  const [profile, setProfile] = useState<CampusProfile | null>(null),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false),
    [interests, setInterests] = useState(''),
    [copied, setCopied] = useState(false)
  useEffect(() => {
    let active = true
    void campusAPI('/api/me')
      .then((data) => {
        const error = !data
        if (active) {
          if (error)
            setMessage('Your profile could not load. Refresh to try again.')
          else {
            setProfile(data as CampusProfile)
            setSavedShare(data.is_public ? data.handle : '')
            setInterests(data.interests.join(', '))
          }
        }
      })
      .catch(() => {
        if (active) setMessage('Your profile is unavailable.')
      })
    return () => {
      active = false
    }
  }, [userId])
  const change = (value: Partial<CampusProfile>) => {
    setMessage('')
    setCopied(false)
    setProfile((p) => (p ? { ...p, ...value } : p))
  }
  if (!profile)
    return (
      <div className="community-empty" role="status">
        {message || 'Opening your profile…'}
      </div>
    )
  const shareURL = profile.handle
    ? `${window.location.origin}/people/${profile.handle}`
    : ''
  return (
    <main className="community-container profile-page">
      <div className="community-section-heading">
        <span className="community-kicker">MAKE YOURSELF AT HOME</span>
        <h1>
          Your little corner
          <br />
          of campus.
        </h1>
        <p>
          Add your story whenever you’re ready. You decide what the world sees.
        </p>
      </div>
      <div className="profile-layout">
        <form
          className="profile-form"
          onSubmit={async (event) => {
            event.preventDefault()
            if (busy) return
            const fields = {
              display_name: profile.display_name.trim(),
              handle: profile.handle?.trim() || null,
              bio: profile.bio.trim(),
              course: profile.course.trim(),
              interests: interests
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean),
              avatar_color: profile.avatar_color,
              is_public: profile.is_public,
            }
            const error = profileError(fields)
            if (error) {
              setMessage(error)
              return
            }
            setBusy(true)
            setMessage('')
            try {
              const data = await campusAPI('/api/me', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(fields),
              })
              setProfile(data as CampusProfile)
              setSavedShare(fields.is_public ? fields.handle || '' : '')
              setMessage(
                'Saved. Your profile is ' +
                  (fields.is_public
                    ? 'public and ready to share.'
                    : 'visible only to you.'),
              )
              onSaved()
            } catch (error) {
              setMessage(
                error instanceof Error &&
                  error.message.includes('handle is taken')
                  ? 'That handle is taken. Try another.'
                  : 'Your profile could not be saved. Check your connection and try again.',
              )
            } finally {
              setBusy(false)
            }
          }}
        >
          <label htmlFor="profile-name">
            Display name
            <input
              id="profile-name"
              autoComplete="nickname"
              required
              maxLength={80}
              value={profile.display_name}
              onChange={(e) => change({ display_name: e.target.value })}
            />
          </label>
          <label htmlFor="profile-handle">
            Your handle <span>Optional until you share</span>
            <div className="handle-input">
              <span>@</span>
              <input
                id="profile-handle"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                maxLength={24}
                value={profile.handle || ''}
                onChange={(e) =>
                  change({ handle: e.target.value.toLowerCase() })
                }
                placeholder="your_campus_name"
              />
            </div>
          </label>
          <label htmlFor="profile-course">
            Course / batch <span>Optional</span>
            <input
              id="profile-course"
              maxLength={80}
              value={profile.course}
              onChange={(e) => change({ course: e.target.value })}
              placeholder="Computer Science · Class of 2027"
            />
          </label>
          <label htmlFor="profile-bio">
            A little about you <span>{profile.bio.length}/280</span>
            <textarea
              id="profile-bio"
              maxLength={280}
              rows={4}
              value={profile.bio}
              onChange={(e) => change({ bio: e.target.value })}
              placeholder="The things you love. Your favourite corner. What brings you here."
            />
          </label>
          <label htmlFor="profile-interests">
            Your interests <span>Up to 5, separated by commas</span>
            <input
              id="profile-interests"
              maxLength={164}
              value={interests}
              onChange={(e) => {
                setInterests(e.target.value)
                change({
                  interests: e.target.value
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean)
                    .slice(0, 5),
                })
              }}
              placeholder="Music, football, late-night conversations"
            />
          </label>
          <fieldset className="profile-colors">
            <legend>Pick your colour</legend>
            {PROFILE_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                aria-label={`${color} profile colour`}
                aria-pressed={profile.avatar_color === color}
                className={`swatch color-${color}`}
                onClick={() => change({ avatar_color: color })}
              />
            ))}
          </fieldset>
          <label className="profile-visibility">
            <input
              type="checkbox"
              checked={profile.is_public}
              onChange={(e) => change({ is_public: e.target.checked })}
            />
            <span>
              <strong>Let people discover my profile</strong>
              <small>
                Your name, bio, course and interests will appear in the
                directory and at your public link. Your email stays private.
              </small>
            </span>
          </label>
          <div className="profile-save">
            <button className="community-primary" disabled={busy}>
              {busy ? 'Saving…' : 'Save my profile ↗'}
            </button>
            <span>You can change this any time.</span>
          </div>
          {message && (
            <p className="community-notice" role="status">
              {message}
            </p>
          )}
        </form>
        <div className="profile-preview">
          <span className="community-kicker">YOUR PROFILE, AT A GLANCE</span>
          <ProfileCard profile={profile} />
          <p className="profile-preview-note">
            {profile.is_public
              ? 'Public once you save your changes.'
              : 'Private. Just for you, until you’re ready.'}
          </p>
          {profile.is_public && profile.handle === savedShare && savedShare && (
            <button
              className="community-secondary"
              onClick={() => {
                void navigator.clipboard
                  ?.writeText(shareURL)
                  .then(() => setCopied(true))
                  .catch(() => setMessage('Copy this link: ' + shareURL))
              }}
            >
              {copied ? 'Link copied ✓' : 'Copy profile link ↗'}
            </button>
          )}
        </div>
      </div>
    </main>
  )
}
