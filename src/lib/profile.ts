export const AVATAR_STYLES = ['girl', 'boy'] as const
export type AvatarStyle = typeof AVATAR_STYLES[number]
export const isAvatarStyle = (value: unknown): value is AvatarStyle => value === 'girl' || value === 'boy'
export const PROFILE_COLOR_HEX = {
  forest: '#277c77', clay: '#ad684c', ocean: '#388fc1', plum: '#866086',
  sunflower: '#e4b83d', coral: '#e87168', indigo: '#5966bf', mint: '#65bd98',
  rose: '#d66598', copper: '#c88034', lime: '#99b942', violet: '#a36bd3',
  crimson: '#bb465e', sky: '#69b8dc', pine: '#437744', apricot: '#f2a76c',
  lavender: '#b199df', jade: '#3fa486', sapphire: '#435a9b', peach: '#e7a794',
  amber: '#d58c25', fuchsia: '#be55ad', olive: '#858b43', aqua: '#45bfc5',
  burgundy: '#854862', cobalt: '#3b72db', moss: '#7ca269', orchid: '#cf93c8',
  tangerine: '#e57c3b', lemon: '#d8d766', teal: '#3c9ba4', slate: '#6b7d96',
} as const
export type AvatarColor = keyof typeof PROFILE_COLOR_HEX
export const PROFILE_COLORS: readonly AvatarColor[] = Object.keys(PROFILE_COLOR_HEX) as AvatarColor[]
export const isAvatarColor = (value: unknown): value is AvatarColor => typeof value === 'string' && Object.hasOwn(PROFILE_COLOR_HEX, value)

// Account IDs, rather than names/emails, give new profiles a stable default.
export function defaultAvatarColor(id: string): AvatarColor {
  let hash = 2166136261
  for (const character of id) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619)
  return PROFILE_COLORS[(hash >>> 0) % PROFILE_COLORS.length]
}
export function allocateAvatarColor(id: string, preferred: unknown, occupied: Iterable<AvatarColor>): AvatarColor {
  const used = new Set(occupied), wanted = isAvatarColor(preferred) ? preferred : defaultAvatarColor(id)
  if (!used.has(wanted)) return wanted
  const start = PROFILE_COLORS.indexOf(defaultAvatarColor(id))
  for (let i = 0; i < PROFILE_COLORS.length; i++) {
    const color = PROFILE_COLORS[(start + i) % PROFILE_COLORS.length]
    if (!used.has(color)) return color
  }
  throw new Error('The campus avatar palette is full.')
}
export function profileColorStyle(color: AvatarColor) {
  const hex = PROFILE_COLOR_HEX[color] ?? PROFILE_COLOR_HEX.forest
  return { '--profile-color': hex, '--profile-pale': `color-mix(in srgb, ${hex} 16%, #f7f5ed)`, '--profile-ink': avatarTextColor(color) }
}
export function avatarTextColor(color: AvatarColor) {
  const hex = PROFILE_COLOR_HEX[color] ?? PROFILE_COLOR_HEX.forest
  const rgb = [1, 3, 5].map(offset => {
    const channel = parseInt(hex.slice(offset, offset + 2), 16) / 255
    return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4
  })
  return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722 > .179 ? '#000000' : '#ffffff'
}
export interface CampusProfile {
  id: string
  display_name: string
  handle: string | null
  bio: string
  course: string
  interests: string[]
  avatar_style?: AvatarStyle | null
  avatar_color: (typeof PROFILE_COLORS)[number]
  is_public: boolean
  created_at: string
}
export const PROFILE_FIELDS =
  'id,display_name,handle,bio,course,interests,avatar_color,avatar_style,is_public,created_at'
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
  if (profile.avatar_style !== undefined && profile.avatar_style !== null && !isAvatarStyle(profile.avatar_style))
    return 'Choose a girl or boy avatar.'
  if (profile.avatar_color !== undefined && !isAvatarColor(profile.avatar_color))
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
