import { expect, test, vi } from 'vitest'
import { readNote, changeNote, type RustNoteCommands } from '../../src/rust-workbook/notes/command'
import { validateNoteText } from '../../src/notes/text'
import type { WasmWorkbook } from '../../src/rust-workbook/wasm-types'

test('Worker handlers read and change one native cell with revision and bounds checks', () => {
  const read = vi.fn(() => 'first\nline')
  const change = vi.fn(() => true)
  const workbook = { read_note: read, change_note: change } as unknown as WasmWorkbook
  const sheets = new Map([['s', { id: 's', index: 2, name: 'Sheet', rowCount: 100, colCount: 8 }]])
  const input: RustNoteCommands['notes.change']['payload'] = { sheetId: 's', row: 1, col: 2,
    revision: 3, text: '=plain text', projection: { kind: 'visible-window', sheetId: 's', requestId: 1,
      window: { rowStart: 0, rowEnd: 9, colStart: 0, colEnd: 7 } } }
  expect(readNote(workbook, sheets, input, 3)).toBe('first\nline')
  expect(read).toHaveBeenCalledExactlyOnceWith(2, 1, 2)
  expect(changeNote(workbook, sheets, input, 3)).toBe(true)
  expect(change).toHaveBeenCalledExactlyOnceWith(2, 1, 2, '=plain text')
  change.mockClear()
  for (const patch of [{ row: -1 }, { row: 100 }, { col: 8 }, { revision: 2 },
    { projection: { ...input.projection, sheetId: 'wrong' } }])
    expect(() => changeNote(workbook, sheets, { ...input, ...patch }, 3)).toThrow()
  expect(change).not.toHaveBeenCalled()
  changeNote(workbook, sheets, { ...input, text: null }, 3)
  expect(change).toHaveBeenCalledExactlyOnceWith(2, 1, 2, undefined)
})

test('client input rules count Unicode scalars and preserve whitespace', () => {
  expect(validateNoteText('  a\r\nb  ')).toEqual({ text: '  a\nb  ', error: '' })
  expect(validateNoteText('🙂'.repeat(32767)).error).toBe('')
  expect(validateNoteText('🙂'.repeat(32768)).error).toContain('32767')
  expect(validateNoteText('\u0085').error).toContain('Enter note text')
  expect(validateNoteText('a\0b').error).toContain('null character')
})
