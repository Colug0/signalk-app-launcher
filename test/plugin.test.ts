import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ServerAPI } from '@signalk/server-api'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import createPlugin, { PLUGIN_ID } from '../src/index.js'

type Handler = (req: unknown, res: unknown) => Promise<void>

let dir: string
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'launcher-plugin-'))
})
afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

function fakeApp(name?: unknown) {
  return {
    getDataDirPath: () => dir,
    getSelfPath: (path: string) => (path === 'name' ? name : undefined),
    setPluginStatus: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  } as unknown as ServerAPI
}

function fakeRes() {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    headers: {} as Record<string, string>,
    contentType: '',
    sent: '',
    status(code: number) {
      res.statusCode = code
      return res
    },
    json(body: unknown) {
      res.body = body
      return res
    },
    type(value: string) {
      res.contentType = value
      return res
    },
    send(body: string) {
      res.sent = body
      return res
    },
    set(name: string, value: string) {
      res.headers[name] = value
      return res
    }
  }
  return res
}

/** Records routes, split by whether they went through access(). */
function fakeRouter(withAccess: boolean) {
  const routes: { method: string; path: string; access: string; handler: Handler }[] = []
  const add = (access: string) => (method: string) => (path: string, handler: Handler) => {
    routes.push({ method, path, access, handler })
  }
  const admin = add('admin')
  const router: Record<string, unknown> = {
    get: admin('GET'),
    put: admin('PUT'),
    post: admin('POST'),
    delete: admin('DELETE')
  }
  if (withAccess) {
    router.access = (level: string) => ({ get: add(level)('GET'), put: add(level)('PUT') })
  }
  return { router, routes }
}

describe('plugin', () => {
  it('has the id the webapp calls', () => {
    expect(createPlugin(fakeApp()).id).toBe(PLUGIN_ID)
  })

  it('opens GET /apps to read-only users and keeps PUT admin-only', () => {
    const { router, routes } = fakeRouter(true)
    createPlugin(fakeApp()).registerWithRouter!(router as never)
    expect(routes.map(({ method, path, access }) => ({ method, path, access }))).toEqual([
      { method: 'GET', path: '/apps', access: 'readonly' },
      { method: 'GET', path: '/manifest.webmanifest', access: 'readonly' },
      { method: 'PUT', path: '/apps', access: 'admin' }
    ])
  })

  it('falls back to admin-only reading on servers without access()', () => {
    const { router, routes } = fakeRouter(false)
    createPlugin(fakeApp()).registerWithRouter!(router as never)
    expect(routes.every((r) => r.access === 'admin')).toBe(true)
  })

  it('saves through PUT and serves it through GET', async () => {
    const { router, routes } = fakeRouter(true)
    createPlugin(fakeApp()).registerWithRouter!(router as never)
    const get = routes.find((r) => r.method === 'GET')!.handler
    const put = routes.find((r) => r.method === 'PUT')!.handler

    const body = { apps: [{ id: 'fb', kind: 'signalk', name: 'Freeboard', webapp: '@signalk/freeboard-sk' }] }
    const putRes = fakeRes()
    await put({ body }, putRes)
    expect(putRes.statusCode).toBe(200)

    const getRes = fakeRes()
    await get({}, getRes)
    expect(getRes.statusCode).toBe(200)
    expect(getRes.headers['Cache-Control']).toBe('no-store')
    expect(getRes.body).toMatchObject({ version: 1, apps: [{ id: 'fb', target: 'same' }] })
  })

  it('answers 400 to invalid input', async () => {
    const { router, routes } = fakeRouter(true)
    createPlugin(fakeApp()).registerWithRouter!(router as never)
    const put = routes.find((r) => r.method === 'PUT')!.handler
    const res = fakeRes()
    await put({ body: { apps: 'nope' } }, res)
    expect(res.statusCode).toBe(400)
    expect(res.body).toEqual({ error: 'apps must be an array' })
  })

  it('names the manifest after the vessel, then after the saved title', async () => {
    const { router, routes } = fakeRouter(true)
    createPlugin(fakeApp('Paikea')).registerWithRouter!(router as never)
    const manifest = routes.find((r) => r.path === '/manifest.webmanifest')!.handler
    const put = routes.find((r) => r.method === 'PUT')!.handler

    const first = fakeRes()
    await manifest({}, first)
    expect(first.contentType).toBe('application/manifest+json')
    expect(JSON.parse(first.sent)).toMatchObject({ name: 'Paikea', short_name: 'Paikea' })

    await put({ body: { title: 'Bord', apps: [] } }, fakeRes())
    const second = fakeRes()
    await manifest({}, second)
    expect(JSON.parse(second.sent).name).toBe('Bord')
  })

  it('falls back to "Apps" without a vessel name', async () => {
    const { router, routes } = fakeRouter(true)
    createPlugin(fakeApp(undefined)).registerWithRouter!(router as never)
    const res = fakeRes()
    await routes.find((r) => r.path === '/manifest.webmanifest')!.handler({}, res)
    expect(JSON.parse(res.sent).name).toBe('Apps')
  })
})
