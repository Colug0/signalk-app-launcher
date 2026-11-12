import './style.css'
import type { LauncherConfig } from '../../src/shared/apps'
import {
  canEdit,
  HttpError,
  loadConfig,
  loadLoginStatus,
  loadWebapps,
  LOGIN_URL,
  type InstalledWebapp
} from './api'
import { button, el } from './dom'
import { createEditor, type Editor } from './edit'
import { tile } from './tiles'

const root = document.getElementById('app')!
const EDIT_HASH = '#edit'

let config: LauncherConfig | undefined
let webapps: InstalledWebapp[] = []
let editable = false
let editor: Editor | undefined

function message(text: string, ...detail: Node[]): HTMLElement {
  return el('section', { className: 'message' }, el('p', { textContent: text }), ...detail.map((d) => el('p', { className: 'detail' }, d)))
}

function footer(): HTMLElement {
  if (editable) {
    return el(
      'footer',
      { className: 'foot' },
      button(
        'Edit',
        () => {
          // pushState fires no hashchange; the marker lets leaving go back.
          history.pushState({ fromTiles: true }, '', EDIT_HASH)
          route()
        },
        'btn quiet'
      )
    )
  }
  return el('footer', { className: 'foot' }, el('a', { className: 'btn quiet', href: LOGIN_URL, textContent: 'Log in to edit' }))
}

function showTiles(): void {
  editor = undefined
  if (!config) return
  const index = new Map(webapps.map((w) => [w.name, w]))
  const body =
    config.apps.length === 0
      ? message('No apps yet.', document.createTextNode(editable ? 'Tap Edit to add some.' : 'An administrator can add apps.'))
      : el('ul', { className: 'grid' }, ...config.apps.map((app) => tile(app, index)))
  root.replaceChildren(body, footer())
}

function showEditor(): void {
  if (!config) return
  if (!editable) {
    clearHash()
    showTiles()
    return
  }
  editor = createEditor({
    config,
    webapps,
    onSaved: (stored) => {
      config = stored
      editor = undefined
      leaveEdit()
    },
    onClose: () => {
      if (editor?.isDirty() && !confirm('Discard your changes?')) return
      editor = undefined
      leaveEdit()
    }
  })
  root.replaceChildren(editor.element)
}

// Dropping the hash with location.replace would reload the page.
function clearHash(): void {
  history.replaceState(null, '', location.pathname + location.search)
}

function leaveEdit(): void {
  // Going back keeps the history clean when we came from the tile view;
  // the hashchange that follows shows the tiles.
  if ((history.state as { fromTiles?: boolean } | null)?.fromTiles) {
    history.back()
  } else {
    clearHash()
    showTiles()
  }
}

function route(): void {
  if (location.hash === EDIT_HASH) {
    if (!editor) showEditor()
  } else if (editor?.isDirty() && !confirm('Discard your changes?')) {
    // Stay in the editor: the back step already happened, so add it again.
    history.pushState({ fromTiles: true }, '', EDIT_HASH)
  } else {
    showTiles()
  }
}

async function main(): Promise<void> {
  root.replaceChildren(message('Loading…'))
  const statusPromise = loadLoginStatus()
  const webappsPromise = loadWebapps()
  try {
    config = await loadConfig()
  } catch (error) {
    if (error instanceof HttpError && (error.status === 401 || error.status === 403)) {
      root.replaceChildren(
        message(
          'This server needs a login to show the app list.',
          el(
            'span',
            {},
            'Enable "Allow Readonly Access" in the Signal K security settings, or ',
            el('a', { href: LOGIN_URL, textContent: 'log in' }),
            '.'
          )
        )
      )
    } else {
      root.replaceChildren(message('Could not load the app list.', document.createTextNode(String(error))))
    }
    return
  }
  editable = canEdit(await statusPromise)
  webapps = await webappsPromise

  // popstate covers back/forward between entries made with pushState, which
  // fire no hashchange; hashchange covers a hash typed into the address bar.
  window.addEventListener('popstate', route)
  window.addEventListener('hashchange', route)
  route()
}

void main()
