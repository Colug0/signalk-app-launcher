// Pure list operations for the webapp's edit mode. They return new arrays so
// the editor can compare against the saved list.
import type { LauncherApp } from './apps.js'

/** Moves the item at `from` by `delta` places, clamped to the list. */
export function move<T>(list: readonly T[], from: number, delta: number): T[] {
  const to = Math.min(Math.max(from + delta, 0), list.length - 1)
  if (from < 0 || from >= list.length || to === from) return [...list]
  const next = [...list]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item as T)
  return next
}

export function removeAt<T>(list: readonly T[], index: number): T[] {
  return list.filter((_, i) => i !== index)
}

/** Replaces the app with the same id, or appends it. */
export function upsert(list: readonly LauncherApp[], app: LauncherApp): LauncherApp[] {
  const index = list.findIndex((a) => a.id === app.id)
  if (index === -1) return [...list, app]
  const next = [...list]
  next[index] = app
  return next
}

export function sameApps(a: readonly LauncherApp[], b: readonly LauncherApp[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

/** Installed webapps that are not on the list yet, minus the launcher itself. */
export function suggestions<W extends { name: string }>(
  installed: readonly W[],
  apps: readonly LauncherApp[],
  self: string
): W[] {
  const taken = new Set(apps.flatMap((a) => (a.kind === 'signalk' ? [a.webapp] : [])))
  return installed.filter((w) => w.name !== self && !taken.has(w.name))
}
