import { describe, expect, it } from 'vitest'
import type { FileHandle } from './fs'
import { directoryForFile, ensureCanonicalAssets, type DirHandle } from './fsdir'

class MockFileHandle implements FileHandle {
  private data = new Blob()

  constructor(public name: string) {}

  async getFile(): Promise<File> {
    return new File([this.data], this.name)
  }

  async createWritable() {
    return {
      write: async (data: string | BufferSource | Blob) => {
        this.data = data instanceof Blob ? data : new Blob([data])
      },
      close: async () => undefined,
    }
  }

  async isSameEntry(other: FileHandle): Promise<boolean> {
    return other === this
  }
}

class MockDirHandle implements DirHandle {
  private files = new Map<string, MockFileHandle>()
  private dirs = new Map<string, MockDirHandle>()

  constructor(public name: string) {}

  async getFileHandle(name: string, opts?: { create?: boolean }): Promise<FileHandle> {
    const existing = this.files.get(name)
    if (existing) return existing
    if (!opts?.create) throw new DOMException('Not found', 'NotFoundError')
    const file = new MockFileHandle(name)
    this.files.set(name, file)
    return file
  }

  async getDirectoryHandle(name: string, opts?: { create?: boolean }): Promise<DirHandle> {
    const existing = this.dirs.get(name)
    if (existing) return existing
    if (!opts?.create) throw new DOMException('Not found', 'NotFoundError')
    const dir = new MockDirHandle(name)
    this.dirs.set(name, dir)
    return dir
  }

  async removeEntry(name: string): Promise<void> {
    this.files.delete(name)
    this.dirs.delete(name)
  }

  async resolve(possibleDescendant: FileHandle): Promise<string[] | null> {
    for (const [name, file] of this.files) {
      if (await file.isSameEntry(possibleDescendant)) return [name]
    }
    for (const [name, dir] of this.dirs) {
      const path = await dir.resolve(possibleDescendant)
      if (path) return [name, ...path]
    }
    return null
  }

  async *values(): AsyncIterable<FileHandle | DirHandle> {
    yield* this.files.values()
    yield* this.dirs.values()
  }
}

describe('canonical Assets folders', () => {
  it('derives the deck folder from a broader permission root', async () => {
    const root = new MockDirHandle('Lectures')
    const subject = (await root.getDirectoryHandle('Open Source & AI', { create: true })) as MockDirHandle
    const deckDir = (await subject.getDirectoryHandle('dek', { create: true })) as MockDirHandle
    const deckFile = await deckDir.getFileHandle('Open Source & AI dek.md', { create: true })

    expect(await directoryForFile(root, deckFile)).toBe(deckDir)
  })

  it('copies a legacy shared image into the folder matching the selected file', async () => {
    const parent = new MockDirHandle('dek')
    const legacy = (await parent.getDirectoryHandle('Open Source & AI dek Assets', { create: true })) as MockDirHandle
    const source = await legacy.getFileHandle('hero.webp', { create: true })
    const writer = await source.createWritable()
    await writer.write('image bytes')
    await writer.close()

    const missing = await ensureCanonicalAssets(
      parent,
      'Open Source & AI dek - SIM Edition.md',
      ['/Open Source & AI dek Assets/hero.webp'],
    )

    expect(missing).toEqual([])
    const target = await parent.getDirectoryHandle('Open Source & AI dek - SIM Edition Assets')
    const copied = await target.getFileHandle('hero.webp')
    expect(await (await copied.getFile()).text()).toBe('image bytes')
  })
})
