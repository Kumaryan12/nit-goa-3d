// Transaction-shaped store for deterministic authorization tests. Real rules are
// also verified against the new Firebase project before launch.
export function fakeFirestore(initial = {}) {
  const data = new Map(
    Object.entries(initial).map(([k, v]) => [k, structuredClone(v)]),
  )
  let serial = 0
  const doc = (path) => ({ path, get: async () => snapshot(path) })
  const snapshot = (path) => ({
    exists: data.has(path),
    data: () => structuredClone(data.get(path)),
  })
  const db = {
    doc,
    collection: (path) => ({
      doc: (id) => doc(path + '/' + (id || 'audit' + ++serial)),
    }),
    runTransaction: async (callback) => {
      const writes = []
      const tx = {
        get: async (ref) => snapshot(ref.path),
        create: (ref, v) => {
          if (data.has(ref.path)) throw new Error('Already exists')
          writes.push(() => data.set(ref.path, structuredClone(v)))
        },
        set: (ref, v) =>
          writes.push(() => data.set(ref.path, structuredClone(v))),
        update: (ref, v) =>
          writes.push(() =>
            data.set(ref.path, {
              ...data.get(ref.path),
              ...structuredClone(v),
            }),
          ),
        delete: (ref) => writes.push(() => data.delete(ref.path)),
      }
      const value = await callback(tx)
      writes.forEach((fn) => fn())
      return value
    },
  }
  return { db, data }
}
