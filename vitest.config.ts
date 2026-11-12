import { defineConfig } from 'vitest/config'

// Separate from vite.config.ts, whose root is the webapp folder.
export default defineConfig({
  test: {
    root: '.',
    include: ['test/**/*.test.ts']
  }
})
