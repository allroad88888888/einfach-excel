import { afterEach, describe, expect, test } from 'vitest'
import {
  MAX_TEXT_COLUMNS_FILE_BYTES,
  parseImportedTextFile,
  planFileTextColumns,
} from '../src/text-to-columns/file-parse'
import { runTextColumnsPanelAtom, setSheetProtectionAtom, textColumnsPanelAtom } from '../src'
import { setupRealWorkbookApi } from './host/wasm-runtime-fixture'

const cleanups: (() => void)[] = []
afterEach(() => {
  while (cleanups.length) cleanups.pop()!()
})

describe('text-to-columns local file parser and planner', () => {
  test('validates empty and >16 MiB files, strips BOM, normalizes CRLF/CR and preselects delimiter', () => {
    expect(parseImportedTextFile('empty.csv', 0, '')).toBe('The selected file is empty.')
    expect(parseImportedTextFile('bom.csv', 3, '\uFEFF\r\n')).toBe('The selected file is empty.')
    expect(
      parseImportedTextFile('huge.csv', MAX_TEXT_COLUMNS_FILE_BYTES + 1, 'a,b'),
    ).toContain('16 MiB')

    const csv = parseImportedTextFile('orders.CSV', 24, '\uFEFFName,Qty\r\nEast,10\rWest,20\r\n')
    expect(typeof csv).toBe('object')
    if (typeof csv === 'object') {
      expect(csv.defaultDelimiters).toBe(',')
      expect(csv.lines).toEqual(['Name,Qty', 'East,10', 'West,20'])
    }

    const tsv = parseImportedTextFile('metrics.tsv', 12, 'A\tB\n1\t2')
    expect(typeof tsv === 'object' && tsv.defaultDelimiters).toBe('\t')
  })

  test('supports delimited quotes, fixed-width Unicode code points, column types and number options', () => {
    const delimited = planFileTextColumns({
      lines: ['"North, Zone",007,15/03/2024,ignore,=1+2,1.234,50-'],
      destination: { row: 1, col: 2 },
      rowCount: 100,
      colCount: 20,
      mode: { kind: 'delimited', delimiters: [','], mergeConsecutive: false, qualifier: '"' },
      columnTypes: [
        { column: 1, kind: 'general' },
        { column: 2, kind: 'dateDmy' },
        { column: 3, kind: 'skip' },
        { column: 4, kind: 'text' },
      ],
    })
    expect(typeof delimited).toBe('object')
    if (typeof delimited === 'object') {
      expect(delimited.sourceColumnCount).toBe(7)
      expect(delimited.target).toEqual({ rowStart: 1, colStart: 2, rowEnd: 1, colEnd: 7 })
      expect(delimited.sample[0]).toEqual(['North, Zone', '7', '2024-03-15', '=1+2', '1.234', '50-'])
    }

    const fixed = planFileTextColumns({
      lines: ['北京😀AB009'],
      destination: { row: 0, col: 0 },
      rowCount: 10,
      colCount: 10,
      mode: { kind: 'fixedWidth', breakpoints: [2, 5] },
      columnTypes: [{ column: 2, kind: 'general' }],
    })
    expect(typeof fixed === 'object' && fixed.sample[0]).toEqual(['北京', '😀AB', '9'])

    const localeNums = planFileTextColumns({
      lines: ['1.234,50-;99'],
      destination: { row: 0, col: 0 },
      rowCount: 10,
      colCount: 10,
      mode: { kind: 'delimited', delimiters: [';'], mergeConsecutive: false, qualifier: '"' },
      columnTypes: [{ column: 0, kind: 'general' }, { column: 1, kind: 'general' }],
      numberOptions: { decimalSeparator: ',', groupSeparator: '.', trailingMinus: true },
    })
    expect(typeof localeNums === 'object' && localeNums.sample[0]).toEqual(['-1234.5', '99'])
  })
})

