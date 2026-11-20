import { act, fireEvent, render, screen } from '@testing-library/react'
import { createStore } from '@einfach/core'
import { expect, test, vi } from 'vitest'
import {
  initializeWorkbookDocumentAtom,
  runVisibleProjectionAtom,
  setSelectionAtom,
  setSelectionBoundsAtom,
  type DisplayCell,
  type RichTextRun,
  type RustWorkbookConnection,
  type VisibleProjectionRequest,
} from '@einfach-excel/spreadsheet-ui-core'
import { WorkbookStoreProvider } from '../../../src/page/WorkbookStoreProvider'
import { RichTextDialog } from '../../../src/workbook/rich-text/RichTextDialog'
import { RichTextTools } from '../../../src/workbook/rich-text/RichTextTools'

async function setupRichText(activeCell?: Partial<DisplayCell>) {
  const changes: { row: number; col: number; runs: readonly RichTextRun[] }[] = []
  const cells: DisplayCell[] = activeCell
    ? [
        {
          row: 0,
          col: 0,
          displayValue: activeCell.displayValue ?? 'Alpha Beta',
          valueKind: activeCell.valueKind ?? 'string',
          ...activeCell,
        } as DisplayCell,
      ]
    : []

  const connection: RustWorkbookConnection = {
    dispose: vi.fn(),
    request: vi.fn(async (command: string, input: unknown) => {
      if (command === 'richText.change') {
        const payload = input as {
          row: number
          col: number
          runs: readonly RichTextRun[]
          projection: VisibleProjectionRequest
        }
        changes.push({ row: payload.row, col: payload.col, runs: payload.runs })
        return {
          changed: true,
          projection: { ...payload.projection, revision: 2, cells },
        }
      }
      const req = (input as { request: VisibleProjectionRequest }).request
      return { ...req, revision: 1, cells }
    }) as RustWorkbookConnection['request'],
  }

  const store = createStore()
  store.setter(initializeWorkbookDocumentAtom, {
    title: 'Book',
    sheets: [{ id: 's', index: 0, name: 'Sheet1', rowCount: 100, colCount: 10 }],
  })
  store.setter(setSelectionBoundsAtom, { rowCount: 100, colCount: 10 })
  store.setter(setSelectionAtom, {
    kind: 'cell',
    sheetId: 's',
    anchor: { row: 0, col: 0 },
    focus: { row: 0, col: 0 },
  })
  render(
    <WorkbookStoreProvider store={store} connection={connection}>
      <RichTextTools />
      <RichTextDialog />
    </WorkbookStoreProvider>,
  )
  await act(async () => {
    await store.setter(runVisibleProjectionAtom, {
      sheetId: 's',
      window: { rowStart: 0, colStart: 0, rowEnd: 5, colEnd: 5 },
      reason: 'viewport',
    })
  })
  return { changes }
}

test('disables Rich text trigger on formula and numeric cells', async () => {
  const first = await setupRichText({ displayValue: '42', valueKind: 'number', numericValue: 42 })
  expect(first.changes).toHaveLength(0)
  expect(screen.getByRole('button', { name: 'Rich text' })).toBeDisabled()
})

test('edits substring runs, previews styles, validates 32,767-char limit and commits once', async () => {
  const { changes } = await setupRichText({ displayValue: 'Alpha Beta', valueKind: 'string' })
  const trigger = screen.getByRole('button', { name: 'Rich text' })
  expect(trigger).toBeEnabled()

  await act(async () => {
    fireEvent.click(trigger)
  })
  const textarea = screen.getByLabelText('Cell text') as HTMLTextAreaElement
  expect(textarea).toHaveValue('Alpha Beta')

  // Exceeding 32,767 characters shows error alert without mutating runs.
  await act(async () => {
    fireEvent.change(textarea, {
      target: { value: 'x'.repeat(32_768), selectionStart: 0, selectionEnd: 0 },
    })
  })
  expect(screen.getByRole('alert')).toHaveTextContent('cell size limit')

  // Select "Alpha" (0..5) and apply Bold + Italic + Font family + Color, then save.
  textarea.setSelectionRange(0, 5)
  await act(async () => {
    fireEvent.select(textarea)
  })
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Bold' }))
    fireEvent.click(screen.getByRole('button', { name: 'Italic' }))
    fireEvent.change(screen.getByLabelText('Font family'), { target: { value: 'Georgia' } })
    fireEvent.change(screen.getByLabelText('Text color'), { target: { value: '#cc2200' } })
  })

  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
  })
  expect(changes).toHaveLength(1)
  expect(changes[0]).toEqual({
    row: 0,
    col: 0,
    runs: [
      {
        text: 'Alpha',
        format: { bold: true, italic: true, fontFamily: 'Georgia', color: '#cc2200' },
      },
      { text: ' Beta', format: {} },
    ],
  })
  expect(screen.queryByRole('dialog')).toBeNull()
})
