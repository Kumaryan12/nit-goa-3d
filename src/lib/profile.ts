export const PROFILE_COLORS = ['forest', 'clay', 'ocean', 'plum'] as const
export interface CampusProfile {
  id: string
  display_name: string
  handle: string | null
  bio: string
  course: string
  interests: string[]
  avatar_color: (typeof PROFILE_COLORS)[number]
  is_public: boolean
  created_at: string
}
export const PROFILE_FIELDS =
  'id,display_name,handle,bio,course,interests,avatar_color,is_public,created_at'
export function profileError(profile: Partial<CampusProfile>): string | null {
  if (!profile.display_name?.trim() || profile.display_name.trim().length > 80)
    return 'Choose a display name, up to 80 characters.'
  if (
    profile.handle &&
    (!/^[a-z][a-z0-9_]{2,23}$/.test(profile.handle) ||
      [
        'admin',
        'administrator',
        'moderator',
        'support',
        'nitgoa',
        'official',
        'campus',
        'system',
      ].includes(profile.handle))
  )
    return 'Use 3–24 letters, numbers or underscores. Start with a letter and choose a personal handle.'
  if (profile.is_public && !profile.handle)
    return 'Choose a handle before making your profile public.'
  if ((profile.bio?.length || 0) > 280 || (profile.course?.length || 0) > 80)
    return 'Your bio or course is too long.'
  if (
    (profile.interests?.length || 0) > 5 ||
    (profile.interests?.join(',').length || 0) > 160
  )
    return 'Add up to five interests, each a few words.'
  if (!PROFILE_COLORS.includes(profile.avatar_color || 'forest'))
    return 'Choose an available profile color.'
  return null
}
export function initials(name: string) {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((word) => word[0])
      .join('')
      .toUpperCase() || 'CM'
  )
}