describe('runTextColumnsPanelAtom local file import end-to-end with real WASM', () => {
  test('imports CSV/TSV from active cell in one atomic batch with overwrite guard, bounds, protection and single Undo/Redo', async () => {
    const ctx = await setupRealWorkbookApi()
    cleanups.push(ctx.dispose)
    const { store, api } = ctx

    // Seed an existing cell C3 so overwrite detection is exercised.
    await api.write({
      cells: [
        { sheetId: 'orders', row: 2, col: 2, input: { kind: 'literal', value: { kind: 'string', value: 'Existing' } } },
      ],
    })
    api.select({ sheetId: 'orders', range: { rowStart: 1, rowEnd: 1, colStart: 1, colEnd: 1 } })

    const run = (action: Parameters<typeof runTextColumnsPanelAtom.write>[2]) =>
      store.setter(runTextColumnsPanelAtom, action)
    await run('open')
    expect(store.getter(textColumnsPanelAtom).draft.destination).toBe('B2')

    // Rejects >16 MiB before calling read().
    let readCalled = false
    expect(
      await run({
        type: 'importFile',
        name: 'big.csv',
        size: MAX_TEXT_COLUMNS_FILE_BYTES + 10,
        read: async () => {
          readCalled = true
          return 'a,b'
        },
      }),
    ).toBe(false)
    expect(readCalled).toBe(false)
    expect(store.getter(textColumnsPanelAtom).error).toContain('16 MiB')

    // Import TSV -> auto-selects Tab delimiter and previews immediately, detecting 1 overwritten cell at C3.
    const tsvContent = 'Region\tCode\tAmount\r\n"North\tEast"\t0042\t125\rSouth\t0099\t=1+2\n'
    expect(
      await run({
        type: 'importFile',
        name: 'import.tsv',
        size: tsvContent.length,
        read: async () => tsvContent,
      }),
    ).toBe(true)
    const afterLoad = store.getter(textColumnsPanelAtom)
    expect(afterLoad.draft.delimiters).toBe('\t')
    expect(afterLoad.preview?.overwrittenCells).toBe(1)
    expect(afterLoad.preview?.target).toEqual({ rowStart: 1, colStart: 1, rowEnd: 3, colEnd: 3 })

    // Set column 3 (Amount) to General so 125 becomes number 125 while =1+2 stays literal text.
    await run({ type: 'columnNumber', value: '3' })
    await run({ type: 'columnType', kind: 'general' })
    await run('preview')
    expect(await run('apply')).toBe(false)
    expect(store.getter(textColumnsPanelAtom).error).toContain('Confirm overwriting')

    // Protection gate blocks locked destination before writing.
    await run({ type: 'overwrite', value: true })
    store.setter(setSheetProtectionAtom, {
      sheetId: 'orders',
      state: { mode: 'protected', unlockedRanges: [] },
    })
    expect(await run('apply')).toBe(false)
    expect(store.getter(textColumnsPanelAtom).error).toContain('locked')
    store.setter(setSheetProtectionAtom, {
      sheetId: 'orders',
      state: { mode: 'open', unlockedRanges: [] },
    })

    // Apply writes entire 3×3 rectangle atomically in one transaction.
    expect(await run('apply')).toBe(true)
    expect(store.getter(textColumnsPanelAtom).target).toBeNull()
    expect(api.getSelection().range).toEqual({ rowStart: 1, colStart: 1, rowEnd: 3, colEnd: 3 })

    const written = await api.read({
      targets: [{ sheetId: 'orders', range: { rowStart: 1, rowEnd: 3, colStart: 1, colEnd: 3 } }],
    })
    expect(written.status).toBe('ok')
    if (written.status === 'ok') {
      const byCoord = new Map(written.ranges[0]!.cells.map((c) => [`${c.row}:${c.col}`, c]))
      expect(byCoord.get('2:1')?.value).toEqual({ kind: 'string', value: 'North\tEast' })
      expect(byCoord.get('2:2')?.value).toEqual({ kind: 'string', value: '0042' })
      expect(byCoord.get('2:3')?.value).toEqual({ kind: 'number', value: 125 })
      expect(byCoord.get('3:3')?.value).toEqual({ kind: 'string', value: '=1+2' })
      expect(byCoord.get('3:3')?.formula).toBeUndefined()
    }

    // Single Undo restores C3='Existing' and clears all other imported cells; single Redo reapplies!
    expect((await api.undo()).status).toBe('ok')
    const undone = await api.read({
      targets: [{ sheetId: 'orders', range: { rowStart: 1, rowEnd: 3, colStart: 1, colEnd: 3 } }],
    })
    expect(undone.status === 'ok' && undone.ranges[0]?.cells).toEqual([
      expect.objectContaining({ row: 2, col: 2, value: { kind: 'string', value: 'Existing' } }),
    ])
    expect((await api.redo()).status).toBe('ok')
    const redone = await api.read({
      targets: [{ sheetId: 'orders', range: { rowStart: 2, rowEnd: 2, colStart: 2, colEnd: 3 } }],
    })
    expect(redone.status === 'ok' && redone.ranges[0]?.cells.map((c) => c.value)).toEqual([
      { kind: 'string', value: '0042' },
      { kind: 'number', value: 125 },
    ])
  })
})
