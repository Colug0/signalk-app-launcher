import type { Plugin, PluginRouter, ServerAPI } from '@signalk/server-api'
import type { Request, Response } from 'express'
import { ValidationError } from './shared/apps.js'
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
      // without logging in. Servers before 2.35 have no access(); there the
      // list stays admin-only.
      if (hasAccess(router)) {
        router.access('readonly').get('/apps', readApps)
      } else {
        router.get('/apps', readApps)
      }
      // Saving stays admin-only: routes registered directly are admin-gated.
      router.put('/apps', writeApps)
    }
  }

  return plugin
}
