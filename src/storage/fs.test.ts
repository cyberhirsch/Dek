import { afterEach, describe, expect, it } from 'vitest'
import { pickSave, type FileHandle } from './fs'

const pickerGlobal = globalThis as unknown as {
  showSaveFilePicker?: (options?: unknown) => Promise<FileHandle>
}
const originalSavePicker = pickerGlobal.showSaveFilePicker

afterEach(() => {
  pickerGlobal.showSaveFilePicker = originalSavePicker
})

describe('native file picker', () => {
  it('opens the Save File dialog with a Markdown filename', async () => {
    const handle = { name: 'Chosen deck.md' } as FileHandle
    let received: unknown
    pickerGlobal.showSaveFilePicker = async (options) => {
      received = options
      return handle
    }

    await expect(pickSave('Suggested deck.md')).resolves.toBe(handle)
    expect(received).toMatchObject({
      id: 'dek-deck',
      suggestedName: 'Suggested deck.md',
      excludeAcceptAllOption: true,
    })
  })
})
