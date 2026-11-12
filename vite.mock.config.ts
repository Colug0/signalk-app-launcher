// Dev server with a fake Signal K server behind the webapp, for trying the UI
// without a real server: npx vite --config vite.mock.config.ts
// The cookie mock-level=admin|readonly|denied picks what the fake server
// allows (default admin), e.g. document.cookie = 'mock-level=readonly'.
import type { IncomingMessage, ServerResponse } from 'node:http'
import { defineConfig, mergeConfig, type Plugin } from 'vite'
import base from './vite.config'
import { validateConfig, ValidationError, type LauncherConfig } from './src/shared/apps'

const levelOf = (req: IncomingMessage): string =>
  /(?:^|;\s*)mock-level=([a-z]+)/.exec(req.headers.cookie ?? '')?.[1] ?? 'admin'

const webapps = [
  { name: '@signalk/freeboard-sk', description: 'Chart plotter', signalk: { displayName: 'Freeboard-SK', appIcon: 'http://127.0.0.1:5175/signalk-app-launcher/icon.svg' } },
  { name: 'broken-icon-app', description: 'Icon that fails to load', signalk: { displayName: 'Broken Icon', appIcon: './missing.png' } },
  { name: '@mxtommy/kip', description: 'Instrument panel', signalk: { displayName: 'KIP' } },
  { name: '@signalk/instrumentpanel', description: 'Instrument panel (classic)' },
  { name: 'signalk-anchoralarm-plugin', description: 'Anchor alarm', signalk: { displayName: 'Anchor Alarm' } },
  { name: 'signalk-app-launcher', description: 'This launcher' }
]

let config: LauncherConfig = {
  version: 1,
  apps: [
    { id: 'fb', kind: 'signalk', name: 'Freeboard-SK', webapp: '@signalk/freeboard-sk', target: 'same' },
    { id: 'graf', kind: 'external', name: 'Grafana', url: 'http://{host}:3001/', target: 'new' },
    { id: 'ha', kind: 'external', name: 'Home Assistant', url: 'http://{host}:8123/', target: 'same', color: '#18bcf2' },
    { id: 'kip', kind: 'signalk', name: 'KIP', webapp: '@mxtommy/kip', target: 'same' }
  ]
}

function send(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk as Buffer)
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

const fakeServer: Plugin = {
  name: 'fake-signalk',
  configureServer(server) {
    server.middlewares.use(async (req, res, next) => {
      const level = levelOf(req)
      const url = req.url ?? ''
      if (url.startsWith('/skServer/loginStatus')) {
        return send(res, 200, {
          status: level === 'admin' ? 'loggedIn' : 'notLoggedIn',
          authenticationRequired: true,
          readOnlyAccess: level !== 'denied',
          ...(level === 'admin' && { userLevel: 'admin' })
        })
      }
      if (url.startsWith('/skServer/webapps')) {
        return level === 'denied' ? send(res, 401, {}) : send(res, 200, webapps)
      }
      if (url.startsWith('/plugins/signalk-app-launcher/apps')) {
        if (req.method === 'GET') {
          return level === 'denied' ? send(res, 401, {}) : send(res, 200, config)
        }
        if (req.method === 'PUT') {
          if (level !== 'admin') return send(res, 401, {})
          try {
            config = validateConfig(await readBody(req))
            return send(res, 200, config)
          } catch (error) {
            const message = error instanceof ValidationError || error instanceof SyntaxError ? error.message : 'error'
            return send(res, 400, { error: message })
          }
        }
      }
      next()
    })
  }
}

export default mergeConfig(base, defineConfig({ plugins: [fakeServer], server: { host: '127.0.0.1', port: 5175 } }))
