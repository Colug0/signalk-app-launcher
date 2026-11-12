import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { EMPTY_CONFIG, validateConfig, type LauncherConfig } from './shared/apps.js'

export const CONFIG_FILE = 'apps.json'

/**
 * Keeps the app list in the plugin's data directory, which survives plugin
 * updates (the install directory does not).
 */
export class ConfigStore {
  private readonly file: string
  private writing: Promise<unknown> = Promise.resolve()

  constructor(private readonly dir: string) {
    this.file = join(dir, CONFIG_FILE)
  }

  async load(): Promise<LauncherConfig> {
    let text: string
    try {
      text = await readFile(this.file, 'utf8')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return structuredClone(EMPTY_CONFIG)
      throw error
    }
    return validateConfig(JSON.parse(text))
  }

  /** Validates, then replaces the file atomically. Saves run one at a time. */
  async save(input: unknown): Promise<LauncherConfig> {
    const config = validateConfig(input)
    const run = this.writing.then(async () => {
      await mkdir(this.dir, { recursive: true })
      const tmp = `${this.file}.${process.pid}.tmp`
      await writeFile(tmp, `${JSON.stringify(config, null, 2)}\n`, 'utf8')
      await rename(tmp, this.file)
    })
    this.writing = run.catch(() => undefined)
    await run
    return config
  }
}
