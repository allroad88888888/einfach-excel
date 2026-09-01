import { createStore, type Store } from '@einfach/core'
import {
  editingCommitLifecycleAtom,
  editingSessionAtom,
  setSelectionBoundsAtom,
  setSelectionAtom,
  type EditingCommitRequest,
  type SpreadsheetBackend,
  type VisibleProjectionRequest,
  type VisibleProjectionResult,
} from '@einfach/spreadsheet-ui-core'
import { describe, expect, it, jest } from '@jest/globals'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ComponentType } from 'react'
import { DEMO_COLUMNS, DEMO_SHEET_ROW_COUNT } from '../demo/demo-data'
import { SpreadsheetUiProvider } from '../src/spreadsheet-ui-provider'

const { RustWorksheet } = jest.requireActual('../demo/RustWorksheet') as {
  RustWorksheet: ComponentType
}

interface ControlledBackend {
  readonly backend: SpreadsheetBackend
  readonly readVisibleProjection: jest.MockedFunction<SpreadsheetBackend['readVisibleProjection']>
  readonly setCellInput: jest.MockedFunction<SpreadsheetBackend['setCellInput']>
  failNextMutation(message: string): void
  failNextRefresh(message: string): void
}

function createControlledBackend(): ControlledBackend {
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
            (row === 0 ? DEMO_COLUMNS[col]!.label : `R${row}C${col}`),
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
    backend: { readVisibleProjection, setCellInput } as unknown as SpreadsheetBackend,
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

function renderWorksheet(controlled: ControlledBackend): Store {
  const store = createStore()
  store.setter(setSelectionBoundsAtom, {
    rowCount: DEMO_SHEET_ROW_COUNT,
    colCount: DEMO_COLUMNS.length,
  })
  render(
    <SpreadsheetUiProvider backend={controlled.backend} store={store}>
      <RustWorksheet />
    </SpreadsheetUiProvider>,
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

describe('Rust demo cell editing', () => {
  it('starts, updates the draft, writes through Rust and refreshes the projection', async () => {
    const controlled = createControlledBackend()
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

  it('uses the range focus cell for keyboard editing and mutation', async () => {
    const controlled = createControlledBackend()
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
    const controlled = createControlledBackend()
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
    const controlled = createControlledBackend()
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
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Retry changed' } })
    expect(store.getter(editingSessionAtom).draft).toBe('Retry changed')
    expect(controlled.readVisibleProjection).toHaveBeenCalledTimes(1)
  })

  it('retains refresh retry authority after one acknowledged mutation', async () => {
    const controlled = createControlledBackend()
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
