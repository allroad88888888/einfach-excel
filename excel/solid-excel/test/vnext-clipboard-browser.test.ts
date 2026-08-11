import { afterEach, describe, expect, it, jest } from '@jest/globals'

import {
  clipboardHtmlTableToTsv,
  readBrowserClipboardText,
  writeBrowserClipboard,
} from '../src-vnext/clipboard/browser-clipboard'

class ClipboardItemMock {
  readonly types: readonly string[]

  constructor(readonly contents: Record<string, Blob>) {
    this.types = Object.keys(contents)
  }

  async getType(type: string): Promise<Blob> {
    return this.contents[type]
  }
}

function clipboardItemWithText(contents: Record<string, string>) {
  const types = Object.keys(contents)
  return {
    types,
    getType: async (type: string) => ({ text: async () => contents[type] }) as Blob,
  }
}

function installClipboard(clipboard: object) {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: clipboard,
  })
}

function installClipboardItem() {
  Object.defineProperty(globalThis, 'ClipboardItem', {
    configurable: true,
    value: ClipboardItemMock,
  })
}

afterEach(() => {
  Reflect.deleteProperty(navigator, 'clipboard')
  Reflect.deleteProperty(globalThis, 'ClipboardItem')
  Reflect.deleteProperty(document, 'execCommand')
  jest.restoreAllMocks()
})

describe('vnext browser clipboard boundary', () => {
  it('writes HTML and TSV together when the rich Clipboard API is available', async () => {
    const write = jest.fn(async (_items: readonly ClipboardItemMock[]) => undefined)
    installClipboard({ write })
    installClipboardItem()

    await expect(
      writeBrowserClipboard({
        plainText: 'A\tB',
        html: '<table><tr><td>A</td><td>B</td></tr></table>',
      }),
    ).resolves.toBe('rich')

    const item = write.mock.calls[0][0][0]
    expect(item.types).toEqual(['text/html', 'text/plain'])
    expect(item.contents['text/html'].type).toBe('text/html')
    expect(item.contents['text/plain'].type).toBe('text/plain')
  })

  it('falls back to writeText when the rich write is rejected', async () => {
    const write = jest.fn(async () => Promise.reject(new Error('NotAllowedError')))
    const writeText = jest.fn(async (_text: string) => undefined)
    installClipboard({ write, writeText })
    installClipboardItem()

    await expect(
      writeBrowserClipboard({ plainText: 'A\tB', html: '<table><tr><td>A</td></tr></table>' }),
    ).resolves.toBe('plain')
    expect(writeText).toHaveBeenCalledWith('A\tB')
  })

  it('uses the temporary textarea adapter when Clipboard API access is absent', async () => {
    const execCommand = jest.fn(() => true)
    Object.defineProperty(document, 'execCommand', { configurable: true, value: execCommand })

    await expect(writeBrowserClipboard({ plainText: 'fallback' })).resolves.toBe('legacy')

    expect(execCommand).toHaveBeenCalledWith('copy')
    expect(document.querySelector('textarea')).toBeNull()
  })

  it('converts foreign HTML table cells to safe TSV including spans', () => {
    expect(
      clipboardHtmlTableToTsv(
        '<table><tr><td rowspan="2" colspan="2">A\t1</td><td>B</td></tr><tr><td>C<br>D</td></tr></table>',
      ),
    ).toBe('A 1\t\tB\n\t\tC D')
  })

  it('prefers plain TSV so workbook origin metadata survives a rich round trip', async () => {
    installClipboard({
      read: async () => [
        clipboardItemWithText({
          'text/plain': '# einfach-clipboard-origin: A1\n=SUM(A1:A2)',
          'text/html': '<table><tr><td>formatted value</td></tr></table>',
        }),
      ],
    })

    await expect(readBrowserClipboardText()).resolves.toBe(
      '# einfach-clipboard-origin: A1\n=SUM(A1:A2)',
    )
  })

  it('reads HTML-only external tables when text/plain is unavailable', async () => {
    installClipboard({
      read: async () => [
        clipboardItemWithText({
          'text/html':
            '<table><tr><th>Name</th><th>Score</th></tr><tr><td>Ada</td><td>42</td></tr></table>',
        }),
      ],
    })

    await expect(readBrowserClipboardText()).resolves.toBe('Name\tScore\nAda\t42')
  })

  it('uses readText when rich reads are denied', async () => {
    const readText = jest.fn(async () => 'fallback\ttext')
    installClipboard({
      read: async () => Promise.reject(new Error('NotAllowedError')),
      readText,
    })

    await expect(readBrowserClipboardText()).resolves.toBe('fallback\ttext')
    expect(readText).toHaveBeenCalledTimes(1)
  })
})
