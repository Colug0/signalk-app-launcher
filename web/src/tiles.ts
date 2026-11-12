import { initials, resolveAppUrl, type LauncherApp } from '../../src/shared/apps'
import { webappIconUrl, type InstalledWebapp } from './api'
import { el } from './dom'

export type WebappIndex = Map<string, InstalledWebapp>

function iconFor(app: LauncherApp, webapps: WebappIndex): string | undefined {
  if (app.iconUrl) return app.iconUrl
  if (app.kind === 'signalk') {
    const webapp = webapps.get(app.webapp)
    return webapp ? webappIconUrl(webapp) : undefined
  }
  return undefined
}

/** Icon with the initials behind it; the initials stay if the icon fails. */
export function badge(app: LauncherApp, webapps: WebappIndex, className = 'badge'): HTMLElement {
  const fallback = el('span', { className: 'initials', textContent: initials(app.name) })
  if (app.color) fallback.style.background = app.color
  const node = el('span', { className }, fallback)
  node.setAttribute('aria-hidden', 'true')

  const src = iconFor(app, webapps)
  if (src) {
    const img = el('img', { src, alt: '', decoding: 'async' })
    img.addEventListener('error', () => img.remove(), { once: true })
    img.addEventListener('load', () => fallback.remove(), { once: true })
    node.append(img)
  }
  return node
}

export function tile(app: LauncherApp, webapps: WebappIndex): HTMLLIElement {
  const link = el(
    'a',
    { className: 'tile', href: resolveAppUrl(app, window.location) },
    badge(app, webapps),
    el('span', { className: 'name', textContent: app.name })
  )
  if (app.target === 'new') {
    link.target = '_blank'
    link.rel = 'noopener'
  }
  return el('li', {}, link)
}
