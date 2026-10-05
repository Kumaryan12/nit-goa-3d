import { initials } from '../lib/community'
import { profileColorStyle } from '../lib/profile'
import type { CampusProfile } from '../lib/community'
export default function ProfileCard({
  profile,
  compact = false,
}: {
  profile: CampusProfile
  compact?: boolean
}) {
  return (
    <article
      className={`profile-card ${compact ? 'profile-compact' : ''} color-${profile.avatar_color}`}
      style={profileColorStyle(profile.avatar_color) as React.CSSProperties}
    >
      <div className="profile-cover">
        <span>NITG / EXPLORED</span>
        <svg viewBox="0 0 400 100" aria-hidden="true">
          <path
            d="M-10 90q80-130 160-45t150-10 110-70M-10 120q80-130 160-45t150-10 110-70"
            fill="none"
            stroke="currentColor"
            strokeWidth="1"
          />
        </svg>
      </div>
      <div className="profile-avatar">{initials(profile.display_name)}</div>
      <div className="profile-card-body">
        <h2>{profile.display_name}</h2>
        <p className="profile-handle">
          {profile.handle ? `@${profile.handle}` : 'Your campus identity'}
        </p>
        {profile.course && <p className="profile-course">{profile.course}</p>}
        {!compact && (
          <p className="profile-bio">
            {profile.bio || 'A little space for your campus story.'}
          </p>
        )}
        <div className="profile-tags">
          {profile.interests.map((interest) => (
            <span key={interest}>{interest}</span>
          ))}
        </div>
        {!compact && (
          <div className="profile-card-foot">
            <span>Part of the campus</span>
            <span>
              {new Date(profile.created_at).toLocaleDateString('en', {
                month: 'short',
                year: 'numeric',
              })}
            </span>
          </div>
        )}
      </div>
    </article>
  )
}
