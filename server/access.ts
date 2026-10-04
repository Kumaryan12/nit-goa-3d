import type { IncomingMessage } from 'node:http'
import { firebaseAdmin, firebaseProject } from './firebaseAdmin.ts'
import type { Auth } from 'firebase-admin/auth'
import type { Firestore } from 'firebase-admin/firestore'
import { campusRole, ownerPolicyPath } from './authorization.ts'
import { PROFILE_COLORS } from '../src/lib/profile.ts'
import type { CampusProfile } from '../src/lib/profile.ts'
class MembershipUnavailable extends Error {}
export interface CampusIdentity {
  id: string
  name: string
  role: 'member' | 'moderator' | 'admin'
  expiresAt: number
  authTime?: number
  publicHandle?: string | null
  avatarColor?: CampusProfile['avatar_color']
}
export type VerifyAccess = (token: string) => Promise<CampusIdentity>
export interface AccessDependencies {
  auth: Pick<Auth, 'verifyIdToken' | 'getUser'>
  db: Firestore
  domains?: string[]
}
export function createAccessVerifier(deps?: AccessDependencies): VerifyAccess {
  return async (token) => {
    if (typeof token !== 'string' || token.length < 20 || token.length > 8192)
      throw new Error('Sign in to join campus.')
    const backend = deps || firebaseAdmin(),
      domains =
        deps?.domains ||
        process.env.CAMPUS_EMAIL_DOMAINS?.split(',')
          .map((s) => s.trim().toLowerCase())
          .filter(Boolean)
    // Admin SDK verifies signature, project audience, expiry and revocation.
    let decoded, user
    try {
      decoded = await backend.auth.verifyIdToken(token, true)
      user = await backend.auth.getUser(decoded.uid)
    } catch {
      throw new Error(
        'Your Google sign-in could not be verified. Sign in again.',
      )
    }
    if (
      user.uid !== decoded.uid ||
      !Number.isFinite(decoded.exp) ||
      decoded.exp * 1000 <= Date.now() ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(user.uid)
    )
      throw new Error('Your Google sign-in has expired or is invalid.')
    if (
      user.disabled ||
      !user.emailVerified ||
      !user.email ||
      decoded.firebase.sign_in_provider !== 'google.com'
    )
      throw new Error('Use a verified Google account to join campus.')
    if (
      domains?.length &&
      !domains.includes(user.email.split('@')[1]?.toLowerCase())
    )
      throw new Error('This Google account is not eligible to join campus.')
    const profileRef = backend.db.doc('profiles/' + user.uid),
      memberRef = backend.db.doc('campusMembers/' + user.uid)
    const access = await backend.db
      .runTransaction(async (tx) => {
        const [profile, member, policy] = await Promise.all([
          tx.get(profileRef),
          tx.get(memberRef),
          tx.get(backend.db.doc(ownerPolicyPath)),
        ])
        if (member.exists && member.data()?.status !== 'active')
          throw new MembershipUnavailable()
        const role = campusRole(policy.data(), user.uid, user.email!)
        const now = new Date().toISOString(),
          defaultProfile = {
            id: user.uid,
            display_name: String(user.displayName || 'Campus member').slice(
              0,
              80,
            ),
            handle: null,
            bio: '',
            course: '',
            interests: [],
            avatar_color: 'forest',
            is_public: false,
            created_at: now,
          }
        if (!profile.exists) tx.create(profileRef, defaultProfile)
        if (!member.exists)
          tx.create(memberRef, {
            role,
            status: 'active',
            updated_at: now,
          })
        else if (member.data()?.role !== role)
          tx.update(memberRef, { role, updated_at: now })
        return {
          profile: profile.exists ? profile.data()! : defaultProfile,
          member: { role, status: 'active' },
        }
      })
      .catch((error) => {
        if (error instanceof MembershipUnavailable)
          throw new Error('Campus access is unavailable for this account.')
        throw new Error('Campus access is temporarily unavailable.')
      })
    return {
      id: user.uid,
      name: String(access.profile.display_name || 'Campus member')
        .trim()
        .slice(0, 80),
      role: access.member.role,
      expiresAt: decoded.exp * 1000,
      authTime: decoded.auth_time * 1000,
      publicHandle: access.profile.is_public === true && typeof access.profile.handle === 'string' && /^[a-z][a-z0-9_]{2,23}$/.test(access.profile.handle) ? access.profile.handle : null,
      avatarColor: PROFILE_COLORS.includes(access.profile.avatar_color) ? access.profile.avatar_color : 'forest',
    }
  }
}
export function bearer(request: IncomingMessage) {
  return (
    /^Bearer ([A-Za-z0-9_.-]{20,8192})$/.exec(
      request.headers.authorization || '',
    )?.[1] || ''
  )
}
export { firebaseProject }
