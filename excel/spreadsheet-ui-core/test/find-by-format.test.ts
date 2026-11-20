import { describe, expect, test, vi } from 'vitest'
import {
  createSpreadsheetUi,
  extractFormatFromCell,
  findReplacePanelAtom,
  hasFindFormatCriteria,
  initializeWorkbookDocumentAtom,
  runFindReplaceAtom,
  runVisibleProjectionAtom,
  selectCellAtom,
  type RustWorkbookConnection,
  type VisibleProjectionRequest,
} from '../src'

describe('find and replace by format UI core', () => {
  test('extractFormatFromCell captures explicit cell style attributes cleanly', () => {
    expect(extractFormatFromCell(undefined)).toBeUndefined()
    expect(extractFormatFromCell({ numberFormat: { kind: 'general' } })).toBeUndefined()
    expect(
      extractFormatFromCell({
        bold: true,
        italic: true,
        bgColor: '#FFF2CC',
        fgColor: '#C00000',
        align: 'centerAcross',
        numberFormat: { kind: 'percentage', digits: 1 },
      }),
    ).toEqual({
      bold: true,
      italic: true,
      bgColor: '#fff2cc',
      textColor: '#c00000',
      align: 'center-across',
      numberFormat: 'percent',
    })
    expect(hasFindFormatCriteria({})).toBe(false)
    expect(hasFindFormatCriteria({ bold: true })).toBe(true)
  })

  test('supports format-only find, sample from active cell, and format-only replace', async () => {
    const requests: { command: string; payload: unknown }[] = []
    const request = vi.fn(async (command: string, payload: unknown) => {
      requests.push({ command, payload })
      if (command === 'workbook.find') {
        return {
          total: 1,
          revision: 1,
          matches: [{ sheetId: 's1', row: 0, col: 0, start: 0, end: 4 }],
        }
      }
      if (command === 'workbook.replace') {
        return {
          cells: 1,
          occurrences: 1,
          projection: {
            ...(payload as { projection: VisibleProjectionRequest }).projection,
            revision: 2,
            cells: [],
          },
          sizes: { rowHeights: [], colWidths: [] },
        }
      }
      return {
        ...(payload as { request: VisibleProjectionRequest }).request,
        revision: 1,
        cells: [
          {
            row: 0,
            col: 0,
            valueKind: 'text',
            displayValue: 'Warn',
            rawValue: 'Warn',
            format: { bold: true, bgColor: '#fff2cc' },
          },
        ],
      }
    })

    const connection: RustWorkbookConnection = {
      request: request as RustWorkbookConnection['request'],
      dispose() {},
    }
    const core = createSpreadsheetUi({ connection })
    core.store.setter(initializeWorkbookDocumentAtom, {
      title: 'Book',
      sheets: [{ id: 's1', index: 0, name: 'Sheet1', rowCount: 20, colCount: 10 }],
    })
    core.store.setter(selectCellAtom, { sheetId: 's1', coord: { row: 0, col: 0 } })
    await core.store.setter(runVisibleProjectionAtom, {
      sheetId: 's1',
      reason: 'viewport',
      window: { rowStart: 0, rowEnd: 10, colStart: 0, colEnd: 5 },
    })

    await core.store.setter(runFindReplaceAtom, { open: 'replace' })
    expect(await core.store.setter(runFindReplaceAtom, 'sample-find-format')).toBe(true)
    expect(core.store.getter(findReplacePanelAtom).form.format).toEqual({
      bold: true,
      bgColor: '#fff2cc',
    })

    // Format-only find succeeds with empty needle
    expect(await core.store.setter(runFindReplaceAtom, 'next')).toBe(true)
    const findReq = requests.find((entry) => entry.command === 'workbook.find')
    expect(findReq?.payload).toMatchObject({
      query: { needle: '', format: { bold: true, bgColor: '#fff2cc' } },
    })

    // Format-only replace without replaceFormat fails cleanly
    expect(await core.store.setter(runFindReplaceAtom, 'replace-all')).toBe(false)
    expect(core.store.getter(findReplacePanelAtom).error).toBe(
      'Choose a replacement format or enter text to find.',
    )

    // Set replaceFormat and run replace-all
    await core.store.setter(runFindReplaceAtom, {
      form: { replaceFormat: { bgColor: '#dcfce7', bold: false } },
    })
    expect(await core.store.setter(runFindReplaceAtom, 'replace-all')).toBe(true)
    const replaceReq = requests.find((entry) => entry.command === 'workbook.replace')
    expect(replaceReq?.payload).toMatchObject({
      query: { needle: '', format: { bold: true, bgColor: '#fff2cc' } },
      replaceFormat: { bgColor: '#dcfce7', bold: false },
    })
  })
})
