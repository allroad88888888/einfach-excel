import { Blob as NativeBlob } from 'node:buffer'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import {
  clipboardToken, readBrowserClipboard, writeBrowserClipboard,
  writeBrowserClipboardExport, writeBrowserClipboardText,
} from '../../../src/workbook/clipboard/browser-clipboard'

const token = '00000000-0000-0000-0000-000000000001'
const capture = { token, text: '<b>"A&B"</b>\nnext', rows: 2, cols: 1, cut: false }
class TestClipboardItem {
  readonly types: string[]
  constructor(readonly parts: Record<string, Promise<Blob> | Blob>) {
    this.types = Object.keys(parts)
  }

  async getType(type: string) { return this.parts[type] }
}
const write = vi.fn<(items: TestClipboardItem[]) => Promise<void>>()
const read = vi.fn<() => Promise<TestClipboardItem[]>>()

beforeEach(() => {
  write.mockReset().mockResolvedValue(undefined)
  read.mockReset().mockResolvedValue([])
  // jsdom 的 Blob 没有 text()；只替换浏览器边界，不 mock 被测函数。
  vi.stubGlobal('Blob', NativeBlob)
  vi.stubGlobal('ClipboardItem', TestClipboardItem)
  vi.stubGlobal('navigator', { clipboard: { write, read } })
})
afterEach(() => vi.unstubAllGlobals())

describe('browser clipboard write boundary', () => {
  test('starts write in the gesture before Rust resolves and escapes only the HTML payload', async () => {
    let resolve!: (value: typeof capture) => void
    const pending = writeBrowserClipboard(new Promise((done) => { resolve = done }))
    expect(write).toHaveBeenCalledOnce()
    const item = write.mock.calls[0][0][0]
    expect(item.types).toEqual(['text/plain', 'text/html'])
    resolve(capture)
    await pending
    expect(await (await item.getType('text/plain')).text()).toBe(capture.text)
    expect(await (await item.getType('text/html')).text()).toBe(
      `<pre data-einfach-clipboard="${token}">&lt;b&gt;&quot;A&amp;B&quot;&lt;/b&gt;\nnext</pre>`,
    )
  })

  test.each(['sync', 'async'] as const)('%s permission denial waits for Rust data and translates the error', async (mode) => {
    const denied = new DOMException('denied', 'NotAllowedError')
    write.mockImplementationOnce(() => {
      if (mode === 'sync') throw denied
      return Promise.reject(denied)
    })
    let resolve!: (value: typeof capture) => void
    const pending = writeBrowserClipboard(new Promise((done) => { resolve = done }))
    const result = expect(pending).rejects.toThrow('Allow clipboard access and try again')
    resolve(capture)
    await result
    await expect(writeBrowserClipboard(Promise.resolve(capture))).resolves.toBeUndefined()
  })

  test.each(['write', 'ClipboardItem'] as const)('missing %s rejects cleanly even if Rust also fails', async (missing) => {
    if (missing === 'write') vi.stubGlobal('navigator', { clipboard: {} })
    else vi.stubGlobal('ClipboardItem', undefined)
    await expect(writeBrowserClipboard(Promise.reject(new Error('late Rust failure'))))
      .rejects.toThrow('secure HTTPS or localhost')
    expect(write).not.toHaveBeenCalled()
  })

  test('Rust rejection is not replaced by an empty clipboard item', async () => {
    const error = new Error('CLIPBOARD_PARTIAL_MERGE')
    await expect(writeBrowserClipboard(Promise.reject(error))).rejects.toBe(error)
    const item = write.mock.calls[0][0][0]
    await expect(item.getType('text/plain')).rejects.toBe(error)
    await expect(item.getType('text/html')).rejects.toBe(error)
  })

  test('ordinary browser failures retain their original identity', async () => {
    const error = new Error('clipboard disconnected')
    write.mockRejectedValueOnce(error)
    await expect(writeBrowserClipboard(Promise.resolve(capture))).rejects.toBe(error)
  })

  test.each(['text', 'markdown', 'html'] as const)('Copy As %s never publishes an internal token', async (format) => {
    await writeBrowserClipboardExport(format, Promise.resolve({ text: 'exported', html: '<table></table>', rows: 1, cols: 1 }))
    const item = write.mock.calls[0][0][0]
    expect(item.types).toEqual(format === 'html' ? ['text/plain', 'text/html'] : ['text/plain'])
    expect(await (await item.getType('text/plain')).text()).toBe('exported')
    if (format === 'html') {
      const html = await (await item.getType('text/html')).text()
      expect(html).toBe('<table></table>')
      expect(clipboardToken(html)).toBeUndefined()
    }
  })

  test('missing HTML in a native export rejects instead of silently falling back to plain text', async () => {
    await expect(writeBrowserClipboardExport('html', Promise.resolve({ text: 'x', rows: 1, cols: 1 })))
      .rejects.toThrow('did not return an HTML table')
  })

  test('copying a statistic writes only raw text', async () => {
    await writeBrowserClipboardText(Promise.resolve('001.25'))
    const item = write.mock.calls[0][0][0]
    expect(item.types).toEqual(['text/plain'])
    expect(await (await item.getType('text/plain')).text()).toBe('001.25')
  })
})

describe('browser clipboard read boundary', () => {
  test('skips non-text items and forwards the matching internal token', async () => {
    read.mockResolvedValueOnce([
      new TestClipboardItem({ 'image/png': new Blob(['image']) }),
      new TestClipboardItem({
        'text/plain': new Blob(['=A1\t001']),
        'text/html': new Blob([`<pre data-einfach-clipboard='${token}'>safe</pre>`]),
      }),
    ])
    await expect(readBrowserClipboard()).resolves.toEqual({ text: '=A1\t001', token })
  })

  test('an empty plain-text payload is valid and remains external', async () => {
    read.mockResolvedValueOnce([new TestClipboardItem({ 'text/plain': new Blob(['']) })])
    await expect(readBrowserClipboard()).resolves.toEqual({ text: '', token: undefined })
  })

  test.each([{ items: [] }, { items: [new TestClipboardItem({ 'image/png': new Blob(['x']) })] }])('rejects a clipboard without text: %j', async ({ items }) => {
    read.mockResolvedValueOnce(items)
    await expect(readBrowserClipboard()).rejects.toThrow('does not contain cell text')
  })

  test('missing read API explains the keyboard fallback', async () => {
    vi.stubGlobal('navigator', { clipboard: {} })
    await expect(readBrowserClipboard()).rejects.toThrow('Ctrl/⌘+V')
  })

  test('denied read can recover on the next request', async () => {
    read.mockRejectedValueOnce(new DOMException('denied', 'NotAllowedError'))
    await expect(readBrowserClipboard()).rejects.toThrow('permission was denied')
    read.mockResolvedValueOnce([new TestClipboardItem({ 'text/plain': new Blob(['retry']) })])
    await expect(readBrowserClipboard()).resolves.toMatchObject({ text: 'retry' })
  })

  test('a failed item decode is not treated as successful empty text', async () => {
    const error = new Error('decode failed')
    const item = new TestClipboardItem({ 'text/plain': new Blob(['x']) })
    vi.spyOn(item, 'getType').mockRejectedValueOnce(error)
    read.mockResolvedValueOnce([item])
    await expect(readBrowserClipboard()).rejects.toBe(error)
  })

  test.each(['', '<pre>text</pre>', '<pre data-einfach-clipboard="invalid">x</pre>'])('does not invent a token for %j', (html) => {
    expect(clipboardToken(html)).toBeUndefined()
  })
})
