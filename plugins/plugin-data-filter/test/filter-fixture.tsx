import { createStore } from '@einfach/core'
import {
  initializeWorkbookDocumentAtom, runVisibleProjectionAtom, selectCellAtom,
  type ColumnFilterRule, type RustWorkbookCommands, type RustWorkbookConnection,
  type VisibleProjectionRequest,
} from '@einfach-excel/spreadsheet-ui-core'
import { act, render } from '@testing-library/react'
import { vi } from 'vitest'
import { WorkbookStoreProvider, type SpreadsheetPlugin } from '@einfach-excel/react-excel'
import { FilterTools } from '../../../excel/react-excel/src/workbook/chrome/ribbon/FilterTools'

type Input = RustWorkbookCommands['sheet.filter']['payload']
export async function setup(plugins: readonly SpreadsheetPlugin[], rules: ColumnFilterRule[] = []) {
  const store = createStore()
  const filter = vi.fn(async (input: Input) => ({ hiddenRows: 2, projection: {
    ...input.projection, cells: [], revision: 1,
    filterRules: input.action === 'apply' ? input.rules : [],
    filterGroups: input.action === 'apply' ? input.groups : [],
    visibility: { manualRows: [], manualColumns: [], filterRows: [1, 2] },
  } }))
  const connection: RustWorkbookConnection = { dispose() {}, request: (async (command, input) =>
    command === 'sheet.filter' ? filter(input as Input) : {
      ...(input as { request: VisibleProjectionRequest }).request,
      cells: [], revision: 0, filterRules: rules,
    }) as RustWorkbookConnection['request'] }
  store.setter(initializeWorkbookDocumentAtom, {
    title: 'Book', sheets: [{ id: 's', index: 0, name: 'Sheet', rowCount: 100, colCount: 8 }],
  })
  store.setter(selectCellAtom, { sheetId: 's', coord: { row: 0, col: 2 } })
  const content = (next: readonly SpreadsheetPlugin[]) =>
    <WorkbookStoreProvider store={store} connection={connection} plugins={next}>
      <FilterTools />
    </WorkbookStoreProvider>
  const view = render(content(plugins))
  await act(async () => {
    await store.setter(runVisibleProjectionAtom, {
      sheetId: 's', reason: 'viewport', window: { rowStart: 0, rowEnd: 9, colStart: 0, colEnd: 7 },
    })
  })
  return { store, filter, connection,
    rerender: (next: readonly SpreadsheetPlugin[]) => view.rerender(content(next)) }
}
