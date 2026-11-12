// The web app manifest is built per request, so the home screen name follows
// the launcher's title setting or the vessel name.

export const WEBAPP_PATH = '/signalk-app-launcher/'

/** Short names longer than this get cut on Android's home screen. */
const SHORT_NAME_MAX = 12

export function buildManifest(title: string): Record<string, unknown> {
  return {
    name: title,
    short_name: title.length > SHORT_NAME_MAX ? `${title.slice(0, SHORT_NAME_MAX - 1).trimEnd()}…` : title,
    id: WEBAPP_PATH,
    start_url: WEBAPP_PATH,
    scope: WEBAPP_PATH,
    display: 'standalone',
    background_color: '#0b1724',
    theme_color: '#0b2239',
    icons: [
      { src: `${WEBAPP_PATH}icon-192.png`, sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
      { src: `${WEBAPP_PATH}icon-512.png`, sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
      { src: `${WEBAPP_PATH}icon.svg`, sizes: 'any', type: 'image/svg+xml', purpose: 'any' }
    ]
  }
}

/**
 * The vessel name from the data model. getSelfPath returns the bare string for
 * `name`, but a { value } object if a source ever wrote it as a delta.
 */
export function vesselName(raw: unknown): string | undefined {
  const value = typeof raw === 'object' && raw !== null && 'value' in raw ? (raw as { value: unknown }).value : raw
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}
