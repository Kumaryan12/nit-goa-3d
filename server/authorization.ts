// Private Firestore configuration, readable only through trusted server access.
// Neither custom token claims nor an editable membership role appoint an owner.
export const ownerPolicyPath = 'campusSettings/access'
export function ownerPolicy(value: unknown): { ownerUid: string; ownerEmail: string } | null {
  if (!value || typeof value !== 'object') return null
  const { ownerUid, ownerEmail } = value as Record<string, unknown>
  if (
    typeof ownerUid !== 'string' ||
    !/^[A-Za-z0-9_-]{1,128}$/.test(ownerUid) ||
    typeof ownerEmail !== 'string' ||
    !/^[^\s@]+@[^\s@]+$/.test(ownerEmail) ||
    ownerEmail !== ownerEmail.trim().toLowerCase()
  ) return null
  return { ownerUid, ownerEmail }
}
export function campusRole(policy: unknown, uid: string, verifiedEmail: string): 'admin' | 'member' {
  const owner = ownerPolicy(policy)
  return owner?.ownerUid === uid && owner.ownerEmail === verifiedEmail.toLowerCase()
    ? 'admin'
    : 'member'
}
