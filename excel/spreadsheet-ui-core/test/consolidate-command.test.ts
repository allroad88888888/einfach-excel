import { atom } from '@einfach/core'
import { describe, expect, test, vi } from 'vitest'
import { isPersistentHostCommand } from '../src/host/policy'
import { applyConsolidate, previewConsolidate } from '../src/rust-workbook/consolidate-io'
import {
  activateSheetTabAtom,
  applyConsolidateAtom,
  createSpreadsheetUi,
  initializeWorkbookDocumentAtom,
  previewConsolidateAtom,
  runVisibleProjectionAtom,
  selectCellAtom,
  setSelectionBoundsAtom,
  type RustWorkbookConnection,
  type VisibleProjectionRequest,
} from '../src'

describe('consolidate UI core contract', () => {
  test('policy marks consolidate.preview read-only and consolidate.apply persistent', () => {
    expect(isPersistentHostCommand('consolidate.preview')).toBe(false)
    expect(isPersistentHostCommand('consolidate.apply')).toBe(true)
  })

  test('consolidate IO validates function, sources, bounds, and revision witness', () => {
    const sheets = new Map([
      ['q1', { id: 'q1', index: 0, name: 'Q1', rowCount: 100, colCount: 10 }],
      ['sum', { id: 'sum', index: 1, name: 'Summary', rowCount: 100, colCount: 10 }],
    ])
    const workbook = {
      preview_consolidate: vi.fn(() => ({
        target: { rowStart: 0, rowEnd: 1, colStart: 0, colEnd: 1 },
        rowCount: 2,
        colCount: 2,
        overwrittenCells: 0,
        sample: [['Item', 'Sales'], ['Apples', '35']],
        sampleTruncated: false,
      })),
      apply_consolidate: vi.fn(() => ({
        target: { rowStart: 0, rowEnd: 1, colStart: 0, colEnd: 1 },
        changedCells: 4,
        linkedGroups: 0,
      })),
      read_sparse_range: vi.fn(),
      snapshot_format_range: vi.fn(),
    } as never

    const validRequest = {
      function: 'sum' as const,
      sources: [{ sheetId: 'q1', range: { rowStart: 0, rowEnd: 2, colStart: 0, colEnd: 1 } }],
      sheetId: 'sum',
      destination: { row: 0, col: 0 },
      topRow: true,
      leftColumn: true,
      createLinks: false,
    }

    const preview = previewConsolidate(workbook, sheets, validRequest, 3)
    expect(preview.revision).toBe(3)
    expect(preview.rowCount).toBe(2)

    expect(() =>
      previewConsolidate(workbook, sheets, { ...validRequest, sources: [] }, 3),
    ).toThrow('Add between 1 and 32 source ranges to consolidate.')

    expect(() =>
      previewConsolidate(
        workbook,
        sheets,
        { ...validRequest, destination: { row: 200, col: 0 } },
        3,
      ),
    ).toThrow('Choose a destination cell within the worksheet.')

    const projection: VisibleProjectionRequest = {
      kind: 'visible-window',
      sheetId: 'sum',
      requestId: 1,
      reason: 'toolbar',
      window: { rowStart: 0, rowEnd: 10, colStart: 0, colEnd: 5 },
      viewport: { width: 800, height: 600, scrollLeft: 0, scrollTop: 0 },
    }
    expect(() =>
      applyConsolidate(workbook, sheets, { ...validRequest, expectedRevision: 2, projection }, 3),
    ).toThrow('The workbook changed. Preview the consolidated output again.')

    const applied = applyConsolidate(
      workbook,
      sheets,
      { ...validRequest, expectedRevision: 3, projection },
      3,
    )
    expect(applied.changedCells).toBe(4)
  })

  test('previewConsolidateAtom and applyConsolidateAtom enforce overwrite confirmation and apply projection', async () => {
    const calls: { command: string; payload: unknown }[] = []
    const request = vi.fn(async (command: string, payload: unknown) => {
      calls.push({ command, payload })
      if (command === 'consolidate.preview') {
        return {
          target: { rowStart: 0, rowEnd: 1, colStart: 0, colEnd: 1 },
          rowCount: 2,
          colCount: 2,
          overwrittenCells: 2,
          sample: [['Item', 'Total'], ['Apples', '35']],
          sampleTruncated: false,
          revision: 1,
        }
      }
      if (command === 'consolidate.apply') {
        return {
          target: { rowStart: 0, rowEnd: 1, colStart: 0, colEnd: 1 },
          changedCells: 4,
          linkedGroups: 1,
          projection: {
            ...(payload as { projection: VisibleProjectionRequest }).projection,
            revision: 2,
            cells: [
              { row: 1, col: 1, valueKind: 'number', displayValue: '35', rawValue: 35 },
            ],
          },
        }
      }
      return {
        ...(payload as { request: VisibleProjectionRequest }).request,
        revision: 1,
        cells: [],
      }
    })

    const connection: RustWorkbookConnection = {
      request: request as RustWorkbookConnection['request'],
      dispose() {},
    }
    const core = createSpreadsheetUi({ connection })
    core.store.setter(initializeWorkbookDocumentAtom, {
      title: 'Test',
      sheets: [
        { id: 'q1', index: 0, name: 'Q1', rowCount: 50, colCount: 10 },
        { id: 'summary', index: 1, name: 'Summary', rowCount: 50, colCount: 10 },
      ],
    })
    core.store.setter(activateSheetTabAtom, { sheetId: 'summary' })
    core.store.setter(setSelectionBoundsAtom, { rowCount: 50, colCount: 10 })
    core.store.setter(selectCellAtom, { sheetId: 'summary', coord: { row: 0, col: 0 } })
    await core.store.setter(runVisibleProjectionAtom, {
      sheetId: 'summary',
      reason: 'viewport',
      window: { rowStart: 0, rowEnd: 10, colStart: 0, colEnd: 5 },
    })

    const preview = await core.store.setter(previewConsolidateAtom, {
      function: 'sum',
      references: ['Q1!A1:B3'],
      topRow: true,
      leftColumn: true,
      createLinks: true,
    })
    expect(preview.overwrittenCells).toBe(2)
    expect(preview.request.sources).toEqual([
      { sheetId: 'q1', range: { rowStart: 0, rowEnd: 2, colStart: 0, colEnd: 1 } },
    ])

    const catchApply = atom(null, async (_get, set) => {
      try {
        await set(applyConsolidateAtom, { preview, confirmOverwrite: false })
        return null
      } catch (error) {
        return error
      }
    })
    const overwriteError = await core.store.setter(catchApply)
    expect(overwriteError).toBeInstanceOf(Error)
    expect((overwriteError as Error).message).toBe(
      'Confirm overwriting the occupied destination cells before consolidating.',
    )

    const report = await core.store.setter(applyConsolidateAtom, {
      preview,
      confirmOverwrite: true,
    })
    expect(report).toEqual({
      target: { rowStart: 0, rowEnd: 1, colStart: 0, colEnd: 1 },
      changedCells: 4,
      linkedGroups: 1,
    })
    const applyCall = calls.find((entry) => entry.command === 'consolidate.apply')
    expect(applyCall?.payload).toMatchObject({
      expectedRevision: 1,
      approval: { count: 2, target: { rowStart: 0, rowEnd: 1, colStart: 0, colEnd: 1 } },
    })
  })
})
