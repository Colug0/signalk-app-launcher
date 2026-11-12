import {
  DEFAULT_TITLE,
  LIMITS,
  validateConfig,
  ValidationError,
  type LauncherApp,
  type LauncherConfig
} from '../../src/shared/apps'
import { move, removeAt, sameApps, suggestions, upsert } from '../../src/shared/edit'
import { HttpError, LOGIN_URL, saveConfig, SELF, webappTitle, type InstalledWebapp } from './api'
import { button, el, newId } from './dom'
import { badge, type WebappIndex } from './tiles'

export interface EditorContext {
  config: LauncherConfig
  webapps: InstalledWebapp[]
  /** Shown as the default when no title is set. */
  vesselName: string | undefined
  /** Called after a successful save with what the server stored. */
  onSaved: (config: LauncherConfig) => void
  onClose: () => void
}

export interface Editor {
  element: HTMLElement
  isDirty: () => boolean
}

function describeError(error: unknown): Node {
  if (error instanceof HttpError && (error.status === 401 || error.status === 403)) {
    return el(
      'span',
      {},
      'Only an administrator can change the list. ',
      el('a', { href: LOGIN_URL, textContent: 'Log in' })
    )
  }
  return document.createTextNode(error instanceof Error ? error.message : String(error))
}

function subtitle(app: LauncherApp): string {
  return app.kind === 'signalk' ? `Signal K · ${app.webapp}` : app.url
}

/** Opens a modal dialog and removes it from the page when it closes. */
function openDialog(title: string, ...content: Node[]): HTMLDialogElement {
  const dialog = el('dialog', { className: 'sheet' }, el('h2', { textContent: title }), ...content)
  dialog.addEventListener('close', () => dialog.remove())
  // A tap on the backdrop closes the dialog.
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close()
  })
  document.body.append(dialog)
  dialog.showModal()
  return dialog
}

