import { createStore } from '@einfach/core'
import {
  initializeWorkbookDocumentAtom,
  runVisibleProjectionAtom,
  selectCellAtom,
  type RustWorkbookCommands,
  type RustWorkbookConnection,
  type VisibleProjectionRequest,
} from '@einfach/spreadsheet-ui-core'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { WorkbookStoreProvider } from '../../../src/page/WorkbookStoreProvider'
import { FilterTools } from '../../../src/workbook/chrome/ribbon/FilterTools'

type Input = RustWorkbookCommands['sheet.filter']['payload']
const result = (p: Input) => ({
  hiddenRows: 2,
  projection: {
    ...p.projection,
    cells: [],
    revision: 1,
    filterRules: p.action === 'apply' ? p.rules : [],
    visibility: { manualRows: [], manualColumns: [], filterRows: [2, 4] },
  },
})
const menu = () => screen.getByRole('combobox', { name: 'Worksheet filter' })
async function choose(value: string) {
  await act(async () => {
    fireEvent.change(menu(), { target: { value } })
  })
}
async function setup() {
  const filter = vi.fn(async (p: Input) => result(p))
  const request = (async (cmd: string, p: unknown) =>
    cmd === 'sheet.filter'
      ? filter(p as Input)
      : {
          ...(p as { request: VisibleProjectionRequest }).request,
          cells: [],
          revision: 0,
          filterRules: [],
        }) as RustWorkbookConnection['request']
  const store = createStore()
  store.setter(initializeWorkbookDocumentAtom, {
    title: 'Book',
    sheets: [{ id: 's', index: 0, name: 'Sheet', rowCount: 100, colCount: 8 }],
  })
  store.setter(selectCellAtom, { sheetId: 's', coord: { row: 0, col: 2 } })
  render(
    <WorkbookStoreProvider store={store} connection={{ request, dispose() {} }}>
      <FilterTools />
    </WorkbookStoreProvider>,
  )
  await act(async () => {
    await store.setter(runVisibleProjectionAtom, {
      sheetId: 's',
      reason: 'viewport',
      window: { rowStart: 0, rowEnd: 9, colStart: 0, colEnd: 7 },
    })
  })
  return { filter }
}
async function change(name: string, value: string) {
  await act(async () => {
    fireEvent.change(screen.getByLabelText(name), { target: { value } })
  })
}
async function apply() {
  await act(async () => {
    fireEvent.submit(screen.getByRole('dialog').querySelector('form')!)
  })
}

test('apply, reapply and clear dispatch one semantic command and restore focus', async () => {
  const { filter } = await setup()
  expect(screen.getByRole('option', { name: 'Clear filter' })).toBeDisabled()
  await choose('open')
  expect(screen.getByLabelText('Filter column 1')).toHaveValue('2')
  await change('Filter value 1', 'West')
  await apply()
  expect(filter.mock.lastCall![0]).toMatchObject({
    action: 'apply',
    rules: [{ colIndex: 2, kind: 'equals', value: 'West' }],
  })
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(menu()).toHaveFocus()
  expect(screen.getByLabelText('Filter status')).toHaveTextContent('2 rows filtered out')
  await choose('reapply')
  expect(filter.mock.lastCall![0].action).toBe('reapply')
  await choose('clear')
  expect(filter.mock.lastCall![0].action).toBe('clear')
  expect(filter).toHaveBeenCalledTimes(3)
})

test('add/remove and cancel affect only the draft; number errors remain editable', async () => {
  const { filter } = await setup()
  await choose('open')
  await act(async () => {
    fireEvent.click(screen.getByText('Add condition'))
  })
  expect(screen.getByLabelText('Filter column 2')).toHaveValue('0')
  await act(async () => {
    fireEvent.click(screen.getByLabelText('Remove condition 2'))
  })
  await change('Filter condition 1', 'range')
  await change('Minimum 1', 'bad')
  await apply()
  expect(screen.getByRole('alert')).toHaveTextContent('valid numbers')
  expect(filter).not.toHaveBeenCalled()
  await act(async () => {
    fireEvent.click(screen.getByText('Cancel'))
  })
  expect(screen.queryByRole('dialog')).toBeNull()
})

test('native rejection retains draft and busy disables cancellation and duplicates', async () => {
  const { filter } = await setup()
  await choose('open')
  await change('Filter value 1', 'West')
  filter.mockRejectedValueOnce(new Error('Too large'))
  await apply()
  expect(screen.getByRole('dialog')).toHaveTextContent('Too large')
  expect(screen.getByLabelText('Filter value 1')).toHaveValue('West')
  let finish!: (r: ReturnType<typeof result>) => void
  filter.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  await apply()
  expect(menu()).toBeDisabled()
  expect(screen.getByLabelText('Filter value 1')).toBeDisabled()
  expect(screen.getByText('Cancel')).toBeDisabled()
  await act(async () => {
    finish(result(filter.mock.lastCall![0]))
  })
  expect(screen.queryByRole('dialog')).toBeNull()
})
