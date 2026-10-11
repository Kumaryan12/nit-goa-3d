import { writeFile, readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { backendOrigin } from '../src/lib/serverURL.ts'

const root = process.env.PAGES_OUTPUT_DIRECTORY || 'dist'
const backend = backendOrigin('https://nitg-explored.pages.dev', process.env.VITE_CAMPUS_SERVER_URL)
if (!process.env.VITE_CAMPUS_SERVER_URL) throw Error('Pages requires VITE_CAMPUS_SERVER_URL to connect to the live server.')
const authDomain = process.env.VITE_FIREBASE_AUTH_DOMAIN
if (!authDomain || !/^[a-z0-9.-]+$/.test(authDomain)) throw Error('Pages requires a valid Firebase auth domain.')
async function checkFiles(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) await checkFiles(path)
    else if (entry.isFile() && (await stat(path)).size > 25 * 1024 * 1024) throw Error(`Asset exceeds Pages' 25 MiB limit: ${path}`)
  }
}
await checkFiles(root)
const socket = backend.replace(/^https:/, 'wss:')
const csp = `default-src 'self'; script-src 'self' https://apis.google.com https://www.googletagmanager.com; worker-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://www.google-analytics.com https://region1.google-analytics.com; connect-src 'self' ${backend} ${socket} https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://firebase.googleapis.com https://firebaseinstallations.googleapis.com https://www.googletagmanager.com https://www.google-analytics.com https://region1.google-analytics.com https://${authDomain} https://overpass-api.de https://overpass.kumi.systems; media-src 'self' blob: https:; frame-src https://${authDomain} https://accounts.google.com; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'`
await writeFile(join(root, '_headers'), `/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
  X-Frame-Options: DENY
  Strict-Transport-Security: max-age=31536000
  Permissions-Policy: camera=(), microphone=(self), geolocation=(self)
  Content-Security-Policy: ${csp}
/assets/*
  Cache-Control: public, max-age=31536000, immutable
`)
const routes = ['/campus', '/student', '/admin', '/admin/campus', '/admin/crowd', '/me', '/manage', '/people', '/updates', '/people/*']
await writeFile(join(root, '_redirects'), routes.map(path => `${path} /index.html 200`).join('\n') + '\n')
// Disable Pages' catch-all SPA fallback for missing files and protected paths.
await writeFile(join(root, '404.html'), '<!doctype html><html lang="en"><meta charset="utf-8"><title>Page not found · NITG Explored</title><body><h1>Page not found</h1><a href="/">Return to campus</a></body></html>')
console.log('Pages frontend prepared; live server:', backend)
