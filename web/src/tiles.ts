import { initials, resolveAppUrl, windowName, type LauncherApp } from '../../src/shared/apps'
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
  } else if (app.target === 'reuse') {
    // Without JS the named target still opens one tab per app, but reloads it.
    link.target = windowName(app)
    link.addEventListener('click', (event) => {
      // Ctrl/Cmd/Shift/Alt-clicks and other buttons keep the browser's own meaning.
      if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return
      if (openOrReturn(link.href, windowName(app))) event.preventDefault()
    })
  }
  return el('li', {}, link)
}

// Tabs this page opened. After we cut the opener link, the browser no longer
// finds a tab on another origin by its name, but our own handle still works.
const opened = new Map<string, Window>()

/**
 * Brings back the app's tab if it is still open, otherwise opens it there.
 * First our own handle; else window.open with an empty URL, which finds a tab
 * by name without navigating it (this covers a reloaded launcher and apps on
 * the launcher's origin). A new tab starts as about:blank, which we can read;
 * an open app on another origin throws on access, which also means "open".
 * Returns false when the browser blocked the window, so the link can fall back.
 */
function openOrReturn(url: string, name: string): boolean {
  const known = opened.get(name)
  if (known && !known.closed) {
    known.focus()
    return true
  }
  const win = window.open('', name)
  if (!win) return false
  opened.set(name, win)
  let fresh = false
  try {
    fresh = win.location.href === 'about:blank'
  } catch {
    fresh = false
  }
  if (fresh) {
    // The page in that tab must not be able to navigate the launcher.
    win.opener = null
    win.location.href = url
  }
  win.focus()
  return true
}
