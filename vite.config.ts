import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import checker from 'vite-plugin-checker'

const webRoot = fileURLToPath(new URL('./web', import.meta.url))

export default defineConfig({
  root: 'web',
  // The server mounts the webapp under its package name.
  base: '/signalk-app-launcher/',
  // A Vite root moves the default publicDir to web/public; the icon and
  // manifest live in static/ so both the server's appIcon lookup and the page
  // find them next to index.html.
  publicDir: '../static',
  build: { outDir: '../public', emptyOutDir: true },
  plugins: [checker({ typescript: { root: webRoot, tsconfigPath: 'tsconfig.json' } })]
})
