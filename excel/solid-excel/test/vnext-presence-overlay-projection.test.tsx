/** @jsxImportSource solid-js */

import { afterEach, describe, expect, it } from '@jest/globals'
import { createStore } from '@einfach/core'
import { cleanup, render, waitFor } from '@solidjs/testing-library'
import {
  applyPresenceUpdateAtom,
  remoteCursorsAtom,
  setWorkspaceActiveSheetAtom,
  type SpreadsheetBackend,
  workspaceSessionAtom,
} from '@einfach/spreadsheet-ui-core'
import { SpreadsheetPresenceOverlay } from '../src/presence'
import { SpreadsheetUiProvider } from '../src/provider'

afterEach(cleanup)

function createBackend(): SpreadsheetBackend {
  return {
    async readVisibleProjection() {
      throw new Error('not used')
    },
    async readRangeProjection() {
      throw new Error('not used')
    },
    async setCellInput() {
      throw new Error('not used')
    },
  }
}

function joinAndPlaceCursor(
  store: ReturnType<typeof createStore>,
  participantId: string,
  sheetId: string,
) {
  store.setter(applyPresenceUpdateAtom, {
    kind: 'join',
    participant: { id: participantId, displayName: participantId, lastSeenAt: 1_000 },
  })
  store.setter(applyPresenceUpdateAtom, {
    kind: 'cursor',
    participantId,
    sheetId,
    selection: {
      kind: 'cell',
      sheetId,
      anchor: { row: 0, col: 0 },
      focus: { row: 0, col: 0 },
    },
  })
}

describe('SpreadsheetPresenceOverlay projection', () => {
  it('follows the Core active-sheet Atom when no explicit sheet is supplied', async () => {
    const store = createStore()
    const backend = createBackend()
    store.setter(setWorkspaceActiveSheetAtom, { sheetId: 'sheet-1' })
    joinAndPlaceCursor(store, 'alice', 'sheet-1')
    joinAndPlaceCursor(store, 'bob', 'sheet-2')
    expect(store.getter(workspaceSessionAtom).activeSheetId).toBe('sheet-1')
    expect(store.getter(remoteCursorsAtom)).toHaveLength(2)

    const { container } = render(() => (
      <SpreadsheetUiProvider backend={backend} store={store}>
        <SpreadsheetPresenceOverlay />
      </SpreadsheetUiProvider>
    ))

    expect(store.getter(workspaceSessionAtom).activeSheetId).toBe('sheet-1')
    expect(store.getter(remoteCursorsAtom)).toHaveLength(2)

    await waitFor(() => {
      expect(container.querySelector('[data-testid="presence-cursor-alice"]')).toBeTruthy()
      expect(container.querySelector('[data-testid="presence-cursor-bob"]')).toBeNull()
    })

    store.setter(setWorkspaceActiveSheetAtom, { sheetId: 'sheet-2' })

    await waitFor(() => {
      expect(container.querySelector('[data-testid="presence-cursor-alice"]')).toBeNull()
      expect(container.querySelector('[data-testid="presence-cursor-bob"]')).toBeTruthy()
    })
  })

  it('keeps non-interactive cursor decorations out of the accessibility tree', () => {
    const store = createStore()
    joinAndPlaceCursor(store, 'alice', 'sheet-1')

    const { getByTestId } = render(() => (
      <SpreadsheetUiProvider backend={createBackend()} store={store}>
        <SpreadsheetPresenceOverlay />
      </SpreadsheetUiProvider>
    ))

    expect(getByTestId('presence-overlay').getAttribute('aria-hidden')).toBe('true')
  })
})
