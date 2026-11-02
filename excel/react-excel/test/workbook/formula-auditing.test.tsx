import { createStore } from '@einfach/core'
import {
  activeWorkbookSheetAtom,
  initializeWorkbookDocumentAtom,
  selectCellAtom,
  selectionSnapshotAtom,
  type FormulaEvaluationTraceSnapshot,
  type RustFormulaAuditingTraceRequest,
  type RustWorkbookConnection,
} from '@einfach-excel/spreadsheet-ui-core'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import {
  EvaluateFormulaDialog,
  FormulaAuditingOverlay,
  FormulaAuditingToolbar,
  WatchWindowPanel,
} from '../../src/components/formula-auditing'
import { WorkbookStoreProvider } from '../../src/page/WorkbookStoreProvider'

function setupFormulaAuditingView() {
  const store = createStore()
  store.setter(initializeWorkbookDocumentAtom, {
    title: 'Auditing Book',
    sheets: [
      { id: 'sheet-1', index: 0, name: 'Sheet1', rowCount: 100, colCount: 20 },
      { id: 'sheet-2', index: 1, name: 'Sheet2', rowCount: 100, colCount: 20 },
    ],
  })
  store.setter(selectCellAtom, { sheetId: 'sheet-1', coord: { row: 0, col: 2 } })

  const request = vi.fn(async (command: string, payload: unknown) => {
    if (command === 'formulaAuditing.trace') {
      const req = payload as RustFormulaAuditingTraceRequest
      if (req.direction === 'precedents') {
        return {
          sourceIsError: false,
          items: [
            {
              sheetId: 'sheet-1',
              sheetIndex: 0,
              sheetName: 'Sheet1',
              rowStart: 0,
              colStart: 0,
              rowEnd: 1,
              colEnd: 0,
              isRange: true,
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
              isError: true,
            },
          ],
        }
      }
      return {
        sourceIsError: false,
        items: [
          {
            sheetId: 'sheet-1',
            sheetIndex: 0,
            sheetName: 'Sheet1',
            rowStart: 2,
            colStart: 2,
            rowEnd: 2,
            colEnd: 2,
            isRange: false,
            isError: true,
          },
        ],
      }
    }

    if (command === 'formulaAuditing.evaluate') {
      const req = payload as { sheetId: string; row: number; col: number }
      if (req.row === 0 && req.col === 1) {
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
          ],
        }
        return subTrace
      }
      const trace: FormulaEvaluationTraceSnapshot = {
        sheetId: 'sheet-1',
        sheetIndex: 0,
        sheetName: 'Sheet1',
        row: 0,
        col: 2,
        addr: 'C1',
        formula: '=B1+5',
        finalResult: '25',
        isError: false,
        steps: [
          {
            expressionBefore: '=B1+5',
            focusStart: 1,
            focusEnd: 3,
            stepResult: '20',
            expressionAfter: '=20+5',
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
            expressionBefore: '=20+5',
            focusStart: 1,
            focusEnd: 5,
            stepResult: '25',
            expressionAfter: '=25',
          },
        ],
      }
      return trace
    }

    if (command === 'formulaAuditing.watch') {
      const req = payload as {
        targets: readonly { sheetId: string; row: number; col: number }[]
      }
      return req.targets.map((target) => ({
        sheetId: target.sheetId,
        sheetIndex: target.sheetId === 'sheet-2' ? 1 : 0,
        sheetName: target.sheetId === 'sheet-2' ? 'Sheet2' : 'Sheet1',
        row: target.row,
        col: target.col,
        addr: target.sheetId === 'sheet-2' ? 'B5' : 'C1',
        name: target.sheetId === 'sheet-2' ? 'Rate' : '',
        value: target.sheetId === 'sheet-2' ? '50' : '25',
        formula: target.sheetId === 'sheet-2' ? '=25*2' : '=B1+5',
        isError: false,
      }))
    }

    throw new Error(`Unexpected command: ${command}`)
  })

  const view = render(
    <WorkbookStoreProvider
      store={store}
      connection={{
        request: request as RustWorkbookConnection['request'],
        dispose() {},
      }}
    >
      <FormulaAuditingToolbar />
      <FormulaAuditingOverlay />
      <EvaluateFormulaDialog />
      <WatchWindowPanel />
    </WorkbookStoreProvider>,
  )

  return { store, request, view }
}

