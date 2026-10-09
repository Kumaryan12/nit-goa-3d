import { firebasePublicConfig, getFirebaseApp } from './firebase'
import { analyticsAllowed, analyticsPage, createAnalyticsTracker } from './analyticsPolicy'

const tracker = createAnalyticsTracker(async () => {
  if (!firebasePublicConfig || typeof window === 'undefined' ||
    !analyticsAllowed(import.meta.env.PROD, navigator)) return null
  const sdk = await import('firebase/analytics')
  if (!await sdk.isSupported()) return null
  sdk.setConsent({ analytics_storage: 'granted', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' })
  const analytics = sdk.initializeAnalytics(await getFirebaseApp(), {
    config: {
      send_page_view: false,
      page_location: window.location.origin + analyticsPage(window.location.pathname),
      page_referrer: '',
      page_title: 'NITG Explored',
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
    },
  })
  return {
    page(path) {
      const page = { page_location: window.location.origin + path, page_path: path, page_title: 'NITG Explored', page_referrer: '' }
      sdk.setDefaultEventParameters(page)
      sdk.logEvent(analytics, 'page_view', page)
    },
    event(name, params) {
      if (name === 'login') sdk.logEvent(analytics, 'login', { method: 'google' })
      else sdk.logEvent(analytics, name, params)
    },
  }
})
export const trackPageView = tracker.page
export const trackCampusEvent = tracker.event
