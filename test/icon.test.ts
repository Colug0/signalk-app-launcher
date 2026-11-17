import { lstat, readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

// A symlinked icon checks out on Windows as a text file holding its target,
// and a release packed from there ships a broken icon.
describe('static assets', () => {
  it('icon.svg is a real SVG file', async () => {
    const path = new URL('../static/icon.svg', import.meta.url)
    expect((await lstat(path)).isFile()).toBe(true)
    expect(await readFile(path, 'utf8')).toContain('<svg')
  })

  it.each([180, 192, 512])('icon-%i.png is a real PNG file', async (size) => {
    const path = new URL(`../static/icon-${size}.png`, import.meta.url)
    expect((await lstat(path)).isFile()).toBe(true)
    const bytes = await readFile(path)
    expect(bytes.subarray(1, 4).toString('ascii')).toBe('PNG')
    expect(bytes.readUInt32BE(16)).toBe(size)
  })

  it('package.json points appIcon at the served icon', async () => {
    const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
    expect(pkg.signalk.appIcon).toBe('./icon.svg')
    expect(pkg.files).toContain('public')
  })

  it('ships every screenshot named in package.json', async () => {
    const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
    const shots: string[] = pkg.signalk.screenshots
    expect(shots.length).toBeGreaterThan(0)
    for (const shot of shots) {
      const rel = shot.replace(/^\.\//, '')
      expect(pkg.files.some((f: string) => rel === f || rel.startsWith(`${f.replace(/\/$/, '')}/`))).toBe(true)
      const bytes = await readFile(new URL(`../${rel}`, import.meta.url))
      expect(bytes.subarray(1, 4).toString('ascii')).toBe('PNG')
    }
  })
})
