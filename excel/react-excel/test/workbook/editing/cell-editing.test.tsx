import { createStore, type Store } from '@einfach/core'
import {
  editingCommitLifecycleAtom,
  editingSessionAtom,
  setSelectionBoundsAtom,
  setSelectionAtom,
  type EditingCommitRequest,
  type VisibleProjectionRequest,
  type VisibleProjectionResult,
} from '@einfach/spreadsheet-ui-core'
import { describe, expect, it, jest } from '@jest/globals'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ComponentType } from 'react'
import {
  SALES_ORDER_COLUMNS,
  SALES_ORDER_SHEET_ROW_COUNT,
} from '../../../src/product/sales-orders/data/sheet'
import { WorkbookRuntimeProvider } from '../../../src/workbook/runtime/WorkbookRuntimeProvider'
import { createTestRustWorkbookConnection } from '../../support/rust-workbook-connection'

const { Workbook } = jest.requireActual('../../../src/workbook/shell/Workbook') as {
  Workbook: ComponentType
}

interface ControlledConnection {
  readonly connection: ReturnType<typeof createTestRustWorkbookConnection>
  readonly readVisibleProjection: jest.MockedFunction<
    (request: VisibleProjectionRequest) => Promise<VisibleProjectionResult>
  >
  readonly setCellInput: jest.MockedFunction<
    (request: EditingCommitRequest) => Promise<{
      sheetId: string
      requestId: number
      revision: number
    }>
  >
  failNextMutation(message: string): void
  failNextRefresh(message: string): void
}

function createControlledConnection(): ControlledConnection {
  const values = new Map<string, string>()
  let mutationFailure: string | undefined
  let refreshFailure: string | undefined
  let revision = 0
  const readVisibleProjection = jest.fn(async (
    request: VisibleProjectionRequest,
  ): Promise<VisibleProjectionResult> => {
    if (refreshFailure !== undefined) {
      const message = refreshFailure
      refreshFailure = undefined
      throw new Error(message)
    }
    const cells = []
    for (let row = request.window.rowStart; row <= request.window.rowEnd; row += 1) {
      for (let col = request.window.colStart; col <= request.window.colEnd; col += 1) {
        cells.push({
          row,
          col,
          displayValue:
            values.get(`${row}:${col}`) ??
            (row === 0 ? SALES_ORDER_COLUMNS[col]!.label : `R${row}C${col}`),
        })
      }
    }
    return {
      kind: 'visible-window',
      sheetId: request.sheetId,
      requestId: request.requestId,
      window: request.window,
      cells,
    }
  })
  const setCellInput = jest.fn(async (request: EditingCommitRequest) => {
    if (mutationFailure !== undefined) {
      const message = mutationFailure
      mutationFailure = undefined
      throw new Error(message)
    }
    values.set(`${request.row}:${request.col}`, request.input)
    revision += 1
    return {
      sheetId: request.sheetId,
      requestId: request.requestId,
      revision,
    }
  })

  return {
    connection: createTestRustWorkbookConnection({ readVisibleProjection, setCellInput }),
    readVisibleProjection,
    setCellInput,
    failNextMutation: (message) => {
      mutationFailure = message
    },
    failNextRefresh: (message) => {
      refreshFailure = message
    },
  }
}

function renderWorksheet(controlled: ControlledConnection): Store {
  const store = createStore()
  store.setter(setSelectionBoundsAtom, {
    rowCount: SALES_ORDER_SHEET_ROW_COUNT,
    colCount: SALES_ORDER_COLUMNS.length,
  })
  render(
    <WorkbookRuntimeProvider connection={controlled.connection} store={store}>
      <Workbook />
    </WorkbookRuntimeProvider>,
  )
  return store
}

async function firstCell(): Promise<HTMLElement> {
  return waitFor(() => {
    const cell = document.querySelector<HTMLElement>('[data-cell="0:0"]')
    expect(cell).not.toBeNull()
    return cell!
  })
}

