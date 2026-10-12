import { campusUpdates } from '../data/campusUpdate.ts'

export const campusUpdateStorageKey = 'nit-goa:acknowledged-campus-update'
export function unreadCampusUpdates(storage?: Pick<Storage, 'getItem'>) {
  try {
    const value: unknown = JSON.parse((storage ?? localStorage).getItem(campusUpdateStorageKey) || 'null')
    const seen = new Set(Array.isArray(value) ? value.filter(id => typeof id === 'string') : [])
    return campusUpdates.filter(update => !seen.has(update.id))
  } catch { return [...campusUpdates] }
}
export function campusUpdateUnread() {
  return unreadCampusUpdates().length > 0
}
export function acknowledgeCampusUpdate(storage?: Pick<Storage, 'setItem'>) {
  try { (storage ?? localStorage).setItem(campusUpdateStorageKey, JSON.stringify(campusUpdates.map(update => update.id))) }
  catch { /* Reading and dismissing updates still work without browser storage. */ }
}
