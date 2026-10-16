import { expect, test, vi } from 'vitest'
import { changeHyperlink, type RustHyperlinkCommands } from '../../src/rust-workbook/hyperlink/command'
import { externalHyperlink } from '../../src/hyperlink/url'
import type { WasmWorkbook } from '../../src/rust-workbook/wasm-types'

test('transport forwards one native call without parsing text as a formula', () => {
  const change = vi.fn(() => true)
  const workbook = { change_hyperlink: change } as unknown as WasmWorkbook
  const sheets = new Map([['s', { id: 's', index: 2, name: 'Sheet', rowCount: 100, colCount: 8 }]])
  const input: RustHyperlinkCommands['hyperlink.change']['payload'] = {
    sheetId: 's', row: 1, col: 2, revision: 3, url: 'https://example.com', text: '=literal',
    projection: { kind: 'visible-window', sheetId: 's', requestId: 1,
      window: { rowStart: 0, rowEnd: 9, colStart: 0, colEnd: 7 } },
  }
  expect(changeHyperlink(workbook, sheets, input, 3)).toBe(true)
  expect(change).toHaveBeenCalledExactlyOnceWith(2, 1, 2, 'https://example.com', '=literal')
  change.mockClear()
  for (const patch of [{ row: -1 }, { row: 100 }, { col: 8 }, { revision: 2 },
    { projection: { ...input.projection, sheetId: 'wrong' } }]) {
    expect(() => changeHyperlink(workbook, sheets, { ...input, ...patch }, 3)).toThrow()
  }
  expect(change).not.toHaveBeenCalled()
  changeHyperlink(workbook, sheets, { ...input, url: null, text: 'discard' }, 3)
  expect(change).toHaveBeenCalledExactlyOnceWith(2, 1, 2, undefined, undefined)
})

test.each(['javascript:alert(1)', 'data:text/html,hi', 'file:///tmp/test', '//example.com',
  'https://user:pass@example.com', 'https://example.com\n/path', 'https:\\example.com'])(
  'DOM boundary rejects unsafe address %s', (url) => expect(externalHyperlink(url)).toBeNull(),
)
test('DOM boundary normalizes safe absolute links only', () => {
  expect(externalHyperlink('HTTPS://EXAMPLE.COM')).toBe('https://example.com/')
  expect(externalHyperlink(undefined)).toBeNull()
})
