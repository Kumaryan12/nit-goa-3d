import {
  applicationDefault,
  cert,
  getApps,
  initializeApp,
} from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'
export function firebaseProject(env: NodeJS.ProcessEnv = process.env) {
  const project = env.FIREBASE_PROJECT_ID || env.VITE_FIREBASE_PROJECT_ID
  return project && /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(project)
    ? project
    : null
}
export function firebaseAdmin(env: NodeJS.ProcessEnv = process.env) {
  const projectId = firebaseProject(env)
  if (!projectId) throw new Error('Firebase is not connected yet.')
  if (
    env.NODE_ENV === 'production' &&
    (env.FIREBASE_AUTH_EMULATOR_HOST || env.FIRESTORE_EMULATOR_HOST)
  )
    throw new Error('Production cannot use Firebase emulators.')
  let app = getApps().find((app) => app.name === 'campus')
  if (!app) {
    let credential
    try {
      if (env.FIREBASE_SERVICE_ACCOUNT) {
        const account = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT)
        if (account.project_id !== projectId) throw new Error('Wrong project')
        credential = cert(account)
      } else credential = applicationDefault()
    } catch {
      throw new Error('Firebase server credentials are not valid.')
    }
    app = initializeApp(
      {
        projectId,
        credential,
        ...(env.FIREBASE_STORAGE_BUCKET
          ? { storageBucket: env.FIREBASE_STORAGE_BUCKET }
          : {}),
      },
      'campus',
    )
  }
  return {
    auth: getAuth(app),
    db: getFirestore(app),
    ...(env.FIREBASE_STORAGE_BUCKET
      ? { bucket: getStorage(app).bucket() }
      : {}),
    projectId,
  }
}
