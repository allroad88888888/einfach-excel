import { afterEach, describe, expect, test } from 'vitest'
import {
  richTextPanelAtom,
  runRichTextAtom,
  setSheetProtectionAtom,
  type RichTextRun,
} from '../../src'
import { setupRealWorkbookApi } from './wasm-runtime-fixture'

const cleanups: (() => void)[] = []
afterEach(() => {
  while (cleanups.length) cleanups.pop()!()
})

async function boot() {
  const ctx = await setupRealWorkbookApi()
  cleanups.push(ctx.dispose)
  return ctx
}

describe('createWorkbookApi: setRichText & openRichTextEditor', () => {
  test('commits multi-run rich text as one native undoable transaction and validates run/char limits', async () => {
    const { api } = await boot()
    const events: string[] = []
    cleanups.push(
      api.onChange((event) => {
        if (event) events.push(`${event.source}:${event.kind}`)
      }),
    )

    const runs: RichTextRun[] = [
      { text: 'Quarterly ', format: { bold: true, fontFamily: 'Arial', fontSize: 14 } },
      {
        text: 'Report',
        format: { italic: true, underline: true, strikethrough: true, color: '#ff0000' },
      },
    ]
    const ok = await api.setRichText('orders', 0, 0, runs)
    expect(ok).toMatchObject({ status: 'ok', changed: true })
    expect(events).toContain('api:host.rich-text')

    const display = await api.readDisplay({
      sheetId: 'orders',
      range: { rowStart: 0, rowEnd: 0, colStart: 0, colEnd: 0 },
    })
    expect(display.status).toBe('ok')
    if (display.status === 'ok') {
      expect(display.snapshot.cells[0]?.displayValue).toBe('Quarterly Report')
      expect(display.snapshot.cells[0]?.richText).toEqual([
        { text: 'Quarterly ', format: { bold: true, fontFamily: 'Arial', fontSize: 14 } },
        {
          text: 'Report',
          format: { italic: true, underline: true, strikethrough: true, color: '#FF0000' },
        },
      ])
    }

    // Undo and Redo revert and restore the cell in one native history step.
    expect((await api.undo()).status).toBe('ok')
    const undone = await api.readDisplay({
      sheetId: 'orders',
      range: { rowStart: 0, rowEnd: 0, colStart: 0, colEnd: 0 },
    })
    expect(undone.status === 'ok' && undone.snapshot.cells).toHaveLength(0)
    expect((await api.redo()).status).toBe('ok')
    const redone = await api.readDisplay({
      sheetId: 'orders',
      range: { rowStart: 0, rowEnd: 0, colStart: 0, colEnd: 0 },
    })
    expect(redone.status === 'ok' && redone.snapshot.cells[0]?.richText).toHaveLength(2)

    // > 1,024 distinct runs is rejected without mutating cell B1.
    const overRuns: RichTextRun[] = Array.from({ length: 1025 }, (_, i) => ({
      text: 'a',
      format: { bold: i % 2 === 0 },
    }))
    const tooManyRuns = await api.setRichText('orders', 0, 1, overRuns)
    expect(tooManyRuns.status).toBe('error')

    // > 32,767 characters is rejected without mutating cell B1; exactly 32,767 succeeds.
    const overChars = await api.setRichText('orders', 0, 1, [
      { text: 'x'.repeat(32_768), format: { bold: true } },
    ])
    expect(overChars.status).toBe('error')
    const maxChars = await api.setRichText('orders', 0, 1, [
      { text: 'x'.repeat(32_767), format: { bold: true } },
    ])
    expect(maxChars).toMatchObject({ status: 'ok', changed: true })

    // Formula cells reject setRichText.
    await api.write({
      cells: [{ sheetId: 'orders', row: 1, col: 0, input: { kind: 'formula', formula: '=1+1' } }],
    })
    expect((await api.setRichText('orders', 1, 0, [{ text: 'No', format: { bold: true } }])).status).toBe(
      'error',
    )
  })

  test('openRichTextEditor opens on text/blank cells, blocks numeric/formula cells, and enforces draft limits', async () => {
    const { store, api } = await boot()
    await api.write({
      cells: [
        { sheetId: 'orders', row: 0, col: 0, input: { kind: 'literal', value: { kind: 'string', value: 'Hello world' } } },
        { sheetId: 'orders', row: 0, col: 1, input: { kind: 'literal', value: { kind: 'number', value: 123 } } },
        { sheetId: 'orders', row: 0, col: 2, input: { kind: 'formula', formula: '=B1*2' } },
      ],
    })

    // Numeric and formula cells reject openRichTextEditor.
    api.select({ sheetId: 'orders', range: { rowStart: 0, rowEnd: 0, colStart: 1, colEnd: 1 } })
    expect(await api.openRichTextEditor()).toBe(false)
    api.select({ sheetId: 'orders', range: { rowStart: 0, rowEnd: 0, colStart: 2, colEnd: 2 } })
    expect(await api.openRichTextEditor()).toBe(false)

    // Text cell opens editor, enforces 32,767-char & NUL checks, formats selection and saves.
    api.select({ sheetId: 'orders', range: { rowStart: 0, rowEnd: 0, colStart: 0, colEnd: 0 } })
    expect(await api.openRichTextEditor()).toBe(true)
    expect(store.getter(richTextPanelAtom)).toMatchObject({ open: true, text: 'Hello world' })

    expect(
      await store.setter(runRichTextAtom, { text: 'a'.repeat(32_768), start: 0, end: 0 }),
    ).toBe(false)
    expect(store.getter(richTextPanelAtom).error).toContain('cell size limit')
    expect(await store.setter(runRichTextAtom, { text: 'bad\0char', start: 0, end: 0 })).toBe(false)

    expect(await store.setter(runRichTextAtom, { selection: [0, 5] })).toBe(true)
    expect(await store.setter(runRichTextAtom, { format: { bold: true, color: '#0055aa' } })).toBe(
      true,
    )
    expect(await store.setter(runRichTextAtom, 'save')).toBe(true)
    expect(store.getter(richTextPanelAtom).open).toBe(false)

    const saved = await api.readDisplay({
      sheetId: 'orders',
      range: { rowStart: 0, rowEnd: 0, colStart: 0, colEnd: 0 },
    })
    expect(saved.status === 'ok' && saved.snapshot.cells[0]?.richText).toEqual([
      { text: 'Hello', format: { bold: true, color: '#0055AA' } },
      { text: ' world', format: {} },
    ])
  })
})

