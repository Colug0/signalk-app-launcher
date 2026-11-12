import type { Plugin, PluginRouter, ServerAPI } from '@signalk/server-api'
import type { Request, RequestHandler, Response } from 'express'
import { buildManifest, vesselName } from './manifest.js'
import { effectiveTitle, ValidationError } from './shared/apps.js'
import { ConfigStore } from './store.js'

export const PLUGIN_ID = 'signalk-app-launcher'

// The typings promise access(), but servers before 2.35 hand over a plain
// Express router without it.
function hasAccess(router: PluginRouter): boolean {
  return typeof (router as { access?: unknown }).access === 'function'
}

export default function (app: ServerAPI): Plugin {
  let store: ConfigStore | undefined

  const getStore = (): ConfigStore => {
    store ??= new ConfigStore(app.getDataDirPath())
    return store
  }

  const readApps = async (_req: Request, res: Response): Promise<void> => {
    try {
      res.set('Cache-Control', 'no-store')
      res.json(await getStore().load())
    } catch (error) {
      app.error(`Could not read the app list: ${String(error)}`)
      res.status(500).json({ error: 'Could not read the app list' })
    }
  }

  const readManifest = async (_req: Request, res: Response): Promise<void> => {
    let config: { title?: string } = {}
    try {
      config = await getStore().load()
    } catch (error) {
      // A broken list must not break installing the page; use the defaults.
      app.error(`Could not read the app list for the manifest: ${String(error)}`)
    }
    const title = effectiveTitle(config, vesselName(app.getSelfPath('name')))
    res.set('Cache-Control', 'no-cache')
    res.type('application/manifest+json').send(JSON.stringify(buildManifest(title)))
  }

  const writeApps = async (req: Request, res: Response): Promise<void> => {
    try {
      res.json(await getStore().save(req.body))
    } catch (error) {
      if (error instanceof ValidationError || error instanceof SyntaxError) {
        res.status(400).json({ error: error.message })
        return
      }
      app.error(`Could not save the app list: ${String(error)}`)
      res.status(500).json({ error: 'Could not save the app list' })
    }
  }

  const plugin: Plugin = {
    id: PLUGIN_ID,
    name: 'App Launcher',
    description: 'Start page for Signal K webapps and other apps on the boat server',

    start() {
      app.setPluginStatus('Ready')
    },

    stop() {},

    // Nothing to set in the admin form: the app list is edited in the webapp.
    schema: () => ({ type: 'object', properties: {} }),

    registerWithRouter(router) {
      // Reading is open to read-only users (and to anonymous visitors when the
      // server allows read-only access), so the start page works on a phone
      // without logging in. Servers before 2.35 have no access(); there these
      // routes stay admin-only.
      const read = (path: string, handler: RequestHandler): void => {
        if (hasAccess(router)) router.access('readonly').get(path, handler)
        else router.get(path, handler)
      }
      read('/apps', readApps)
      read('/manifest.webmanifest', readManifest)
      // Saving stays admin-only: routes registered directly are admin-gated.
      router.put('/apps', writeApps)
    }
  }

  return plugin
}
