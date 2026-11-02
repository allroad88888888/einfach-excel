import { describe, expect, test, vi } from 'vitest'
import {
  activeSheetTraceArrowsAtom,
  activeWorkbookSheetAtom,
  createSpreadsheetUi,
  evaluateFormulaDialogAtom,
  initializeWorkbookDocumentAtom,
  runEvaluateFormulaAtom,
  runTraceAuditingAtom,
  runVisibleProjectionAtom,
  runWatchWindowAtom,
  selectCellAtom,
  selectionSnapshotAtom,
  traceArrowsAtom,
  watchEntriesAtom,
  watchWindowPanelAtom,
  type FormulaEvaluationTraceSnapshot,
  type RustFormulaAuditingTraceRequest,
  type RustWorkbookConnection,
  type VisibleProjectionRequest,
} from '../src'

function createAuditingTestHarness() {
  let sheet2B5Value = '50'
  let sheet2B5Formula = '=25*2'

  const request = vi.fn(async (command: string, payload: unknown) => {
    if (command === 'projection.readVisible') {
      const req = (payload as { request: VisibleProjectionRequest }).request
      return {
        ...req,
        cells: [],
        revision: (req.revision ?? 0) + 1,
      }
    }

    if (command === 'formulaAuditing.trace') {
      const req = payload as RustFormulaAuditingTraceRequest
      if (req.direction === 'precedents') {
        if (req.sheetId === 'sheet-1' && req.row === 0 && req.col === 2) {
          // C1 = B1 + Sheet2!B5
          return {
            sourceIsError: false,
            items: [
              {
                sheetId: 'sheet-1',
                sheetIndex: 0,
                sheetName: 'Sheet1',
                rowStart: 0,
                colStart: 1,
                rowEnd: 0,
                colEnd: 1,
                isRange: false,
                isError: false,
              },
              {
                sheetId: 'sheet-2',
                sheetIndex: 1,
                sheetName: 'Sheet2',
                rowStart: 4,
                colStart: 1,
                rowEnd: 4,
                colEnd: 1,
                isRange: false,
                isError: false,
              },
            ],
          }
        }
        if (req.sheetId === 'sheet-1' && req.row === 0 && req.col === 1) {
          // B1 = A1 * 2 (level 2 precedent)
          return {
            sourceIsError: false,
            items: [
              {
                sheetId: 'sheet-1',
                sheetIndex: 0,
                sheetName: 'Sheet1',
                rowStart: 0,
                colStart: 0,
                rowEnd: 0,
                colEnd: 0,
                isRange: false,
                isError: false,
              },
            ],
          }
        }
      } else {
        // dependents of A1 -> B1 -> C1 (with error on D1)
        if (req.sheetId === 'sheet-1' && req.row === 0 && req.col === 0) {
          return {
            sourceIsError: false,
            items: [
              {
                sheetId: 'sheet-1',
                sheetIndex: 0,
                sheetName: 'Sheet1',
                rowStart: 0,
                colStart: 1,
                rowEnd: 0,
                colEnd: 1,
                isRange: false,
                isError: false,
              },
            ],
          }
        }
        if (req.sheetId === 'sheet-1' && req.row === 0 && req.col === 1) {
          return {
            sourceIsError: false,
            items: [
              {
                sheetId: 'sheet-1',
                sheetIndex: 0,
                sheetName: 'Sheet1',
                rowStart: 0,
                colStart: 3,
                rowEnd: 0,
                colEnd: 3,
                isRange: false,
                isError: true,
              },
            ],
          }
        }
      }
      return { sourceIsError: false, items: [] }
    }

    if (command === 'formulaAuditing.evaluate') {
      const req = payload as { sheetId: string; row: number; col: number }
      if (req.sheetId === 'sheet-1' && req.row === 0 && req.col === 2) {
        const trace: FormulaEvaluationTraceSnapshot = {
          sheetId: 'sheet-1',
          sheetIndex: 0,
          sheetName: 'Sheet1',
          row: 0,
          col: 2,
          addr: 'C1',
          formula: '=SUM(A1:A2)+B1*2',
          finalResult: '70',
          isError: false,
          steps: [
            {
              expressionBefore: '=SUM(A1:A2)+B1*2',
              focusStart: 1,
              focusEnd: 11,
              stepResult: '30',
              expressionAfter: '=30+B1*2',
            },
            {
              expressionBefore: '=30+B1*2',
              focusStart: 4,
              focusEnd: 6,
              stepResult: '20',
              expressionAfter: '=30+20*2',
              stepInTarget: {
                sheetId: 'sheet-1',
                sheetIndex: 0,
                sheetName: 'Sheet1',
                row: 0,
                col: 1,
                addr: 'B1',
              },
            },
            {
              expressionBefore: '=30+20*2',
              focusStart: 4,
              focusEnd: 8,
              stepResult: '40',
              expressionAfter: '=30+40',
            },
            {
              expressionBefore: '=30+40',
              focusStart: 1,
              focusEnd: 6,
              stepResult: '70',
              expressionAfter: '=70',
            },
          ],
        }
        return trace
      }
      if (req.sheetId === 'sheet-1' && req.row === 0 && req.col === 1) {
        const subTrace: FormulaEvaluationTraceSnapshot = {
          sheetId: 'sheet-1',
          sheetIndex: 0,
          sheetName: 'Sheet1',
          row: 0,
          col: 1,
          addr: 'B1',
          formula: '=A1*2',
          finalResult: '20',
          isError: false,
          steps: [
            {
              expressionBefore: '=A1*2',
              focusStart: 1,
              focusEnd: 3,
              stepResult: '10',
              expressionAfter: '=10*2',
            },
            {
              expressionBefore: '=10*2',
              focusStart: 1,
              focusEnd: 5,
              stepResult: '20',
              expressionAfter: '=20',
            },
          ],
        }
        return subTrace
      }
    }

    if (command === 'formulaAuditing.watch') {
      const req = payload as {
        targets: readonly { sheetId: string; row: number; col: number }[]
      }
      return req.targets.map((target) => {
        if (target.sheetId === 'sheet-2' && target.row === 4 && target.col === 1) {
          return {
            sheetId: 'sheet-2',
            sheetIndex: 1,
            sheetName: 'Sheet2',
            row: 4,
            col: 1,
            addr: 'B5',
            name: 'TaxRateCell',
            value: sheet2B5Value,
            formula: sheet2B5Formula,
            isError: false,
          }
        }
        return {
          sheetId: target.sheetId,
          sheetIndex: 0,
          sheetName: 'Sheet1',
          row: target.row,
          col: target.col,
          addr: 'A1',
          value: '10',
          formula: '',
          isError: false,
        }
      })
    }

    throw new Error(`Unexpected command: ${command}`)
  })

  const { store } = createSpreadsheetUi({
    connection: {
      request: request as RustWorkbookConnection['request'],
      dispose() {},
    },
  })

  store.setter(initializeWorkbookDocumentAtom, {
    title: 'Auditing Book',
    sheets: [
      { id: 'sheet-1', name: 'Sheet1', index: 0, rowCount: 100, colCount: 20 },
      { id: 'sheet-2', name: 'Sheet2', index: 1, rowCount: 100, colCount: 20 },
    ],
  })

  return {
    store,
    request,
    setSheet2B5(value: string, formula: string) {
      sheet2B5Value = value
      sheet2B5Formula = formula
    },
  }
}

