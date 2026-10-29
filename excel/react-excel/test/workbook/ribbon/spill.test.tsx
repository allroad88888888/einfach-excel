import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { createSpreadsheetUi, initializeWorkbookDocumentAtom, runVisibleProjectionAtom,
  startEditingAtom, cancelEditingAtom, selectionSnapshotAtom,
  type RustWorkbookConnection, type VisibleProjectionRequest } from '@einfach-excel/spreadsheet-ui-core'
import { WorkbookStoreProvider } from '../../../src/page/WorkbookStoreProvider'
import { SpillTools } from '../../../src/workbook/chrome/ribbon/SpillTools'
import type { SpillInspection } from '../../../../spreadsheet-ui-core/src/rust-workbook/spill-commands'

async function setup(inspection: SpillInspection) {
  const inspect = vi.fn(async () => ({ inspection, revision: 1 }))
  const { store } = createSpreadsheetUi({ connection: {
    request: (async (command: string, input: unknown) => command === 'formula.inspectSpill' ? inspect()
      : { ...(input as { request: VisibleProjectionRequest }).request, cells: [], revision: 1 }) as RustWorkbookConnection['request'],
    dispose() {},
  } })
  store.setter(initializeWorkbookDocumentAtom, { title: 'Book', sheets: [
    { id: 's', name: 'Sheet', index: 0, rowCount: 100, colCount: 8 },
  ] })
  await store.setter(runVisibleProjectionAtom, { sheetId: 's', reason: 'viewport',
    window: { rowStart: 0, rowEnd: 9, colStart: 0, colEnd: 7 } })
  render(<WorkbookStoreProvider store={store}><SpillTools /></WorkbookStoreProvider>)
  return { store, inspect }
}
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }))

test('range and dimensions are readable, selection uses the native range and focus returns', async () => {
  const { store, inspect } = await setup({ kind: 'active', anchor: { row: 2, col: 1 },
    range: { rowStart: 2, rowEnd: 4, colStart: 1, colEnd: 2 } })
  click('Spill details')
  await screen.findByText('Spill range: B3:C5')
  expect(screen.getByText('Formula cell: B3')).toBeVisible()
  expect(screen.getByText('Size: 3 × 2 (rows × columns)')).toBeVisible()
  expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus()
  click('Select spill range')
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  expect(store.getter(selectionSnapshotAtom).range).toEqual({
    rowStart: 2, rowEnd: 4, colStart: 1, colEnd: 2,
  })
  expect(screen.getByRole('button', { name: 'Spill details' })).toHaveFocus()
  expect(inspect).toHaveBeenCalledOnce()
})

test('blocked arrays describe the obstruction and select that cell without clearing it', async () => {
  const { store } = await setup({ kind: 'blocked', anchor: { row: 0, col: 0 }, blocker: { row: 2, col: 1 } })
  click('Spill details')
  await screen.findByText('Blocked by B3.')
  expect(screen.queryByRole('button', { name: 'Select spill range' })).toBeNull()
  click('Select blocking cell')
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  expect(store.getter(selectionSnapshotAtom).activeCell).toMatchObject({ row: 2, col: 1 })
})

test.each([{ kind: 'none' }, { kind: 'blocked', anchor: { row: 0, col: 0 }, blocker: null }] as SpillInspection[])(
  '$kind without a target has actionable copy rather than a dead locate button', async (inspection) => {
    await setup(inspection)
    click('Spill details')
    await screen.findByText(inspection.kind === 'none' ? 'This cell is not part of a spilled array.'
      : 'No blocking cell can be identified. Check worksheet limits or the array size.')
    expect(screen.queryByRole('button', { name: 'Select blocking cell' })).toBeNull()
    click('Close')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  },
)

test('editing disables entry, query errors stay visible and Refresh retries', async () => {
  const { store, inspect } = await setup({ kind: 'none' })
  act(() => store.setter(startEditingAtom, { sheetId: 's', cell: { row: 0, col: 0 }, source: 'cell', draft: '=SUM(' }))
  expect(screen.getByRole('button', { name: 'Spill details' })).toBeDisabled()
  act(() => store.setter(cancelEditingAtom))
  inspect.mockRejectedValueOnce(new Error('Native failure'))
  click('Spill details')
  expect(await screen.findByRole('alert')).toHaveTextContent('Native failure')
  click('Refresh')
  await screen.findByText('This cell is not part of a spilled array.')
  expect(screen.queryByRole('alert')).toBeNull()
})
