import { describe, expect, it } from 'vitest'
import {
  effectiveTitle,
  initials,
  isAllowedUrl,
  resolveAppUrl,
  validateConfig,
  ValidationError,
  windowName,
  type LauncherApp
} from '../src/shared/apps.js'

const sk = { id: 'fb', kind: 'signalk', name: 'Freeboard', webapp: '@signalk/freeboard-sk' }
const ext = { id: 'graf', kind: 'external', name: 'Grafana', url: 'http://{host}:3001/' }

describe('validateConfig', () => {
  it('accepts both kinds and keeps their order', () => {
    const config = validateConfig({ apps: [ext, sk] })
    expect(config.version).toBe(1)
    expect(config.apps.map((a) => a.id)).toEqual(['graf', 'fb'])
    expect(config.apps[0]).toMatchObject({ kind: 'external', target: 'same' })
  })

  it('trims strings and drops empty optional fields', () => {
    const config = validateConfig({ apps: [{ ...ext, name: '  Grafana ', iconUrl: '', color: '' }] })
    expect(config.apps[0]).toEqual({
      id: 'graf',
      kind: 'external',
      name: 'Grafana',
      target: 'same',
      url: 'http://{host}:3001/'
    })
  })

  it.each(['same', 'new', 'reuse'])('keeps target "%s"', (target) => {
    expect(validateConfig({ apps: [{ ...sk, target }] }).apps[0]!.target).toBe(target)
  })

  it('falls back to "same" for an unknown target', () => {
    expect(validateConfig({ apps: [{ ...sk, target: 'popup' }] }).apps[0]!.target).toBe('same')
  })

  it('keeps a trimmed title and drops an empty one', () => {
    expect(validateConfig({ title: '  Paikea ', apps: [] }).title).toBe('Paikea')
    expect(validateConfig({ title: '   ', apps: [] })).toEqual({ version: 1, apps: [] })
    expect(validateConfig({ apps: [] })).toEqual({ version: 1, apps: [] })
  })

  it.each([
    ['not an object', null],
    ['apps missing', {}],
    ['apps not an array', { apps: {} }],
    ['unknown kind', { apps: [{ ...sk, kind: 'other' }] }],
    ['duplicate id', { apps: [sk, { ...ext, id: 'fb' }] }],
    ['bad id', { apps: [{ ...sk, id: 'a b' }] }],
    ['empty name', { apps: [{ ...sk, name: '  ' }] }],
    ['bad package name', { apps: [{ ...sk, webapp: '../etc' }] }],
    ['javascript url', { apps: [{ ...ext, url: 'javascript:alert(1)' }] }],
    ['protocol-relative url', { apps: [{ ...ext, url: '//evil.example/' }] }],
    ['bad icon url', { apps: [{ ...ext, iconUrl: 'data:image/png;base64,AAAA' }] }],
    ['style injection in color', { apps: [{ ...ext, color: 'red;background:url(x)' }] }],
    ['title not a string', { title: 5, apps: [] }],
    ['title too long', { title: 'x'.repeat(41), apps: [] }],
    ['too many apps', { apps: Array.from({ length: 101 }, (_, i) => ({ ...sk, id: `a${i}` })) }]
  ])('rejects %s', (_label, input) => {
    expect(() => validateConfig(input)).toThrow(ValidationError)
  })
})

describe('isAllowedUrl', () => {
  it.each(['https://example.org/', 'http://{host}:3000/x', '/grafana/', 'http://192.0.2.1:8080'])(
    'allows %s',
    (url) => expect(isAllowedUrl(url)).toBe(true)
  )
  it.each(['ftp://x', 'javascript:void(0)', '//x', 'grafana', ''])('refuses %s', (url) =>
    expect(isAllowedUrl(url)).toBe(false)
  )
})

describe('resolveAppUrl', () => {
  const loc = { hostname: 'boat.local', origin: 'https://boat.local:3443' }

  it('maps a Signal K webapp to its mount point', () => {
    expect(resolveAppUrl(sk as LauncherApp, loc)).toBe('https://boat.local:3443/@signalk/freeboard-sk/')
  })

  it('replaces {host} with the current host name', () => {
    expect(resolveAppUrl(ext as LauncherApp, loc)).toBe('http://boat.local:3001/')
    expect(resolveAppUrl(ext as LauncherApp, { hostname: '192.0.2.7', origin: 'http://192.0.2.7:3000' })).toBe(
      'http://192.0.2.7:3001/'
    )
  })

  it('brackets an IPv6 host', () => {
    expect(resolveAppUrl(ext as LauncherApp, { hostname: '[::1]', origin: 'http://[::1]:3000' })).toBe(
      'http://[::1]:3001/'
    )
    expect(resolveAppUrl(ext as LauncherApp, { hostname: '::1', origin: 'http://[::1]:3000' })).toBe(
      'http://[::1]:3001/'
    )
  })

  it('puts a server path on the current origin', () => {
    const app = { ...ext, url: '/grafana/' } as LauncherApp
    expect(resolveAppUrl(app, loc)).toBe('https://boat.local:3443/grafana/')
  })

  it('leaves an absolute URL alone', () => {
    const app = { ...ext, url: 'https://example.org/' } as LauncherApp
    expect(resolveAppUrl(app, loc)).toBe('https://example.org/')
  })
})

describe('initials', () => {
  it.each([
    ['Home Assistant', 'HA'],
    ['grafana', 'GR'],
    ['  Freeboard  SK ', 'FS'],
    ['Freeboard-SK', 'FS'],
    ['@signalk/instrumentpanel', 'IN'],
    ['', '?']
  ])('%s → %s', (name, expected) => expect(initials(name)).toBe(expected))
})

describe('effectiveTitle', () => {
  it('prefers the title, then the vessel name, then "Apps"', () => {
    expect(effectiveTitle({ title: 'Bord' }, 'Paikea')).toBe('Bord')
    expect(effectiveTitle({}, 'Paikea')).toBe('Paikea')
    expect(effectiveTitle({ title: ' ' }, ' ')).toBe('Apps')
    expect(effectiveTitle({}, undefined)).toBe('Apps')
  })
})

describe('windowName', () => {
  it('is stable per app id', () => {
    expect(windowName({ id: 'fb' })).toBe('signalk-app-fb')
  })
})
