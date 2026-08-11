/** @jsxImportSource solid-js */

import { afterEach, describe, expect, it } from '@jest/globals'
import { createStore } from '@einfach/core'
import { cleanup, fireEvent, render, waitFor } from '@solidjs/testing-library'
import { menuStateAtom, openMenuAtom, type SpreadsheetBackend } from '@einfach/spreadsheet-ui-core'

import { SpreadsheetContextMenu } from '../src-vnext/context-menu'
import { SpreadsheetUiProvider } from '../src-vnext/provider'

afterEach(cleanup)

function createBackend(): SpreadsheetBackend {
  return {
    async readVisibleProjection(request) {
      return {
        kind: 'visible-window',
        sheetId: request.sheetId,
        requestId: request.requestId,
        revision: request.revision,
        window: request.window,
        cells: [],
      }
    },
    async readRangeProjection(request) {
      return {
        kind: 'range',
        sheetId: request.sheetId,
        requestId: request.requestId,
        revision: request.revision,
        range: request.range,
        cells: [],
      }
    },
    async setCellInput(request) {
      return {
        sheetId: request.sheetId,
        requestId: request.requestId,
        revision: request.revision,
        affectedRange: {
          rowStart: request.row,
          rowEnd: request.row,
          colStart: request.col,
          colEnd: request.col,
        },
      }
    },
  }
}

describe('vNext context-menu keyboard interaction', () => {
  it('moves focus inside a keyboard-opened menu and returns it on Escape', async () => {
    const store = createStore()
    const { getByTestId, queryByTestId } = render(() => (
      <>
        <button data-testid="opener" type="button">
          Open
        </button>
        <SpreadsheetUiProvider backend={createBackend()} store={store}>
          <SpreadsheetContextMenu />
        </SpreadsheetUiProvider>
      </>
    ))
    const opener = getByTestId('opener') as HTMLButtonElement
    opener.focus()
    store.setter(openMenuAtom, {
      surface: 'cell',
      target: { kind: 'cell', sheetId: 'sheet-1', cell: { row: 3, col: 2 } },
      position: { x: 12, y: 8 },
      source: 'keyboard',
    })

    const copy = getByTestId('context-menu-command-clipboard.copy')
    const cut = getByTestId('context-menu-command-clipboard.cut')
    const freezeColumns = getByTestId('context-menu-command-view.freezeColsHere')
    await waitFor(() => expect(document.activeElement).toBe(copy))

    fireEvent.keyDown(copy, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(cut)
    fireEvent.keyDown(cut, { key: 'End' })
    expect(document.activeElement).toBe(freezeColumns)
    fireEvent.keyDown(freezeColumns, { key: 'Escape' })

    await waitFor(() => {
      expect(queryByTestId('spreadsheet-context-menu')).toBeNull()
      expect(store.getter(menuStateAtom).status).toBe('closed')
      expect(document.activeElement).toBe(opener)
    })
  })

  it('uses the shared manifest for row, column, all, and sheet-tab targets', async () => {
    const store = createStore()
    const { getByTestId, queryByTestId } = render(() => (
      <SpreadsheetUiProvider backend={createBackend()} store={store}>
        <SpreadsheetContextMenu />
      </SpreadsheetUiProvider>
    ))

    store.setter(openMenuAtom, {
      surface: 'header',
      target: { kind: 'row', sheetId: 'sheet-1', rowIndex: 4 },
      position: { x: 0, y: 0 },
    })
    await waitFor(() => expect(getByTestId('context-menu-command-row.insert')).toBeTruthy())
    expect(queryByTestId('context-menu-command-clipboard.copy')).toBeNull()

    store.setter(openMenuAtom, {
      surface: 'header',
      target: { kind: 'column', sheetId: 'sheet-1', colIndex: 4 },
      position: { x: 0, y: 0 },
    })
    await waitFor(() => expect(getByTestId('context-menu-command-column.insert')).toBeTruthy())
    expect(queryByTestId('context-menu-command-row.insert')).toBeNull()

    store.setter(openMenuAtom, {
      surface: 'context',
      target: { kind: 'all', sheetId: 'sheet-1' },
      position: { x: 0, y: 0 },
    })
    await waitFor(() => expect(getByTestId('context-menu-command-row.insert')).toBeTruthy())
    expect(getByTestId('context-menu-command-column.delete')).toBeTruthy()

    store.setter(openMenuAtom, {
      surface: 'context',
      target: { kind: 'sheet-tab', sheetId: 'sheet-1' },
      position: { x: 0, y: 0 },
    })
    await waitFor(() => expect(getByTestId('spreadsheet-context-menu').childElementCount).toBe(0))
  })
})
