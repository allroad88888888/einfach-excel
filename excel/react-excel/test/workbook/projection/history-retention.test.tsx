import { expect, test, vi } from 'vitest'
import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import {
  rustHistoryStateAtom, type RustWorkbookCommands, type RustWorkbookConnection,
  type VisibleProjectionRequest,
} from '@einfach-excel/spreadsheet-ui-core'
import { createTestRustWorkbookConnection } from '../../support/rust-workbook-connection'
import {
  deferredProjection, projectionResultFor, renderSalesOrdersProjectionWorksheet,
} from '../../support/projection-harness'

test.each(['Control', 'Meta'])('%s+Z is dispatched while a new viewport is pending', async (modifier) => {
  const gate = deferredProjection<void>()
  const historyGate = deferredProjection<void>()
  const range = { rowStart: 1, rowEnd: 1, colStart: 1, colEnd: 1 }
  const entries = [{ label: 'Edit cell', sheetIndex: 0, range }]
  const history = (undoCount: number) => ({
    undoCount, redoCount: 1 - undoCount, entries, notice: null,
  })
  const read = vi.fn(async (request: VisibleProjectionRequest) => ({
    ...projectionResultFor(request), history: history(1),
  }))
  const base = createTestRustWorkbookConnection({ readVisibleProjection: read })
  const apply = vi.fn(async (input: RustWorkbookCommands['history.apply']['payload']) => {
    await historyGate.promise
    return { sheetId: 'orders', range, sizes: { rowHeights: [], colWidths: [] },
      projection: { ...projectionResultFor(input.projection), history: history(0) } }
  })
  const connection = { ...base, request: (async (command: string, input: unknown) => command === 'history.apply'
    ? apply(input as RustWorkbookCommands['history.apply']['payload'])
    : base.request(command as keyof RustWorkbookCommands, input as never)) as RustWorkbookConnection['request'] }
  const store = renderSalesOrdersProjectionWorksheet(connection)
  const grid = await screen.findByLabelText('Sales Orders cells')
  await waitFor(() => expect(grid).toHaveAttribute('data-projection-retained', 'false'))
  read.mockImplementationOnce(async (request) => {
    await gate.promise
    return { ...projectionResultFor(request), history: history(1) }
  })
  fireEvent.scroll(screen.getByTestId('sheet-scroll'), { target: { scrollTop: 1_800 } })
  await waitFor(() => expect(grid).toHaveAttribute('data-projection-retained', 'true'))
  fireEvent.keyDown(grid, { key: 'z', ctrlKey: modifier === 'Control', metaKey: modifier === 'Meta' })
  expect(apply).toHaveBeenCalledTimes(1)
  await act(async () => gate.resolve())
  // Worker 按发送顺序响应：先发布在途读取，再送达历史操作的投影。
  await waitFor(() => expect(grid).toHaveAttribute('data-projection-retained', 'false'))
  await act(async () => historyGate.resolve())
  await waitFor(() => expect(store.getter(rustHistoryStateAtom).undoCount).toBe(0))
  expect(grid).toHaveAttribute('data-projection-retained', 'false')
})