export function createEditor(ctx: EditorContext): Editor {
  const saved = ctx.config.apps
  const savedTitle = ctx.config.title ?? ''
  let apps: LauncherApp[] = [...saved]
  let busy = false
  const index: WebappIndex = new Map(ctx.webapps.map((w) => [w.name, w]))

  const status = el('p', { className: 'status', role: 'status' })
  const titleInput = el('input', {
    className: 'field',
    value: savedTitle,
    maxLength: LIMITS.title,
    placeholder: ctx.vesselName ?? DEFAULT_TITLE
  })
  titleInput.addEventListener('input', () => render())
  const isDirty = (): boolean => !sameApps(apps, saved) || titleInput.value.trim() !== savedTitle
  const list = el('ol', { className: 'edit-list' })
  const saveButton = button('Save', () => void save(), 'btn primary')
  const element = el(
    'section',
    { className: 'editor' },
    el(
      'header',
      { className: 'bar' },
      button('Cancel', () => ctx.onClose(), 'btn'),
      el('h1', { textContent: 'Edit apps' }),
      saveButton
    ),
    status,
    el(
      'label',
      { className: 'form-row title-row' },
      el('span', { textContent: 'Name' }),
      titleInput,
      el('small', {
        textContent: ctx.vesselName
          ? `Page title and home screen name. Empty uses the vessel name "${ctx.vesselName}".`
          : `Page title and home screen name. Empty uses the vessel name, or "${DEFAULT_TITLE}" when there is none.`
      })
    ),
    list,
    el(
      'div',
      { className: 'add' },
      button('+ Signal K app', () => pickWebapp(), 'btn'),
      button('+ Other app', () => editApp(undefined), 'btn')
    )
  )

  const setStatus = (content: Node | string, error = false): void => {
    status.replaceChildren(content)
    status.classList.toggle('error', error)
  }

  function render(): void {
    saveButton.disabled = busy || !isDirty()
    if (apps.length === 0) {
      list.replaceChildren(el('li', { className: 'empty', textContent: 'No apps on the list.' }))
      return
    }
    list.replaceChildren(
      ...apps.map((app, i) =>
        el(
          'li',
          { className: 'row' },
          badge(app, index, 'badge small'),
          el(
            'span',
            { className: 'label' },
            el('span', { className: 'title', textContent: app.name }),
            el('span', { className: 'sub', textContent: subtitle(app) })
          ),
          el(
            'span',
            { className: 'controls' },
            withDisabled(button('↑', () => update(move(apps, i, -1)), 'icon-btn', `Move ${app.name} up`), i === 0),
            withDisabled(
              button('↓', () => update(move(apps, i, 1)), 'icon-btn', `Move ${app.name} down`),
              i === apps.length - 1
            ),
            button('✎', () => editApp(app), 'icon-btn', `Edit ${app.name}`),
            button('✕', () => update(removeAt(apps, i)), 'icon-btn danger', `Remove ${app.name}`)
          )
        )
      )
    )
  }

  function withDisabled(b: HTMLButtonElement, disabled: boolean): HTMLButtonElement {
    b.disabled = disabled
    return b
  }

  function update(next: LauncherApp[]): void {
    apps = next
    setStatus('')
    render()
  }

  async function save(): Promise<void> {
    busy = true
    render()
    setStatus('Saving…')
    try {
      const stored = await saveConfig({ version: 1, title: titleInput.value.trim(), apps })
      setStatus('')
      ctx.onSaved(stored)
    } catch (error) {
      setStatus(describeError(error), true)
    } finally {
      busy = false
      render()
    }
  }

  function pickWebapp(): void {
    const available = suggestions(ctx.webapps, apps, SELF).sort((a, b) =>
      webappTitle(a).localeCompare(webappTitle(b))
    )
    const search = el('input', { type: 'search', placeholder: 'Search', className: 'field' })
    const results = el('ul', { className: 'pick-list' })
    const close = button('Close', () => dialog.close(), 'btn')

    const show = (): void => {
      const q = search.value.trim().toLowerCase()
      const hits = available.filter(
        (w) => !q || webappTitle(w).toLowerCase().includes(q) || w.name.toLowerCase().includes(q)
      )
      if (ctx.webapps.length === 0) {
        results.replaceChildren(
          el('li', { className: 'empty', textContent: 'Could not read the installed webapps from the server.' })
        )
        return
      }
      if (hits.length === 0) {
        results.replaceChildren(
          el('li', {
            className: 'empty',
            textContent: available.length === 0 ? 'All installed webapps are on the list.' : 'No match.'
          })
        )
        return
      }
      results.replaceChildren(
        ...hits.map((w) => {
          const app: LauncherApp = { id: newId(), kind: 'signalk', name: webappTitle(w), webapp: w.name, target: 'same' }
          const pick = el(
            'button',
            { type: 'button', className: 'pick' },
            badge(app, index, 'badge small'),
            el(
              'span',
              { className: 'label' },
              el('span', { className: 'title', textContent: app.name }),
              el('span', { className: 'sub', textContent: w.description || w.name })
            )
          )
          pick.addEventListener('click', () => {
            update([...apps, app])
            dialog.close()
          })
          return el('li', {}, pick)
        })
      )
    }

    search.addEventListener('input', show)
    const dialog = openDialog('Add a Signal K app', search, results, el('div', { className: 'actions' }, close))
    show()
  }

  function editApp(existing: LauncherApp | undefined): void {
    const isNew = existing === undefined
    const kind = existing?.kind ?? 'external'
    const name = el('input', { className: 'field', value: existing?.name ?? '', required: true, maxLength: 60 })
    const url = el('input', {
      className: 'field',
      type: 'text',
      inputMode: 'url',
      value: existing?.kind === 'external' ? existing.url : '',
      placeholder: 'http://{host}:3001/',
      autocapitalize: 'off',
      spellcheck: false
    })
    const target = el(
      'select',
      { className: 'field' },
      el('option', { value: 'same', textContent: 'Same tab' }),
      el('option', { value: 'new', textContent: 'New tab' }),
      el('option', { value: 'reuse', textContent: 'Own tab, kept open' })
    )
    target.value = existing?.target ?? 'same'
    const iconUrl = el('input', {
      className: 'field',
      type: 'text',
      inputMode: 'url',
      value: existing?.iconUrl ?? '',
      placeholder: 'optional',
      autocapitalize: 'off',
      spellcheck: false
    })
    const ownColor = el('input', { type: 'checkbox', checked: existing?.color !== undefined })
    const color = el('input', { type: 'color', value: /^#[0-9a-f]{6}$/i.test(existing?.color ?? '') ? existing!.color! : '#1f6fb2' })
    const error = el('p', { className: 'status error', role: 'alert' })

    const field = (label: string, input: HTMLElement, hint?: string): HTMLElement =>
      el('label', { className: 'form-row' }, el('span', { textContent: label }), input, hint ? el('small', { textContent: hint }) : null)

    // A submit button, so Enter in any field (and Go on a phone keyboard) submits.
    const ok = el('button', { type: 'submit', className: 'btn primary', textContent: isNew ? 'Add' : 'Done' })
    const cancel = button('Cancel', () => dialog.close(), 'btn')
    const form = el(
      'form',
      { className: 'form', noValidate: true },
      field('Name', name),
      kind === 'external'
        ? field('URL', url, '{host} becomes the host name you opened the launcher with. A path like /grafana/ stays on this server.')
        : el('p', { className: 'sub', textContent: `Signal K webapp ${existing?.kind === 'signalk' ? existing.webapp : ''}` }),
      field('Open in', target, 'Own tab, kept open: tapping the tile again returns to the open app instead of reloading it.'),
      field('Icon URL', iconUrl),
      el('label', { className: 'form-row inline' }, ownColor, el('span', { textContent: 'Own tile colour' }), color),
      error,
      el('div', { className: 'actions' }, cancel, ok)
    )
    form.addEventListener('submit', (event) => {
      event.preventDefault()
      submit()
    })

    function submit(): void {
      const base = {
        id: existing?.id ?? newId(),
        name: name.value,
        target: target.value,
        iconUrl: iconUrl.value,
        color: ownColor.checked ? color.value : undefined
      }
      const candidate =
        existing?.kind === 'signalk'
          ? { ...base, kind: 'signalk', webapp: existing.webapp }
          : { ...base, kind: 'external', url: url.value }
      try {
        const [app] = validateConfig({ apps: [candidate] }).apps
        update(upsert(apps, app!))
        dialog.close()
      } catch (e) {
        error.textContent = e instanceof ValidationError ? e.message.replace(/^apps\[0\]\./, '') : String(e)
      }
    }

    const dialog = openDialog(isNew ? 'Add an app' : `Edit ${existing.name}`, form)
    name.focus()
  }

  render()
  return { element, isDirty }
}
