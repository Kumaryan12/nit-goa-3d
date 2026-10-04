import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { attachFootballServer } from './server/footballServer.ts'
import { attachOatServer } from './server/oatServer.ts'
import { attachCampusServer } from './server/campusServer.ts'
import { createAccessVerifier } from './server/access.ts'
import { createAccessAPI } from './server/accessApi.ts'
import { createCrowdAPI } from './server/crowdApi.ts'
import { createProfileAPI } from './server/profileApi.ts'
export default defineConfig(({ mode }) => {
  // Server-only variables stay in Node; Vite exposes only VITE_* to the browser.
  for (const [name, value] of Object.entries(loadEnv(mode, process.cwd(), '')))
    if (process.env[name] === undefined) process.env[name] = value
  const verify = createAccessVerifier(),
    access = createAccessAPI(verify),
    profiles = createProfileAPI(verify)
  const attach = (
    server: import('vite').ViteDevServer | import('vite').PreviewServer,
  ) => {
    if (!server.httpServer) return
    const football = attachFootballServer(server.httpServer, undefined, verify),
      oat = attachOatServer(server.httpServer, undefined, verify),
      campus = attachCampusServer(server.httpServer, undefined, verify),
      crowd = createCrowdAPI(
        football.access,
        oat.access,
        oat.endStage,
        verify,
        () => profiles.changed(),
        undefined, campus,
      )
    server.middlewares.use((req, res, next) => {
      if (
        !access(req, res) &&
        !profiles.handle(req, res) &&
        !crowd(req, res) &&
        !oat.handleRequest(req, res)
      )
        next()
    })
  }
  return {
    base: '/',
    plugins: [
      react(),
      {
        name: 'campus-live',
        configureServer: attach,
        configurePreviewServer: attach,
      },
    ],
  }
})
