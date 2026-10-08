import type { Firestore } from 'firebase-admin/firestore'
import { FieldPath } from 'firebase-admin/firestore'
import { isAvatarStyle, profileError } from '../src/lib/profile.ts'
import type { CampusProfile } from '../src/lib/profile.ts'
import type { CampusIdentity } from './access.ts'
export function createProfileStore(db: Firestore) {
  const cache = new Map<string, { until: number; data: unknown }>()
  const changed = () => {
    cache.clear()
  }
  const own = async (id: string) => {
    const row = await db.doc('profiles/' + id).get()
    if (!row.exists)
      throw new Error(
        'Your profile is unavailable. Rejoin campus and try again.',
      )
    return row.data() as CampusProfile
  }
  async function save(identity: CampusIdentity, input: unknown) {
    if (!input || typeof input !== 'object' || Array.isArray(input))
      throw new Error('Invalid profile details.')
    const source = input as Record<string, unknown>
    if (
      typeof source.display_name !== 'string' ||
      !(source.handle === null || typeof source.handle === 'string') ||
      typeof source.bio !== 'string' ||
      typeof source.course !== 'string' ||
      !Array.isArray(source.interests) ||
      !source.interests.every((v) => typeof v === 'string') ||
      typeof source.avatar_color !== 'string' ||
      typeof source.is_public !== 'boolean'
    )
      throw new Error('Invalid profile details.')
    const fields = {
      display_name: source.display_name.trim(),
      handle: (source.handle as string | null)?.trim() || null,
      bio: source.bio.trim(),
      course: source.course.trim(),
      interests: [
        ...new Set(
          (source.interests as string[]).map((v) => v.trim()).filter(Boolean),
        ),
      ],
      avatar_color: source.avatar_color as CampusProfile['avatar_color'],
      is_public: source.is_public,
      ...(source.avatar_style !== undefined ? { avatar_style: source.avatar_style as CampusProfile['avatar_style'] } : {}),
    }
    const error = profileError(fields)
    if (error) throw new Error(error)
    const ref = db.doc('profiles/' + identity.id),
      member = db.doc('campusMembers/' + identity.id)
    const profile = await db.runTransaction(async (tx) => {
      const [previous, membership] = await Promise.all([
        tx.get(ref),
        tx.get(member),
      ])
      if (!previous.exists || membership.data()?.status !== 'active')
        throw new Error('Campus access is unavailable.')
      const old = previous.data() as CampusProfile,
        newHandle = fields.handle
          ? db.doc('profileHandles/' + fields.handle)
          : null,
        oldHandle = old.handle ? db.doc('profileHandles/' + old.handle) : null
      const handleDoc = newHandle ? await tx.get(newHandle) : null
      if (handleDoc?.exists && handleDoc.data()?.userId !== identity.id)
        throw new Error('That handle is taken. Try another.')
      const next = { ...fields, avatar_style: source.avatar_style === undefined ? old.avatar_style ?? null : fields.avatar_style ?? null, id: identity.id, created_at: old.created_at }
      if (oldHandle && old.handle !== fields.handle) tx.delete(oldHandle)
      if (old.handle && (old.handle !== fields.handle || !fields.is_public))
        tx.delete(db.doc('publicProfiles/' + old.handle))
      if (newHandle) tx.set(newHandle, { userId: identity.id })
      tx.set(ref, next)
      if (fields.is_public && fields.handle)
        tx.set(db.doc('publicProfiles/' + fields.handle), next)
      return next
    })
    changed()
    return profile
  }
  async function saveAvatar(identity: CampusIdentity, input: unknown) {
    if (!input || typeof input !== 'object' || Array.isArray(input) || !isAvatarStyle((input as Record<string, unknown>).avatar_style)) throw new Error('Choose a girl or boy avatar.')
    const avatar_style = (input as { avatar_style: 'girl' | 'boy' }).avatar_style
    const ref = db.doc('profiles/' + identity.id)
    const profile = await db.runTransaction(async tx => {
      const [previous, membership] = await Promise.all([tx.get(ref), tx.get(db.doc('campusMembers/' + identity.id))])
      if (!previous.exists || membership.data()?.status !== 'active') throw new Error('Campus access is unavailable.')
      const old = previous.data() as CampusProfile, next = { ...old, avatar_style }
      // This endpoint updates appearance only. Never accept profile IDs, roles,
      // names or visibility from the request, or overwrite a concurrent edit.
      tx.update(ref, { avatar_style })
      if (old.is_public && old.handle) tx.set(db.doc('publicProfiles/' + old.handle), next)
      return next
    })
    changed(); return profile
  }
  async function publicProfile(handle: string) {
    if (!/^[a-z][a-z0-9_]{2,23}$/.test(handle)) return null
    const key = 'handle:' + handle,
      cached = cache.get(key)
    if (cached && cached.until > Date.now()) return cached.data
    const row = await db.doc('publicProfiles/' + handle).get(),
      data = row.exists ? row.data() : null
    if (cache.size >= 512) cache.delete(cache.keys().next().value!)
    cache.set(key, { until: Date.now() + 30000, data })
    return data
  }
  async function directory(cursor?: string) {
    let after: { created_at: string; handle: string } | null = null
    if (cursor) {
      try {
        after = JSON.parse(Buffer.from(cursor, 'base64url').toString())
        if (
          !after ||
          !/^\d{4}-\d{2}-\d{2}T/.test(after.created_at) ||
          !/^[a-z][a-z0-9_]{2,23}$/.test(after.handle) ||
          cursor.length > 240
        )
          throw new Error()
      } catch {
        throw new Error('Invalid directory page.')
      }
    }
    const key = 'page:' + (cursor || ''),
      cached = cache.get(key)
    if (cached && cached.until > Date.now()) return cached.data
    let query = db
      .collection('publicProfiles')
      .orderBy('created_at', 'desc')
      .orderBy(FieldPath.documentId(), 'desc')
      .limit(25)
    if (after) query = query.startAfter(after.created_at, after.handle)
    const result = await query.get(),
      profiles = result.docs.slice(0, 24).map((doc) => doc.data()),
      last = profiles.at(-1)
    const data = {
      profiles,
      more: result.docs.length > 24,
      next:
        result.docs.length > 24 && last
          ? Buffer.from(
              JSON.stringify({
                created_at: last.created_at,
                handle: last.handle,
              }),
            ).toString('base64url')
          : null,
    }
    if (cache.size >= 512) cache.delete(cache.keys().next().value!)
    cache.set(key, { until: Date.now() + 30000, data })
    return data
  }
  return { own, save, saveAvatar, publicProfile, directory, changed }
}