describe('Formula Auditing React Suite', () => {
  test('renders SVG trace arrows, cross-sheet badge navigation, and Remove Arrows', async () => {
    const { store, view } = setupFormulaAuditingView()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Trace Precedents' }))
    })

    const overlay = view.container.querySelector('[data-auditing-overlay="true"]')
    expect(overlay).not.toBeNull()
    const arrows = view.container.querySelectorAll('[data-auditing-arrow]')
    expect(arrows.length).toBe(2)

    // Cross-sheet badge for Sheet2!B5 is rendered and navigates on click
    const badge = view.container.querySelector(
      '[data-auditing-cross-sheet="precedent"]',
    ) as HTMLButtonElement
    expect(badge).not.toBeNull()
    expect(badge.textContent).toContain('Sheet2!B5')

    await act(async () => {
      fireEvent.click(badge)
    })
    expect(store.getter(activeWorkbookSheetAtom)?.id).toBe('sheet-2')
    expect(store.getter(selectionSnapshotAtom).activeCell).toEqual({
      sheetId: 'sheet-2',
      row: 4,
      col: 1,
    })

    // Remove Arrows clears the overlay
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Remove Arrows' }))
    })
    expect(view.container.querySelector('[data-auditing-overlay="true"]')).toBeNull()
  })

  test('Evaluate Formula dialog underlines focused sub-expression and handles Step In, Step Out, Evaluate, and Restart', async () => {
    const { view } = setupFormulaAuditingView()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Evaluate Formula' }))
    })

    expect(screen.getByRole('dialog', { name: 'Evaluate Formula' })).toBeVisible()
    const focusEl = view.container.querySelector('[data-evaluate-focus="true"]')
    expect(focusEl?.textContent).toBe('B1')

    // Step In to B1
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Step In' }))
    })
    expect(view.container.querySelector('[data-evaluate-reference="true"]')?.textContent).toContain(
      'Sheet1!B1',
    )
    expect(view.container.querySelector('[data-evaluate-focus="true"]')?.textContent).toBe('A1')

    // Step Out back to C1 (now focused on 20+5)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Step Out' }))
    })
    expect(view.container.querySelector('[data-evaluate-reference="true"]')?.textContent).toContain(
      'Sheet1!C1',
    )
    expect(view.container.querySelector('[data-evaluate-focus="true"]')?.textContent).toBe('20+5')

    // Evaluate final step
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Evaluate' }))
    })
    expect(view.container.querySelector('[data-evaluate-final-result="true"]')?.textContent).toContain(
      '25',
    )

    // Restart returns to B1 focus
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Restart' }))
    })
    expect(view.container.querySelector('[data-evaluate-focus="true"]')?.textContent).toBe('B1')
  })

  test('Watch Window adds cells, displays Sheet/Name/Cell/Value/Formula, navigates on click, and deletes watches', async () => {
    const { store, view } = setupFormulaAuditingView()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Watch Window' }))
    })

    const input = screen.getByLabelText('Watch cell reference')
    await act(async () => {
      fireEvent.change(input, { target: { value: 'Sheet2!B5' } })
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Add Watch' }))
    })

    const row = view.container.querySelector('[data-watch-row="sheet-2:4:1"]') as HTMLElement
    expect(row).not.toBeNull()
    expect(row.querySelector('[data-watch-col="sheet"]')?.textContent).toBe('Sheet2')
    expect(row.querySelector('[data-watch-col="name"]')?.textContent).toBe('Rate')
    expect(row.querySelector('[data-watch-col="cell"]')?.textContent).toBe('B5')
    expect(row.querySelector('[data-watch-col="value"]')?.textContent).toBe('50')
    expect(row.querySelector('[data-watch-col="formula"]')?.textContent).toBe('=25*2')

    // Click row to navigate to Sheet2!B5
    await act(async () => {
      fireEvent.click(row)
    })
    expect(store.getter(activeWorkbookSheetAtom)?.id).toBe('sheet-2')
    expect(store.getter(selectionSnapshotAtom).activeCell).toEqual({
      sheetId: 'sheet-2',
      row: 4,
      col: 1,
    })

    // Delete Watch removes the entry
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Delete Watch' }))
    })
    expect(view.container.querySelector('[data-watch-row="sheet-2:4:1"]')).toBeNull()
  })
})