describe('createWorkbookApi: openFormulaDialog / formulaDialog / getFormulaDialog', () => {
  test('normalizes function name, edits repeating groups, validates required args, guards protection and confirms', async () => {
    const { store, api } = await boot()
    expect(api.getFormulaDialog().open).toBe(false)
    expect(api.openFormulaDialog('unknown_fn_xyz')).toBe(false)

    // Normalizes whitespace and lowercase; IF validates required arguments before confirming.
    expect(api.openFormulaDialog('  if ')).toBe(true)
    expect(api.getFormulaDialog()).toMatchObject({
      open: true,
      spec: { name: 'IF' },
    })
    expect(api.formulaDialog('confirm')).toBe(false)
    expect(api.getFormulaDialog().error).not.toBe('')
    expect(api.getFormulaDialog().errorField).toBe(0)

    // SUM supports repeating argument groups.
    expect(api.openFormulaDialog('  sum ')).toBe(true)
    expect(api.getFormulaDialog()).toMatchObject({
      open: true,
      spec: { name: 'SUM' },
      formula: '=SUM()',
    })

    // Add a second group and fill both fields.
    expect(api.formulaDialog({ field: 0, value: 'A1:A5' })).toBe(true)
    expect(api.formulaDialog('add-group')).toBe(true)
    const countAfterAdd = api.getFormulaDialog().groupCount
    expect(api.formulaDialog({ field: countAfterAdd - 1, value: 'B1:B5' })).toBe(true)
    expect(api.getFormulaDialog().formula).toBe('=SUM(A1:A5,B1:B5)')

    // Protected locked target blocks confirm without closing dialog.
    store.setter(setSheetProtectionAtom, {
      sheetId: 'orders',
      state: { mode: 'protected', unlockedRanges: [] },
    })
    expect(api.formulaDialog('confirm')).toBe(false)
    expect(api.getFormulaDialog().error).toContain('locked')
    store.setter(setSheetProtectionAtom, { sheetId: 'orders', state: { mode: 'open', unlockedRanges: [] } })

    // Confirm closes dialog and opens formula-bar editing draft on the active cell.
    expect(api.formulaDialog('confirm')).toBe(true)
    expect(api.getFormulaDialog().open).toBe(false)
    expect(api.getEditing()).toMatchObject({
      draft: '=SUM(A1:A5,B1:B5)',
      source: { sheetId: 'orders', cell: { row: 0, col: 0 }, source: 'formula-bar' },
    })
    api.cancelEditing()

    // Reopen and close explicitly.
    expect(api.openFormulaDialog('IF')).toBe(true)
    expect(api.formulaDialog('close')).toBe(true)
    expect(api.getFormulaDialog().open).toBe(false)
  })
})
