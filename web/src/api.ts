import type { LauncherConfig } from '../../src/shared/apps'

export const API = '/plugins/signalk-app-launcher/apps'
export const SELF = 'signalk-app-launcher'
export const LOGIN_URL = '/admin/#/login'

/** The fields of a webapp's package.json that /skServer/webapps returns. */
export interface InstalledWebapp {
  name: string
  description?: string
  keywords?: string[]
  signalk?: { displayName?: string; appIcon?: string }
}

export interface LoginStatus {
  status?: 'loggedIn' | 'notLoggedIn'
  authenticationRequired?: boolean
  readOnlyAccess?: boolean
  userLevel?: string
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message)
  }
}

async function errorFrom(res: Response, url: string): Promise<HttpError> {
  let detail = ''
  try {
    const body = (await res.json()) as { error?: unknown }
    if (typeof body.error === 'string') detail = body.error
  } catch {
    // not JSON
  }
  return new HttpError(res.status, detail || `${url}: HTTP ${res.status}`)
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: 'same-origin', cache: 'no-store' })
  if (!res.ok) throw await errorFrom(res, url)
  return (await res.json()) as T
}

export const loadConfig = (): Promise<LauncherConfig> => getJson<LauncherConfig>(API)

export async function saveConfig(config: LauncherConfig): Promise<LauncherConfig> {
  const res = await fetch(API, {
    method: 'PUT',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config)
  })
  if (!res.ok) throw await errorFrom(res, API)
  return (await res.json()) as LauncherConfig
}

/** Installed webapps; an empty list when the server does not let us read it. */
export async function loadWebapps(): Promise<InstalledWebapp[]> {
  try {
    const list = await getJson<unknown>('/skServer/webapps')
    return Array.isArray(list)
      ? (list as InstalledWebapp[]).filter((w) => typeof w?.name === 'string')
      : []
  } catch {
    return []
  }
}

export async function loadLoginStatus(): Promise<LoginStatus> {
  try {
    return await getJson<LoginStatus>('/skServer/loginStatus')
  } catch {
    return {}
  }
}

/** Admins may edit; with security off the server lets everyone. */
export function canEdit(status: LoginStatus): boolean {
  return status.authenticationRequired === false || status.userLevel === 'admin'
}

export function webappTitle(webapp: InstalledWebapp): string {
  return webapp.signalk?.displayName?.trim() || webapp.name.replace(/^@[^/]+\//, '')
}

/** URL of a webapp's icon, resolved against its served root like the admin UI. */
export function webappIconUrl(webapp: InstalledWebapp): string | undefined {
  const icon = webapp.signalk?.appIcon
  if (!icon) return undefined
  if (/^https?:\/\//.test(icon)) return icon
  return `/${webapp.name}/${icon.replace(/^\.?\//, '')}`
}
