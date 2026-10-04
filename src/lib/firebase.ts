import type { Auth } from 'firebase/auth'
export interface FirebasePublicConfig {
  apiKey: string
  authDomain: string
  projectId: string
  appId: string
}
export function validateFirebaseConfig(
  apiKey?: string,
  authDomain?: string,
  projectId?: string,
  appId?: string,
): FirebasePublicConfig | null {
  if (
    !apiKey ||
    !authDomain ||
    !projectId ||
    !appId ||
    !/^AIza[A-Za-z0-9_-]{20,}$/.test(apiKey) ||
    !/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(projectId)
  )
    return null
  if (
    !/^[a-z0-9.-]+$/.test(authDomain) ||
    authDomain.includes('..') ||
    !appId.startsWith('1:')
  )
    return null
  return { apiKey, authDomain, projectId, appId }
}
export const firebasePublicConfig = validateFirebaseConfig(
  import.meta.env?.VITE_FIREBASE_API_KEY,
  import.meta.env?.VITE_FIREBASE_AUTH_DOMAIN,
  import.meta.env?.VITE_FIREBASE_PROJECT_ID,
  import.meta.env?.VITE_FIREBASE_APP_ID,
)
let auth: Promise<Auth> | null = null
export function getFirebaseAuth(): Promise<Auth> {
  if (!firebasePublicConfig)
    return Promise.reject(new Error('Campus sign-in is not configured yet.'))
  auth ??= Promise.all([import('firebase/app'), import('firebase/auth')]).then(
    ([app, sdk]) =>
      sdk.getAuth(app.getApps()[0] || app.initializeApp(firebasePublicConfig)),
  )
  return auth
}
export async function firebaseToken(force = false) {
  const auth = await getFirebaseAuth()
  if (!auth.currentUser) throw new Error('Sign in again to continue.')
  return auth.currentUser.getIdToken(force)
}
export async function campusAPI(
  path: string,
  options: RequestInit = {},
  authenticated = true,
) {
  const headers = new Headers(options.headers)
  if (authenticated)
    headers.set('Authorization', `Bearer ${await firebaseToken()}`)
  const response = await fetch(path, {
    ...options,
    headers,
    signal: options.signal || AbortSignal.timeout(15000),
  })
  const data = await response.json()
  if (!response.ok)
    throw new Error(data.error || 'The campus request could not be completed.')
  return data
}
