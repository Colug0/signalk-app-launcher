import { describe, expect, it } from 'vitest'
import { buildManifest, vesselName, WEBAPP_PATH } from '../src/manifest.js'

describe('buildManifest', () => {
  it('uses the title as name and short name', () => {
    const m = buildManifest('Paikea')
    expect(m).toMatchObject({ name: 'Paikea', short_name: 'Paikea', start_url: WEBAPP_PATH, scope: WEBAPP_PATH })
  })

  it('shortens a long short name', () => {
    const m = buildManifest('A rather long boat name')
    expect(m.name).toBe('A rather long boat name')
    expect(m.short_name).toBe('A rather lo…')
    expect((m.short_name as string).length).toBeLessThanOrEqual(12)
  })

  it('points the icons at the webapp', () => {
    const icons = buildManifest('x').icons as { src: string }[]
    expect(icons.every((i) => i.src.startsWith(WEBAPP_PATH))).toBe(true)
  })
})

describe('vesselName', () => {
  it.each([
    ['Paikea', 'Paikea'],
    [{ value: 'Paikea' }, 'Paikea'],
    ['  ', undefined],
    [undefined, undefined],
    [42, undefined]
  ])('%j → %j', (raw, expected) => expect(vesselName(raw)).toBe(expected))
})
