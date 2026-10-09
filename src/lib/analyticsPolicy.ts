// Only aggregate campus activity belongs in Analytics. Never accept arbitrary
// payloads, account IDs, names, chat, profile handles or coordinates here.
export type CampusAnalyticsEvent = 'login' | 'campus_enter' | 'exploration_mode' | 'select_building' | 'join_activity'
export interface CampusAnalyticsParams {
  method?: 'google'
  mode?: 'walk' | 'overview'
  category?: string
  activity?: 'football' | 'concert'
}
export function analyticsPage(path: string) {
  const clean = path.split(/[?#]/)[0]
  if (clean.startsWith('/people/')) return '/people/profile'
  return ['/', '/student', '/admin', '/admin/campus', '/admin/crowd', '/manage', '/campus', '/me', '/people'].includes(clean) ? clean : '/other'
}
export function analyticsParams(event: CampusAnalyticsEvent, params: CampusAnalyticsParams = {}): Record<string, string> {
  if (event === 'login') return { method: 'google' }
  if (event === 'exploration_mode' && ['walk', 'overview'].includes(params.mode || '')) return { mode: params.mode! }
  if (event === 'select_building' && ['academic', 'administration', 'hostel', 'food', 'sports', 'entrance', 'amenity', 'other'].includes(params.category || '')) return { category: params.category! }
  if (event === 'join_activity' && ['football', 'concert'].includes(params.activity || '')) return { activity: params.activity! }
  return {}
}
export function analyticsAllowed(production: boolean, privacy: { doNotTrack?: string | null; globalPrivacyControl?: boolean }) {
  return production && privacy.doNotTrack !== '1' && privacy.doNotTrack !== 'yes' && privacy.globalPrivacyControl !== true
}
export interface AnalyticsSink {
  page(path: string): void
  event(name: CampusAnalyticsEvent, params: Record<string, string>): void
}
export function createAnalyticsTracker(load: () => Promise<AnalyticsSink | null>) {
  let sink: Promise<AnalyticsSink | null> | undefined, previousPage: string | undefined
  const send = (action: (target: AnalyticsSink) => void) => {
    // SDK imports, unsupported storage, blocked requests and collection must
    // never reject into the application or delay navigation/multiplayer.
    sink ??= Promise.resolve().then(load).catch(() => null)
    void sink.then(target => { if (target) action(target) }).catch(() => {})
  }
  return {
    page(path: string) {
      const safe = analyticsPage(path)
      if (safe === previousPage) return
      previousPage = safe
      send(target => target.page(safe))
    },
    event(name: CampusAnalyticsEvent, params?: CampusAnalyticsParams) {
      send(target => target.event(name, analyticsParams(name, params)))
    },
  }
}
