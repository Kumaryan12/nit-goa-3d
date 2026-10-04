import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto'
import type { Firestore } from 'firebase-admin/firestore'
import { Secret, TOTP } from 'otpauth'
import QRCode from 'qrcode'
import { readFileSync } from 'node:fs'
import type { CampusIdentity } from './access.ts'
import type { CampusProfile } from '../src/lib/profile.ts'
import { ownerPolicy, ownerPolicyPath } from './authorization.ts'

export function moderatorKey(env: NodeJS.ProcessEnv = process.env) {
  if (env.MODERATOR_SECRET_KEY) return env.MODERATOR_SECRET_KEY
  if (!env.MODERATOR_SECRET_KEY_FILE) return undefined
  try {
    return readFileSync(env.MODERATOR_SECRET_KEY_FILE, 'utf8').trim()
  } catch {
    throw new Error('Moderator verification is not configured.')
  }
}

export function createModeratorService(
  db: Firestore,
  key: string | undefined = moderatorKey(),
  clock = Date.now,
) {
  const bytes = Buffer.from(key || '', 'base64')
  if (bytes.length !== 32)
    throw new Error('Moderator verification is not configured.')
  const derive = (purpose: string) =>
    createHmac('sha256', bytes).update(purpose).digest()
  const encryptionKey = derive('campus:totp'),
    signingKey = derive('campus:moderation-ticket')
  const encrypt = (secret: string, uid: string) => {
    const iv = randomBytes(12),
      cipher = createCipheriv('aes-256-gcm', encryptionKey, iv)
    cipher.setAAD(Buffer.from(uid))
    return Buffer.concat([
      iv,
      cipher.update(secret),
      cipher.final(),
      cipher.getAuthTag(),
    ]).toString('base64')
  }
  const decrypt = (value: string, uid: string) => {
    const raw = Buffer.from(value, 'base64'),
      decipher = createDecipheriv(
        'aes-256-gcm',
        encryptionKey,
        raw.subarray(0, 12),
      )
    decipher.setAAD(Buffer.from(uid))
    decipher.setAuthTag(raw.subarray(-16))
    return Buffer.concat([
      decipher.update(raw.subarray(12, -16)),
      decipher.final(),
    ]).toString()
  }
  const requireModerator = (identity: CampusIdentity) => {
    if (identity.role !== 'admin')
      throw new Error('Moderator access required.')
  }
  const requireFresh = (identity: CampusIdentity) => {
    requireModerator(identity)
    if (
      !identity.authTime ||
      clock() - identity.authTime > 300000 ||
      identity.authTime > clock() + 30000
    )
      throw new Error('Confirm your Google account again before verification.')
  }
  const totp = (secret: string, identity: CampusIdentity) =>
    new TOTP({
      issuer: 'NITG Explored',
      label: identity.id,
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: Secret.fromBase32(secret),
    })
  const signature = (payload: string) =>
    createHmac('sha256', signingKey).update(payload).digest()
  function ticket(identity: CampusIdentity) {
    const payload = Buffer.from(
      JSON.stringify({
        uid: identity.id,
        authTime: identity.authTime,
        exp: clock() + 600000,
        scope: 'campus:moderate',
      }),
    ).toString('base64url')
    return payload + '.' + signature(payload).toString('base64url')
  }
  function authorize(identity: CampusIdentity, value: unknown) {
    requireModerator(identity)
    if (typeof value !== 'string' || value.length > 1024)
      throw new Error('Verify your authenticator code before moderating.')
    const [payload, sig, ...extra] = value.split('.'),
      expected = signature(payload),
      actual = Buffer.from(sig || '', 'base64url')
    if (
      extra.length ||
      actual.length !== expected.length ||
      !timingSafeEqual(actual, expected)
    )
      throw new Error('Verify your authenticator code before moderating.')
    let data
    try {
      data = JSON.parse(Buffer.from(payload, 'base64url').toString())
    } catch {
      throw new Error('Verification is invalid.')
    }
    if (
      data.uid !== identity.id ||
      data.authTime !== identity.authTime ||
      data.scope !== 'campus:moderate' ||
      !Number.isFinite(data.exp) ||
      data.exp <= clock() ||
      data.exp > clock() + 600000
    )
      throw new Error('Your moderator verification expired. Verify again.')
  }
  async function enrolled(identity: CampusIdentity) {
    requireModerator(identity)
    const factor = await db.doc('moderatorFactors/' + identity.id).get()
    return !!factor.data()?.verified
  }
  async function enroll(identity: CampusIdentity) {
    requireFresh(identity)
    const now = clock(),
      secret = new Secret({ size: 20 }).base32,
      ref = db.doc('moderatorFactors/' + identity.id)
    await db.runTransaction(async (tx) => {
      const row = await tx.get(ref),
        data = row.data()
      if (data?.verified)
        throw new Error('An authenticator is already enrolled.')
      if (data?.lockedUntil > now)
        throw new Error('Too many attempts. Try again in 15 minutes.')
      if (data?.createdAt && now - data.createdAt < 60000)
        throw new Error('Wait a minute before starting setup again.')
      tx.set(ref, {
        secret: encrypt(secret, identity.id),
        verified: false,
        createdAt: now,
        pendingUntil: now + 900000,
        failures: data?.failures || 0,
        lockedUntil: data?.lockedUntil || 0,
        lastStep: -1,
      })
    })
    return {
      secret,
      qr: await QRCode.toDataURL(totp(secret, identity).toString(), {
        errorCorrectionLevel: 'M',
        margin: 2,
        width: 228,
      }),
    }
  }
  async function verify(identity: CampusIdentity, code: unknown) {
    requireFresh(identity)
    if (typeof code !== 'string' || !/^\d{6}$/.test(code))
      throw new Error('Enter the six-digit authenticator code.')
    const now = clock(),
      ref = db.doc('moderatorFactors/' + identity.id)
    const ok = await db.runTransaction(async (tx) => {
      const row = await tx.get(ref),
        data = row.data()
      if (!data || (!data.verified && data.pendingUntil < now))
        throw new Error('Start authenticator setup again.')
      if (data.lockedUntil > now)
        throw new Error('Too many attempts. Try again in 15 minutes.')
      const otp = totp(decrypt(data.secret, identity.id), identity),
        delta = otp.validate({ token: code, window: 1, timestamp: now }),
        step = Math.floor(now / 30000) + (delta || 0)
      if (delta === null || step <= data.lastStep) {
        const failures =
          (data.lockedUntil && data.lockedUntil <= now
            ? 0
            : data.failures || 0) + 1
        tx.update(ref, {
          failures,
          lockedUntil: failures >= 5 ? now + 900000 : 0,
        })
        return false
      }
      tx.update(ref, {
        verified: true,
        lastStep: step,
        failures: 0,
        lockedUntil: 0,
      })
      return true
    })
    if (!ok)
      throw new Error(
        'That code is invalid or already used. Try the next code.',
      )
    return { token: ticket(identity) }
  }
  return { enrolled, enroll, verify, authorize }
}

