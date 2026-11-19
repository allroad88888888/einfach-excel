import { act, fireEvent, render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import {
  activateSheetTabAtom,
  createSpreadsheetUi,
  initializeWorkbookDocumentAtom,
  runVisibleProjectionAtom,
  selectCellAtom,
  type ConsolidatePreview,
  type RustWorkbookConnection,
  type VisibleProjectionRequest,
} from '@einfach-excel/spreadsheet-ui-core'
import { WorkbookStoreProvider } from '../../../excel/react-excel/src/page/WorkbookStoreProvider'
import { PluginPanels } from '../../../excel/react-excel/src/plugin/PluginMounts'
import { configureConsolidateAtom, consolidatePanelAtom } from '../src/core'
import { dataConsolidatePlugin } from '../src'

const samplePreview: ConsolidatePreview & { readonly revision: number } = {
  target: { rowStart: 0, rowEnd: 1, colStart: 0, colEnd: 1 },
  rowCount: 2,
  colCount: 2,
  overwrittenCells: 2,
  sample: [
    ['Item', 'Sales'],
    ['Apples', '35'],
  ],
  sampleTruncated: false,
  revision: 1,
}

async function createFixture(handlers: {
  preview?: (payload: unknown) => Promise<ConsolidatePreview & { readonly revision: number }>
  apply?: (payload: unknown) => Promise<unknown>
} = {}) {
  const preview = vi.fn(handlers.preview ?? (async () => samplePreview))
  const apply = vi.fn(
    handlers.apply ??
      (async (payload: unknown) => ({
        target: samplePreview.target,
        changedCells: 4,
        linkedGroups: 0,
        projection: {
          ...(payload as { projection: VisibleProjectionRequest }).projection,
          revision: 2,
          cells: [],
        },
      })),
  )
  const request = vi.fn(async (command: string, payload: unknown) => {
    if (command === 'consolidate.preview') return preview(payload)
    if (command === 'consolidate.apply') return apply(payload)
    return { ...(payload as { request: VisibleProjectionRequest }).request, cells: [], revision: 1 }
  })
  const connection: RustWorkbookConnection = {
    request: request as RustWorkbookConnection['request'],
    dispose() {},
  }
  const core = createSpreadsheetUi({ connection })
  core.store.setter(initializeWorkbookDocumentAtom, {
    title: 'Book',
    sheets: [
      { id: 'q1', name: 'Q1', index: 0, rowCount: 30, colCount: 8 },
      { id: 'summary', name: 'Summary', index: 1, rowCount: 30, colCount: 8 },
    ],
  })
  core.store.setter(activateSheetTabAtom, { sheetId: 'summary' })
  core.store.setter(selectCellAtom, { sheetId: 'summary', coord: { row: 0, col: 0 } })
  await core.store.setter(runVisibleProjectionAtom, {
    sheetId: 'summary',
    reason: 'viewport',
    window: { rowStart: 0, rowEnd: 20, colStart: 0, colEnd: 4 },
  })
  return { store: core.store, preview, apply }
}

test('consolidate dialog previews, gates overwrite confirmation, and commits', async () => {
  const { store, preview, apply } = await createFixture()
  render(
    <WorkbookStoreProvider store={store} plugins={[dataConsolidatePlugin]}>
      <PluginPanels />
    </WorkbookStoreProvider>,
  )
  await act(async () => {
    await store.setter(configureConsolidateAtom, 'open')
  })
  expect(screen.getByRole('dialog', { name: 'Consolidate' })).toBeInTheDocument()

  const refInput = screen.getByLabelText('Reference')
  fireEvent.change(refInput, { target: { value: 'Q1!A1:B3' } })
  fireEvent.click(screen.getByRole('button', { name: 'Add' }))
  expect(screen.getByText('Q1!A1:B3')).toBeInTheDocument()

  const applyButton = screen.getByRole('button', { name: 'Consolidate' })
  expect(applyButton).toBeDisabled()

  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }))
  })
  expect(preview).toHaveBeenCalledTimes(1)
  expect(screen.getByText('35')).toBeInTheDocument()
  expect(applyButton).toBeDisabled()

  const confirm = screen.getByRole('checkbox', { name: /Overwrite 2 existing cells/i })
  fireEvent.click(confirm)
  expect(applyButton).not.toBeDisabled()

  await act(async () => {
    fireEvent.click(applyButton)
  })
  expect(apply).toHaveBeenCalledTimes(1)
  expect(store.getter(consolidatePanelAtom)).toBeNull()
})

test('consolidate allows closing while busy and clears orphaned state on sheet switch', async () => {
  let resolvePreview!: (value: ConsolidatePreview & { readonly revision: number }) => void
  const { store } = await createFixture({
    preview: () =>
      new Promise((resolve) => {
        resolvePreview = resolve
      }),
  })
  await store.setter(configureConsolidateAtom, 'open')
  await store.setter(configureConsolidateAtom, { patch: { referenceInput: 'Q1!A1:B3' } })
  await store.setter(configureConsolidateAtom, 'addReference')

  const pending = store.setter(configureConsolidateAtom, 'preview')
  await Promise.resolve()
  expect(store.getter(consolidatePanelAtom)?.busy).toBe(true)

  store.setter(activateSheetTabAtom, { sheetId: 'q1' })
  expect(store.getter(consolidatePanelAtom)).toBeNull()

  resolvePreview(samplePreview)
  expect(await pending).toBe(false)

  store.setter(activateSheetTabAtom, { sheetId: 'summary' })
  expect(store.getter(consolidatePanelAtom)).toBeNull()
  expect(await store.setter(configureConsolidateAtom, 'open')).toBe(true)
  expect(store.getter(consolidatePanelAtom)?.busy).toBe(false)
})

test('consolidate surfaces validation errors without closing dialog', async () => {
  const { store } = await createFixture({
    preview: async () => {
      throw new Error('Create links to source data requires sources on other worksheets.')
    },
  })
  render(
    <WorkbookStoreProvider store={store} plugins={[dataConsolidatePlugin]}>
      <PluginPanels />
    </WorkbookStoreProvider>,
  )
  await act(async () => {
    await store.setter(configureConsolidateAtom, 'open')
    await store.setter(configureConsolidateAtom, { patch: { referenceInput: 'Q1!A1:B3' } })
  })
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }))
  })
  expect(screen.getByRole('alert')).toHaveTextContent(
    'Create links to source data requires sources on other worksheets.',
  )
  expect(store.getter(consolidatePanelAtom)).not.toBeNull()
})
