import { createStore } from '@einfach/core'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import {
  richTextPanelAtom, runRichTextAtom, runVisibleProjectionAtom, selectCellAtom,
  initializeWorkbookDocumentAtom,
  type RichTextRun, type RustWorkbookConnection, type VisibleProjectionRequest,
  type RustWorkbookCommands, type SpreadsheetCellFormat,
} from '@einfach-excel/spreadsheet-ui-core'
import { WorkbookStoreProvider } from '../../../excel/react-excel/src/page/WorkbookStoreProvider'
import { RichTextDialog } from '../../../excel/react-excel/src/workbook/rich-text/RichTextDialog'
import { textFormatPlugin } from '../src'
import { richTextBaselineAtom, runRichTextBaselineAtom } from '../src/core'
import { selectedBaseline } from '../src/core/rich-baseline'

async function setup(initial: readonly RichTextRun[], format: SpreadsheetCellFormat = {},
  pending?: Promise<void>) {
  const store = createStore()
  let runs = initial
  let revision = 1
  const writes: RustWorkbookCommands['richText.change']['payload'][] = []
  const projection = (request: VisibleProjectionRequest) => ({
    kind: 'visible-window' as const, sheetId: request.sheetId, requestId: request.requestId,
    window: request.window, revision, cells: [{ row: 0, col: 0, valueKind: 'string' as const,
      displayValue: runs.map(run => run.text).join(''), richText: runs, format }],
  })
  const connection: RustWorkbookConnection = { dispose() {}, request: (async (command, payload) => {
    if (command === 'projection.readVisible')
      return projection((payload as RustWorkbookCommands['projection.readVisible']['payload']).request)
    if (command === 'richText.change') {
      if (pending) await pending
      const change = payload as RustWorkbookCommands['richText.change']['payload']
      writes.push(change); runs = change.runs; revision += 1
      return { changed: true, projection: projection(change.projection) }
    }
    throw new Error(`Unexpected command: ${command}`)
  }) as RustWorkbookConnection['request'] }
  store.setter(selectCellAtom, { sheetId: 'sheet-1', coord: { row: 0, col: 0 } })
  const host = (enabled = true) => <WorkbookStoreProvider store={store} connection={connection}
    plugins={enabled ? [textFormatPlugin] : []}><RichTextDialog /></WorkbookStoreProvider>
  const view = render(host())
  await act(async () => {
    store.setter(initializeWorkbookDocumentAtom, { title: 'Rich text',
      sheets: [{ id: 'sheet-1', name: 'Sheet1', index: 0, rowCount: 10, colCount: 5 }] })
    await store.setter(runVisibleProjectionAtom, { sheetId: 'sheet-1',
      window: { rowStart: 0, rowEnd: 4, colStart: 0, colEnd: 3 }, reason: 'viewport' })
    expect(await store.setter(runRichTextAtom, 'open')).toBe(true)
  })
  const select = async (start: number, end: number) => {
    await act(async () => {
      const text = screen.getByRole('textbox', { name: 'Cell text' }) as HTMLTextAreaElement
      text.focus(); text.setSelectionRange(start, end); fireEvent.select(text)
    })
  }
  return { store, writes, select, toggle: (enabled: boolean) => view.rerender(host(enabled)) }
}

test('selected baseline uses intersecting runs and preserves explicit normal inheritance', () => {
  const runs: RichTextRun[] = [{ text: 'A', format: {} },
    { text: 'B', format: { fontBaseline: 'normal' } },
    { text: 'C', format: { fontBaseline: 'subscript' } }]
  expect(selectedBaseline(runs, 0, 1, 'superscript')).toBe('superscript')
  expect(selectedBaseline(runs, 1, 2, 'superscript')).toBe('normal')
  expect(selectedBaseline(runs, 0, 2, 'superscript')).toBe('mixed')
  expect(selectedBaseline(runs, 2, 3, 'superscript')).toBe('subscript')
  expect(selectedBaseline(runs, 2, 2)).toBeNull()
})

test('mixed selection toggles in the shared draft and Save alone issues one native command', async () => {
  const { store, select, writes } = await setup([{ text: 'A', format: {} },
    { text: 'B', format: { fontBaseline: 'normal', color: '#FF0000' } }],
  { fontBaseline: 'superscript' })
  const superscript = screen.getByRole('button', { name: 'Superscript' })
  await select(0, 2)
  expect(superscript).toHaveAttribute('aria-pressed', 'mixed')
  await act(async () => { fireEvent.click(superscript) })
  expect(store.getter(richTextBaselineAtom)).toBe('superscript')
  expect(store.getter(richTextPanelAtom).runs[1].format.color).toBe('#FF0000')
  expect(screen.getByRole('textbox', { name: 'Cell text' })).toHaveFocus()
  await act(async () => { fireEvent.click(superscript) })
  expect(store.getter(richTextPanelAtom).runs.every(run => run.format.fontBaseline === 'normal')).toBe(true)
  expect(writes).toHaveLength(0)
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save changes' })) })
  expect(writes).toHaveLength(1)
  expect(writes[0].runs.every(run => run.format.fontBaseline === 'normal')).toBe(true)
  expect(store.getter(richTextPanelAtom).open).toBe(false)
})

test('uninstall keeps the draft, Cancel discards it, and empty or emoji selections stay safe', async () => {
  const { store, select, writes, toggle } = await setup([{ text: '😀x2', format: {} }])
  expect(screen.getByRole('button', { name: 'Subscript' })).toBeDisabled()
  expect(await store.setter(runRichTextBaselineAtom, 'subscript')).toBe(false)
  await select(1, 2)
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Subscript' })) })
  expect(store.getter(richTextPanelAtom).runs[0]).toEqual({ text: '😀', format: { fontBaseline: 'subscript' } })
  toggle(false)
  expect(screen.queryByRole('button', { name: 'Subscript' })).not.toBeInTheDocument()
  expect(store.getter(richTextPanelAtom).runs[0].format.fontBaseline).toBe('subscript')
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Cancel' })) })
  toggle(true)
  await act(async () => { await store.setter(runRichTextAtom, 'open') })
  await select(0, 2)
  expect(store.getter(richTextBaselineAtom)).toBe('normal')
  expect(writes).toHaveLength(0)
})

test('pending native save publishes disabled controls before the request completes', async () => {
  let release!: () => void
  const pending = new Promise<void>(resolve => { release = resolve })
  const { store, select, writes } = await setup([{ text: 'x2', format: {} }], {}, pending)
  await select(1, 2)
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Superscript' })) })
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save changes' })) })
  expect(screen.getByRole('status')).toHaveTextContent('Saving rich text…')
  for (const name of ['Superscript', 'Subscript', 'Save changes', 'Cancel'])
    expect(screen.getByRole('button', { name })).toBeDisabled()
  expect(await store.setter(runRichTextAtom, 'close')).toBe(false)
  expect(await store.setter(runRichTextBaselineAtom, 'subscript')).toBe(false)
  expect(writes).toHaveLength(0)
  await act(async () => { release(); await pending })
  expect(writes).toHaveLength(1)
  expect(store.getter(richTextPanelAtom).open).toBe(false)
})
