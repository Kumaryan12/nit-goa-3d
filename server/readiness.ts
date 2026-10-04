import { firebaseAdmin, firebaseProject } from './firebaseAdmin.ts'
export function createReadiness() {
  let checked = 0,
    ready = false,
    pending: Promise<boolean> | null = null
  return async () => {
    if (!firebaseProject()) return false
    if (Date.now() - checked < 30000) return ready
    pending ??= Promise.resolve()
      .then(() =>
        Promise.race([
          firebaseAdmin()
            .db.doc('_health/ready')
            .get()
            .then(() => true),
          new Promise<boolean>((resolve) => {
            const timer = setTimeout(() => resolve(false), 5000)
            timer.unref()
          }),
        ]),
      )
      .catch(() => false)
      .then((value) => {
        ready = value
        checked = Date.now()
        pending = null
        return value
      })
    return pending
  }
}
