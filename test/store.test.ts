import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ValidationError } from '../src/shared/apps.js'
import { CONFIG_FILE, ConfigStore } from '../src/store.js'

let dir: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'launcher-'))
})
afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

const app = (id: string) => ({ id, kind: 'external', name: id, url: '/x/' })

describe('ConfigStore', () => {
  it('returns an empty list before anything is saved', async () => {
    expect(await new ConfigStore(dir).load()).toEqual({ version: 1, apps: [] })
  })

  it('saves and loads, creating the directory', async () => {
    const store = new ConfigStore(join(dir, 'sub'))
    await store.save({ apps: [app('a'), app('b')] })
    const loaded = await store.load()
    expect(loaded.apps.map((a) => a.id)).toEqual(['a', 'b'])
  })

  it('does not write invalid input and leaves no temp file', async () => {
    const store = new ConfigStore(dir)
    await store.save({ apps: [app('a')] })
    await expect(store.save({ apps: [{ id: 'x' }] })).rejects.toThrow(ValidationError)
    expect((await store.load()).apps.map((a) => a.id)).toEqual(['a'])
    expect(await readdir(dir)).toEqual([CONFIG_FILE])
  })

  it('keeps the last of several concurrent saves', async () => {
    const store = new ConfigStore(dir)
    await Promise.all([1, 2, 3, 4, 5].map((n) => store.save({ apps: [app(`a${n}`)] })))
    const saved = JSON.parse(await readFile(join(dir, CONFIG_FILE), 'utf8'))
    expect(saved.apps[0].id).toBe('a5')
  })

  it('rejects a corrupt file instead of serving it', async () => {
    await writeFile(join(dir, CONFIG_FILE), '{"apps":[{"id":1}]}')
    await expect(new ConfigStore(dir).load()).rejects.toThrow(ValidationError)
  })
})
