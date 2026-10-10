import { act, fireEvent, render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { createStore } from '@einfach/core'
import {
  runVisibleProjectionAtom, setSelectionAtom, setSelectionBoundsAtom,
  type RustWorkbookConnection, type VisibleProjectionRequest,
} from '@einfach/spreadsheet-ui-core'
import { WorkbookStoreProvider } from '../../../src/page/WorkbookStoreProvider'
import { TextColumnsTools } from '../../../src/workbook/chrome/ribbon/TextColumnsTools'

async function setup(overwrittenCells = 0) {
  const target = { rowStart: 0, colStart: 2, rowEnd: 1, colEnd: 3 }
  const write = vi.fn(async (input: { projection: VisibleProjectionRequest }) => ({
    target, changedCells: 4, projection: { ...input.projection, revision: 1, cells: [] },
  }))
  const preview = vi.fn(async () => ({ target, overwrittenCells, revision: 0,
    sample: [['001', '北京'], ['', '=1+2']], sampleTruncated: false }))
  const connection: RustWorkbookConnection = {
    dispose: vi.fn(), request: vi.fn(async (command: string, input: unknown) => {
      if (command === 'textColumns.preview') return preview()
      if (command === 'textColumns.apply') return write(input as { projection: VisibleProjectionRequest })
      return { ...(input as { request: VisibleProjectionRequest }).request, revision: 0, cells: [] }
    }) as RustWorkbookConnection['request'],
  }
  const store = createStore()
  store.setter(setSelectionBoundsAtom, { rowCount: 100, colCount: 8 })
  store.setter(setSelectionAtom, { kind: 'range', sheetId: 's',
    anchor: { row: 0, col: 0 }, focus: { row: 1, col: 0 } })
  render(<WorkbookStoreProvider store={store} connection={connection}>
    <TextColumnsTools />
  </WorkbookStoreProvider>)
  await act(async () => {
    await store.setter(runVisibleProjectionAtom, {
      sheetId: 's', window: { rowStart: 0, colStart: 0, rowEnd: 9, colEnd: 7 }, reason: 'viewport',
    })
  })
  await click('Text to columns')
  return { write, preview }
}
async function click(name: string) {
  await act(async () => { fireEvent.click(screen.getByRole('button', { name })) })
}
async function change(label: string, value: string) {
  await act(async () => { fireEvent.change(screen.getByLabelText(label), { target: { value } }) })
}

test('shows native preview, keeps drafts inert and returns focus after applying', async () => {
  const { write, preview } = await setup()
  expect(screen.getByLabelText('Split mode')).toHaveFocus()
  expect(screen.getByRole('table', { name: 'Split preview' })).toHaveTextContent('001北京')
  await change('Destination cell', 'C1')
  expect(screen.getByRole('button', { name: 'Apply split' })).toBeDisabled()
  expect(preview).toHaveBeenCalledTimes(1)
  expect(write).not.toHaveBeenCalled()
  await click('Update preview')
  await click('Apply split')
  expect(write).toHaveBeenCalledTimes(1)
  expect(write.mock.lastCall![0]).toMatchObject({
    destination: { row: 0, col: 2 }, expectedRevision: 0,
  })
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(screen.getByRole('button', { name: 'Text to columns' })).toHaveFocus()
})

test('overwrite checkbox gates Apply and is cleared after a draft change', async () => {
  const { write } = await setup(2)
  const apply = screen.getByRole('button', { name: 'Apply split' })
  expect(apply).toBeDisabled()
  await act(async () => { fireEvent.click(screen.getByRole('checkbox', { name: /Overwrite 2/ })) })
  expect(apply).toBeEnabled()
  await change('Destination cell', 'D1')
  await click('Update preview')
  expect(screen.getByRole('checkbox', { name: /Overwrite 2/ })).not.toBeChecked()
  expect(apply).toBeDisabled()
  await act(async () => { fireEvent.click(screen.getByRole('checkbox', { name: /Overwrite 2/ })) })
  await click('Apply split')
  expect(write.mock.lastCall![0]).toMatchObject({ overwrite: true })
})

test('fixed-width validation is correctable and Cancel never writes', async () => {
  const { write } = await setup()
  await change('Split mode', 'fixedWidth')
  expect(screen.queryByLabelText('Comma')).toBeNull()
  await change('Break positions', '5,2')
  await click('Update preview')
  expect(screen.getByRole('alert')).toHaveTextContent('increasing positive')
  await change('Break positions', '2,5')
  await click('Update preview')
  expect(screen.queryByRole('alert')).toBeNull()
  await click('Cancel')
  expect(write).not.toHaveBeenCalled()
  expect(screen.getByRole('button', { name: 'Text to columns' })).toHaveFocus()
})

test('Escape closes a draft without writing or retaining its options', async () => {
  const { write } = await setup()
  await change('Destination cell', 'H99')
  await act(async () => { fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true })) })
  expect(screen.queryByRole('dialog')).toBeNull()
  await click('Text to columns')
  expect(screen.getByLabelText('Destination cell')).toHaveValue('A1')
  expect(write).not.toHaveBeenCalled()
})