export function createModerationStore(db: Firestore) {
  return async (
    actor: CampusIdentity,
    body: { target: string; action: string; reason: string },
  ) => {
    if (
      !/^[A-Za-z0-9_-]{1,128}$/.test(body.target || '') ||
      !['kick', 'ban', 'unban', 'end-stage'].includes(body.action) ||
      typeof body.reason !== 'string' ||
      !body.reason.trim() ||
      body.reason.length > 240
    )
      throw new Error('Choose a valid account, action and reason.')
    if (actor.id === body.target)
      throw new Error('You cannot moderate your own account.')
    await db.runTransaction(async (tx) => {
      const actorRef = db.doc('campusMembers/' + actor.id),
        targetRef = db.doc('campusMembers/' + body.target),
        profileRef = db.doc('profiles/' + body.target)
      const [actorRow, targetRow, profileRow, policyRow] = await Promise.all([
        tx.get(actorRef),
        tx.get(targetRef),
        tx.get(profileRef),
        tx.get(db.doc(ownerPolicyPath)),
      ])
      const self = actorRow.data(),
        target = targetRow.data(),
        profile = profileRow.data() as CampusProfile | undefined
      if (
        actor.role !== 'admin' ||
        ownerPolicy(policyRow.data())?.ownerUid !== actor.id ||
        self?.status !== 'active' ||
        self.role !== 'admin' ||
        !target ||
        !['member', 'moderator', 'admin'].includes(target.role)
      )
        throw new Error('This action is outside your moderator permissions.')
      const now = new Date().toISOString()
      if (['ban', 'unban'].includes(body.action)) {
        tx.update(targetRef, {
          status: body.action === 'ban' ? 'banned' : 'active',
          updated_at: now,
        })
        if (profile?.handle) {
          const publicRef = db.doc('publicProfiles/' + profile.handle)
          if (body.action === 'ban') tx.delete(publicRef)
          else if (profile.is_public)
            tx.set(publicRef, {
              id: profile.id,
              display_name: profile.display_name,
              handle: profile.handle,
              bio: profile.bio,
              course: profile.course,
              interests: profile.interests,
              avatar_color: profile.avatar_color,
              is_public: true,
              created_at: profile.created_at,
            })
        }
      }
      tx.create(db.collection('moderationLog').doc(), {
        actor: actor.id,
        target: body.target,
        action: body.action,
        reason: body.reason.trim(),
        created_at: now,
      })
    })
  }
}
