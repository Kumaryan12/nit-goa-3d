export interface ExplorerURLState { location: string | null; from: string | null; to: string | null; night: boolean; photo: string | null }
export function parseURLState(url: string, validIds: Iterable<string>): ExplorerURLState {
  const params = new URL(url, 'https://campus.example').searchParams, ids = new Set(validIds)
  const valid = (key: string) => { const value = params.get(key); return value && ids.has(value) ? value : null }
  const photo = params.get('photo')
  return { location: valid('location'), from: valid('from'), to: valid('to'), night: params.get('mode') === 'night', photo: photo && /^[a-zA-Z0-9-]{1,80}$/.test(photo) ? photo : null }
}
export function serializeURLState(state: ExplorerURLState, url: string): string {
  const result = new URL(url, 'https://campus.example')
  for (const [key, value] of Object.entries({ location: state.location, from: state.from, to: state.to, mode: state.night ? 'night' : null, photo: state.photo })) {
    if (value) result.searchParams.set(key, value); else result.searchParams.delete(key)
  }
  return `${result.pathname}${result.search}${result.hash}`
}
