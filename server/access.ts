import type { IncomingMessage } from 'node:http'
import { firebaseAdmin, firebaseProject } from './firebaseAdmin.ts'
import type { Auth } from 'firebase-admin/auth'
import type { Firestore } from 'firebase-admin/firestore'
export interface CampusIdentity {
  id: string
  name: string
  role: 'member' | 'moderator' | 'admin'
  expiresAt: number
  authTime?: number
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
        const [profile, member] = await Promise.all([
          tx.get(profileRef),
          tx.get(memberRef),
        ])
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
            role: 'member',
            status: 'active',
            updated_at: now,
          })
        return {
          profile: profile.exists ? profile.data()! : defaultProfile,
          member: member.exists
            ? member.data()!
            : { role: 'member', status: 'active' },
        }
      })
      .catch(() => {
        throw new Error('Campus access is temporarily unavailable.')
      })
    if (
      access.member.status !== 'active' ||
      !['member', 'moderator', 'admin'].includes(access.member.role)
    )
      throw new Error('Campus access is unavailable for this account.')
    return {
      id: user.uid,
      name: String(access.profile.display_name || 'Campus member')
        .trim()
        .slice(0, 80),
      role: access.member.role,
      expiresAt: decoded.exp * 1000,
      authTime: decoded.auth_time * 1000,
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
