// Shared between the plugin (validation before saving) and the webapp
// (rendering). Keep this file free of Node and DOM imports.

export type OpenTarget = 'same' | 'new'

interface AppBase {
  id: string
  name: string
  target: OpenTarget
  /** Absolute URL or a path on the Signal K server; optional. */
  iconUrl?: string
  /** CSS colour for the initials tile when there is no icon. */
  color?: string
}

/** A webapp installed on the Signal K server, served at /<packageName>/. */
export interface SignalKApp extends AppBase {
  kind: 'signalk'
  webapp: string
}

/**
 * Anything else reachable from the browser. `url` is one of:
 * - an absolute http(s) URL,
 * - a path on the Signal K server ("/grafana/"),
 * - a URL with the placeholder {host}, replaced by the host name the page was
 *   opened with ("http://{host}:3000/"), so the same entry works by name and
 *   by IP address.
 */
export interface ExternalApp extends AppBase {
  kind: 'external'
  url: string
}

export type LauncherApp = SignalKApp | ExternalApp

export interface LauncherConfig {
  version: 1
  apps: LauncherApp[]
}

export const EMPTY_CONFIG: LauncherConfig = { version: 1, apps: [] }

export const LIMITS = {
  apps: 100,
  id: 64,
  name: 60,
  url: 2048,
  color: 32
} as const

export class ValidationError extends Error {}

const ID_RE = /^[A-Za-z0-9_-]+$/
// npm package names, scoped or not.
const WEBAPP_RE = /^(@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*$/
// Hex, rgb()/hsl() or a CSS colour keyword; nothing that could escape a style.
const COLOR_RE = /^(#[0-9a-fA-F]{3,8}|(rgb|rgba|hsl|hsla)\([0-9.,%\s]+\)|[a-zA-Z]+)$/

function str(value: unknown, field: string, max: number, index: number): string {
  if (typeof value !== 'string') {
    throw new ValidationError(`apps[${index}].${field} must be a string`)
  }
  const trimmed = value.trim()
  if (trimmed.length === 0) {
    throw new ValidationError(`apps[${index}].${field} must not be empty`)
  }
  if (trimmed.length > max) {
    throw new ValidationError(`apps[${index}].${field} is longer than ${max} characters`)
  }
  return trimmed
}

function optStr(value: unknown, field: string, max: number, index: number): string | undefined {
  if (value === undefined || value === null || value === '') return undefined
  return str(value, field, max, index)
}

/** True for URLs the launcher may open: http(s), a server path, or {host}. */
export function isAllowedUrl(url: string): boolean {
  if (url.startsWith('//')) return false
  if (url.startsWith('/')) return true
  const probe = url.replaceAll('{host}', 'host.invalid')
  try {
    const parsed = new URL(probe)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

/** Checks untrusted input and returns a normalised config, or throws. */
export function validateConfig(input: unknown): LauncherConfig {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new ValidationError('config must be an object')
  }
  const apps = (input as { apps?: unknown }).apps
  if (!Array.isArray(apps)) {
    throw new ValidationError('apps must be an array')
  }
  if (apps.length > LIMITS.apps) {
    throw new ValidationError(`at most ${LIMITS.apps} apps are allowed`)
  }

  const seen = new Set<string>()
  const result: LauncherApp[] = apps.map((raw: unknown, i): LauncherApp => {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      throw new ValidationError(`apps[${i}] must be an object`)
    }
    const app = raw as Record<string, unknown>

    const id = str(app.id, 'id', LIMITS.id, i)
    if (!ID_RE.test(id)) {
      throw new ValidationError(`apps[${i}].id may only contain letters, digits, - and _`)
    }
    if (seen.has(id)) throw new ValidationError(`apps[${i}].id "${id}" is used twice`)
    seen.add(id)

    const name = str(app.name, 'name', LIMITS.name, i)
    const target: OpenTarget = app.target === 'new' ? 'new' : 'same'

    const iconUrl = optStr(app.iconUrl, 'iconUrl', LIMITS.url, i)
    if (iconUrl !== undefined && !isAllowedUrl(iconUrl)) {
      throw new ValidationError(`apps[${i}].iconUrl must be http(s) or a server path`)
    }
    const color = optStr(app.color, 'color', LIMITS.color, i)
    if (color !== undefined && !COLOR_RE.test(color)) {
      throw new ValidationError(`apps[${i}].color is not a CSS colour`)
    }
    const base = {
      id,
      name,
      target,
      ...(iconUrl !== undefined && { iconUrl }),
      ...(color !== undefined && { color })
    }

    if (app.kind === 'signalk') {
      const webapp = str(app.webapp, 'webapp', 214, i)
      if (!WEBAPP_RE.test(webapp)) {
        throw new ValidationError(`apps[${i}].webapp is not a package name`)
      }
      return { ...base, kind: 'signalk', webapp }
    }
    if (app.kind === 'external') {
      const url = str(app.url, 'url', LIMITS.url, i)
      if (!isAllowedUrl(url)) {
        throw new ValidationError(`apps[${i}].url must be http(s), a server path or use {host}`)
      }
      return { ...base, kind: 'external', url }
    }
    throw new ValidationError(`apps[${i}].kind must be "signalk" or "external"`)
  })

  return { version: 1, apps: result }
}

/** The URL to open for an app, given the location the launcher runs at. */
export function resolveAppUrl(app: LauncherApp, location: { hostname: string; origin: string }): string {
  if (app.kind === 'signalk') {
    return `${location.origin}/${app.webapp}/`
  }
  if (app.url.startsWith('/')) return `${location.origin}${app.url}`
  // An IPv6 literal needs brackets inside a URL.
  const host = location.hostname.includes(':') && !location.hostname.startsWith('[')
    ? `[${location.hostname}]`
    : location.hostname
  return app.url.replaceAll('{host}', host)
}

/** Up to two letters for the fallback tile, e.g. "Home Assistant" → "HA". */
export function initials(name: string): string {
  // Drop an npm scope and split on anything that is not a letter or digit.
  const words = name
    .trim()
    .replace(/^@[^/]+\//, '')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
  if (words.length === 0) return '?'
  if (words.length === 1) return Array.from(words[0]!).slice(0, 2).join('').toUpperCase()
  return (Array.from(words[0]!)[0]! + Array.from(words[1]!)[0]!).toUpperCase()
}
