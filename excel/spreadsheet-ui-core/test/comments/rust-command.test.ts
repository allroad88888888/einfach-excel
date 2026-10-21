import { expect, test, vi } from 'vitest'
import { readComment, changeComment, type RustCommentCommands } from '../../src/rust-workbook/comments/command'
import { isNativeCommentThread, validateCommentDraft } from '../../src/comments/native/types'
import type { WasmWorkbook } from '../../src/rust-workbook/wasm-types'
import { firstThread } from './fixture'

test('Worker handlers preserve native JSON and reject stale bounds or malformed reads', () => {
  const read = vi.fn(() => JSON.stringify(firstThread()))
  const change = vi.fn(() => true)
  const workbook = { read_comment: read, change_comment: change } as unknown as WasmWorkbook
  const sheets = new Map([['s', { id: 's', index: 2, name: 'Sheet', rowCount: 100, colCount: 8 }]])
  const input: RustCommentCommands['comments.change']['payload'] = { sheetId: 's', row: 1, col: 2,
    revision: 3, change: { action: 'create', author: 'Alice', body: '<b>plain</b>' },
    projection: { kind: 'visible-window', sheetId: 's', requestId: 1,
      window: { rowStart: 0, rowEnd: 9, colStart: 0, colEnd: 7 } } }
  expect(readComment(workbook, sheets, input, 3)).toEqual(firstThread())
  expect(read).toHaveBeenCalledExactlyOnceWith(2, 1, 2)
  expect(changeComment(workbook, sheets, input, 3)).toBe(true)
  expect(change).toHaveBeenCalledExactlyOnceWith(2, 1, 2, JSON.stringify(input.change))
  change.mockClear()
  for (const patch of [{ row: -1 }, { row: 100 }, { col: 8 }, { revision: 2 },
    { projection: { ...input.projection, sheetId: 'wrong' } }])
    expect(() => changeComment(workbook, sheets, { ...input, ...patch }, 3)).toThrow()
  expect(change).not.toHaveBeenCalled()
  read.mockReturnValue('{"entries":[],"resolved":false}')
  expect(() => readComment(workbook, sheets, input, 3)).toThrow('invalid comment thread')
})

test('Unicode draft and event rules agree with native boundaries', () => {
  expect(validateCommentDraft('🙂'.repeat(100), '🙂'.repeat(32767))).toBe('')
  expect(validateCommentDraft('🙂'.repeat(101), 'body')).toContain('100')
  expect(validateCommentDraft('Alice', '\u0085')).toContain('Enter comment text')
  expect(validateCommentDraft('Alice', '🙂'.repeat(32768))).toContain('32767')
  expect(isNativeCommentThread({ ...firstThread(), resolved: true })).toBe(false)
  expect(
    isNativeCommentThread({
      entries: [{ ...firstThread().entries[0], createdAt: -1 }],
      resolved: false,
    }),
  ).toBe(false)
  expect(isNativeCommentThread(firstThread())).toBe(true)
})