async function focusedEditor(): Promise<HTMLInputElement> {
  const editor = screen.getByRole<HTMLInputElement>('textbox', { name: 'Cell editor' })
  await waitFor(() => expect(document.activeElement).toBe(editor))
  return editor
}

function dispatchPointer(
  target: Element,
  type: 'pointerdown' | 'pointerup',
  pointerId: number,
): void {
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperties(event, {
    button: { value: 0 },
    clientX: { value: 180 },
    clientY: { value: 72 },
    isPrimary: { value: true },
    pointerId: { value: pointerId },
  })
  fireEvent(target, event)
}

describe('Rust workbook cell editing', () => {
  it('starts, updates the draft, writes through Rust and refreshes the projection', async () => {
    const controlled = createControlledConnection()
    const store = renderWorksheet(controlled)
    await firstCell()
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Redo' })).toBeNull()

    const grid = screen.getByLabelText('One thousand sales order records')
    grid.focus()
    expect(document.activeElement).toBe(grid)
    fireEvent.keyDown(document.activeElement!, { key: 'Enter' })
    const editor = await focusedEditor()
    expect(editor).toHaveValue('Order')
    expect(editor).toHaveAttribute('id', 'cell-editor-r0-c0')
    expect(editor).toHaveAttribute('name', 'cell-editor-r0-c0')
    fireEvent.change(editor, { target: { value: 'Edited order' } })
    expect(store.getter(editingSessionAtom)).toMatchObject({
      status: 'drafting',
      source: { sheetId: 'orders', cell: { row: 0, col: 0 }, source: 'cell' },
      draft: 'Edited order',
    })

    fireEvent.keyDown(document.activeElement!, { key: 'Enter' })
    fireEvent.blur(editor)
    await waitFor(() => expect(controlled.setCellInput).toHaveBeenCalledTimes(1))
    expect(controlled.setCellInput).toHaveBeenCalledWith(
      expect.objectContaining({ sheetId: 'orders', row: 0, col: 0, input: 'Edited order' }),
    )
    await waitFor(() => expect(screen.queryByRole('textbox', { name: 'Cell editor' })).toBeNull())
    expect(await firstCell()).toHaveTextContent('Edited order')
    expect(controlled.readVisibleProjection).toHaveBeenCalledTimes(2)
    await waitFor(() => expect(document.activeElement).toBe(grid))

    fireEvent.keyDown(document.activeElement!, { key: 'Enter' })
    const keyboardEditor = await focusedEditor()
    expect(keyboardEditor).toHaveValue('Edited order')
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
    expect(screen.queryByRole('textbox', { name: 'Cell editor' })).toBeNull()
    expect(document.activeElement).toBe(grid)
    expect(controlled.setCellInput).toHaveBeenCalledTimes(1)
  })

  it('opens the captured pointer cell from a complete browser double-click sequence', async () => {
    const controlled = createControlledConnection()
    renderWorksheet(controlled)
    await firstCell()
    const grid = screen.getByLabelText('One thousand sales order records')
    const cell = document.querySelector<HTMLElement>('[data-cell="1:1"]')!
    const elementFromPoint = document.elementFromPoint
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: jest.fn(() => cell),
    })

    try {
      dispatchPointer(cell, 'pointerdown', 31)
      dispatchPointer(grid, 'pointerup', 31)
      fireEvent.click(grid, { clientX: 180, clientY: 72, detail: 1 })
      expect(screen.queryByRole('textbox', { name: 'Cell editor' })).toBeNull()
      dispatchPointer(cell, 'pointerdown', 32)
      dispatchPointer(grid, 'pointerup', 32)
      fireEvent.click(grid, { clientX: 180, clientY: 72, detail: 2 })
      fireEvent.doubleClick(grid, { clientX: 180, clientY: 72, detail: 2 })

      const editor = await focusedEditor()
      expect(editor).toHaveValue('R1C1')
      expect(editor).toHaveAttribute('id', 'cell-editor-r1-c1')
      expect(editor).toHaveAttribute('name', 'cell-editor-r1-c1')
    } finally {
      Object.defineProperty(document, 'elementFromPoint', {
        configurable: true,
        value: elementFromPoint,
      })
    }
  })

  it('uses the range focus cell for keyboard editing and mutation', async () => {
    const controlled = createControlledConnection()
    const store = renderWorksheet(controlled)
    await firstCell()
    act(() => {
      store.setter(setSelectionAtom, {
        kind: 'range',
        sheetId: 'orders',
        anchor: { row: 0, col: 0 },
        focus: { row: 1, col: 1 },
      })
    })
    const grid = screen.getByLabelText('One thousand sales order records')
    grid.focus()
    fireEvent.keyDown(document.activeElement!, { key: 'Enter' })
    const editor = await focusedEditor()
    expect(editor).toHaveValue('R1C1')
    fireEvent.change(editor, { target: { value: 'Focus edit' } })
    fireEvent.keyDown(document.activeElement!, { key: 'Enter' })

    await waitFor(() => expect(controlled.setCellInput).toHaveBeenCalledTimes(1))
    expect(controlled.setCellInput).toHaveBeenCalledWith(
      expect.objectContaining({ row: 1, col: 1, input: 'Focus edit' }),
    )
  })

  it('commits the active draft when focus leaves the cell editor', async () => {
    const controlled = createControlledConnection()
    renderWorksheet(controlled)
    fireEvent.doubleClick(await firstCell())
    const editor = await focusedEditor()
    fireEvent.change(editor, { target: { value: 'Blurred edit' } })
    const outsideTarget = screen.getByRole('button', { name: 'Paste' })
    outsideTarget.focus()

    await waitFor(() => expect(controlled.setCellInput).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(screen.queryByRole('textbox', { name: 'Cell editor' })).toBeNull())
    expect(await firstCell()).toHaveTextContent('Blurred edit')
    expect(document.activeElement).toBe(outsideTarget)
  })

  it('keeps a rejected mutation draft editable for an explicit retry', async () => {
    const controlled = createControlledConnection()
    controlled.failNextMutation('Rust write rejected')
    const store = renderWorksheet(controlled)
    fireEvent.doubleClick(await firstCell())
    const editor = await focusedEditor()
    fireEvent.change(editor, { target: { value: 'Retry me' } })
    fireEvent.keyDown(document.activeElement!, { key: 'Enter' })

    await waitFor(() => expect(store.getter(editingCommitLifecycleAtom).status).toBe('rejected'))
    expect(screen.getByRole('alert')).toHaveTextContent('That edit was not saved.')
    expect(screen.getByRole('textbox', { name: 'Cell editor' })).toHaveValue('Retry me')
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Cell editor' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Cell editor' }), {
      target: { value: 'Retry changed' },
    })
    expect(store.getter(editingSessionAtom).draft).toBe('Retry changed')
    expect(controlled.readVisibleProjection).toHaveBeenCalledTimes(1)
  })

  it('retains refresh retry authority after one acknowledged mutation', async () => {
    const controlled = createControlledConnection()
    const store = renderWorksheet(controlled)
    fireEvent.doubleClick(await firstCell())
    const editor = await focusedEditor()
    fireEvent.change(editor, { target: { value: 'Saved once' } })
    controlled.failNextRefresh('Rust projection retry needed')
    fireEvent.keyDown(editor, { key: 'Enter' })

    await waitFor(() => {
      expect(store.getter(editingCommitLifecycleAtom)).toMatchObject({
        status: 'refresh-failed',
        acknowledgedRevision: 1,
      })
    })
    expect(controlled.setCellInput).toHaveBeenCalledTimes(1)
    expect(screen.getByText('This edit was saved, but the sheet could not be refreshed.')).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: 'Retry refresh' }))
    await waitFor(() => expect(store.getter(editingCommitLifecycleAtom).status).toBe('ready'))
    expect(controlled.setCellInput).toHaveBeenCalledTimes(1)
    expect(await firstCell()).toHaveTextContent('Saved once')
  })
})
