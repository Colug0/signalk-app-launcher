import { describe, expect, it } from 'vitest'
import type { LauncherApp } from '../src/shared/apps.js'
import { move, removeAt, sameApps, suggestions, upsert } from '../src/shared/edit.js'

const ext = (id: string): LauncherApp => ({ id, kind: 'external', name: id, url: '/x/', target: 'same' })
const sk = (id: string, webapp: string): LauncherApp => ({ id, kind: 'signalk', name: id, webapp, target: 'same' })

describe('move', () => {
  const list = ['a', 'b', 'c', 'd']
  it('moves up and down', () => {
    expect(move(list, 2, -1)).toEqual(['a', 'c', 'b', 'd'])
    expect(move(list, 0, 1)).toEqual(['b', 'a', 'c', 'd'])
  })
  it('clamps at the ends and never mutates', () => {
    expect(move(list, 0, -1)).toEqual(list)
    expect(move(list, 3, 5)).toEqual(['a', 'b', 'c', 'd'])
    expect(move(list, 1, 10)).toEqual(['a', 'c', 'd', 'b'])
    expect(list).toEqual(['a', 'b', 'c', 'd'])
  })
  it('ignores an index outside the list', () => {
    expect(move(list, 7, -1)).toEqual(list)
  })
})

describe('removeAt', () => {
  it('removes one item', () => expect(removeAt(['a', 'b', 'c'], 1)).toEqual(['a', 'c']))
})

describe('upsert', () => {
  it('replaces in place by id', () => {
    const next = upsert([ext('a'), ext('b')], { ...ext('a'), name: 'A2' })
    expect(next.map((a) => a.name)).toEqual(['A2', 'b'])
  })
  it('appends a new id', () => {
    expect(upsert([ext('a')], ext('b')).map((a) => a.id)).toEqual(['a', 'b'])
  })
})

describe('sameApps', () => {
  it('sees order changes', () => {
    expect(sameApps([ext('a'), ext('b')], [ext('a'), ext('b')])).toBe(true)
    expect(sameApps([ext('a'), ext('b')], [ext('b'), ext('a')])).toBe(false)
  })
})

describe('suggestions', () => {
  it('leaves out added webapps and the launcher itself', () => {
    const installed = [{ name: '@signalk/freeboard-sk' }, { name: 'kip' }, { name: 'signalk-app-launcher' }]
    const apps = [sk('fb', '@signalk/freeboard-sk'), ext('kip')]
    expect(suggestions(installed, apps, 'signalk-app-launcher').map((w) => w.name)).toEqual(['kip'])
  })
})