describe('Formula Auditing UI Core suite', () => {
  test('Trace Precedents and Trace Dependents expand multi-level arrows, mark error/cross-sheet arrows, navigate, and Remove Arrows clears state', async () => {
    const { store } = createAuditingTestHarness()
    await store.setter(runVisibleProjectionAtom, {
      sheetId: 'sheet-1',
      reason: 'viewport',
      window: { rowStart: 0, rowEnd: 9, colStart: 0, colEnd: 7 },
    })

    // Select C1 (row 0, col 2) and trace precedents level 1
    store.setter(selectCellAtom, { sheetId: 'sheet-1', coord: { row: 0, col: 2 } })
    expect(await store.setter(runTraceAuditingAtom, 'trace-precedents')).toBe(true)

    const level1Arrows = store.getter(traceArrowsAtom)
    expect(level1Arrows).toHaveLength(2)
    expect(level1Arrows.some((a) => !a.isCrossSheet && a.level === 1)).toBe(true)
    expect(level1Arrows.some((a) => a.isCrossSheet && a.fromSheetId === 'sheet-2')).toBe(true)

    // Clicking Trace Precedents again on C1 expands level 2 (B1 -> A1)
    expect(await store.setter(runTraceAuditingAtom, 'trace-precedents')).toBe(true)
    const level2Arrows = store.getter(traceArrowsAtom)
    expect(level2Arrows).toHaveLength(3)
    expect(level2Arrows.some((a) => a.level === 2 && a.fromRange.colStart === 0)).toBe(true)

    // Select A1 (row 0, col 0) and trace dependents level 1 -> level 2 (error arrow on D1)
    store.setter(selectCellAtom, { sheetId: 'sheet-1', coord: { row: 0, col: 0 } })
    expect(await store.setter(runTraceAuditingAtom, 'trace-dependents')).toBe(true)
    expect(await store.setter(runTraceAuditingAtom, 'trace-dependents')).toBe(true)
    const allArrows = store.getter(activeSheetTraceArrowsAtom)
    expect(allArrows.some((a) => a.direction === 'dependents' && a.isError)).toBe(true)

    // Navigate via cross-sheet arrow target to Sheet2!B5
    expect(
      await store.setter(runTraceAuditingAtom, {
        navigate: { sheetId: 'sheet-2', row: 4, col: 1 },
      }),
    ).toBe(true)
    expect(store.getter(activeWorkbookSheetAtom)?.id).toBe('sheet-2')
    expect(store.getter(selectionSnapshotAtom).activeCell).toEqual({
      sheetId: 'sheet-2',
      row: 4,
      col: 1,
    })

    // Remove Arrows clears all trace arrows
    expect(await store.setter(runTraceAuditingAtom, 'remove-arrows')).toBe(true)
    expect(store.getter(traceArrowsAtom)).toHaveLength(0)
  })

  test('Evaluate Formula steps through inner sub-expressions, supports Step In / Step Out, and Restart', async () => {
    const { store } = createAuditingTestHarness()
    store.setter(selectCellAtom, { sheetId: 'sheet-1', coord: { row: 0, col: 2 } })

    expect(await store.setter(runEvaluateFormulaAtom, 'open')).toBe(true)
    let dialog = store.getter(evaluateFormulaDialogAtom)
    expect(dialog.open).toBe(true)
    expect(dialog.currentExpression).toBe('=SUM(A1:A2)+B1*2')
    expect(dialog.focusSpan).toEqual({ start: 1, end: 11 })
    expect(dialog.canStepIn).toBe(false)

    // Step 1 -> evaluates SUM(A1:A2) => 30, next focus is B1 (canStepIn = true!)
    expect(await store.setter(runEvaluateFormulaAtom, 'evaluate')).toBe(true)
    dialog = store.getter(evaluateFormulaDialogAtom)
    expect(dialog.currentExpression).toBe('=30+B1*2')
    expect(dialog.focusSpan).toEqual({ start: 4, end: 6 })
    expect(dialog.canStepIn).toBe(true)

    // Step In to B1 (=A1*2)
    expect(await store.setter(runEvaluateFormulaAtom, 'step-in')).toBe(true)
    dialog = store.getter(evaluateFormulaDialogAtom)
    expect(dialog.trace?.addr).toBe('B1')
    expect(dialog.currentExpression).toBe('=A1*2')
    expect(dialog.canStepOut).toBe(true)

    // Step Out back to C1; B1 is now replaced by 20, focused on 20*2
    expect(await store.setter(runEvaluateFormulaAtom, 'step-out')).toBe(true)
    dialog = store.getter(evaluateFormulaDialogAtom)
    expect(dialog.trace?.addr).toBe('C1')
    expect(dialog.currentExpression).toBe('=30+20*2')
    expect(dialog.focusSpan).toEqual({ start: 4, end: 8 })

    // Restart resets back to step 0
    expect(await store.setter(runEvaluateFormulaAtom, 'restart')).toBe(true)
    dialog = store.getter(evaluateFormulaDialogAtom)
    expect(dialog.stepIndex).toBe(0)
    expect(dialog.currentExpression).toBe('=SUM(A1:A2)+B1*2')
  })

  test('Watch Window adds selection and cross-sheet references, auto-updates on projection revision, and navigates on click', async () => {
    const { store, setSheet2B5 } = createAuditingTestHarness()
    store.setter(selectCellAtom, { sheetId: 'sheet-1', coord: { row: 0, col: 0 } })

    // Add current selection (Sheet1!A1)
    expect(await store.setter(runWatchWindowAtom, 'add-selection')).toBe(true)
    // Add cross-sheet cell Sheet2!B5
    expect(await store.setter(runWatchWindowAtom, { addReference: 'Sheet2!B5' })).toBe(true)

    let entries = store.getter(watchEntriesAtom)
    expect(entries).toHaveLength(2)
    expect(entries[1]).toMatchObject({
      sheetId: 'sheet-2',
      sheetName: 'Sheet2',
      addr: 'B5',
      name: 'TaxRateCell',
      value: '50',
      formula: '=25*2',
    })

    // Simulate workbook edit/recalculation settling a new visible projection on Sheet1
    setSheet2B5('75', '=25*3')
    await store.setter(runVisibleProjectionAtom, {
      sheetId: 'sheet-1',
      reason: 'viewport',
      window: { rowStart: 0, rowEnd: 9, colStart: 0, colEnd: 7 },
    })

    entries = store.getter(watchEntriesAtom)
    expect(entries[1]?.value).toBe('75')
    expect(entries[1]?.formula).toBe('=25*3')

    // Navigate to watched cell Sheet2!B5
    expect(await store.setter(runWatchWindowAtom, { navigate: entries[1]!.id })).toBe(true)
    expect(store.getter(activeWorkbookSheetAtom)?.id).toBe('sheet-2')
    expect(store.getter(selectionSnapshotAtom).activeCell).toEqual({
      sheetId: 'sheet-2',
      row: 4,
      col: 1,
    })

    // Delete selected watch entry
    expect(await store.setter(runWatchWindowAtom, 'delete-selected')).toBe(true)
    expect(store.getter(watchWindowPanelAtom).entries).toHaveLength(1)
  })
})
