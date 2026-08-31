/** @jsxImportSource solid-js */

import { afterEach, describe, expect, it } from '@jest/globals'
import { createStore } from '@einfach/core'
import { cleanup, render, waitFor } from '@solidjs/testing-library'
import {
  applyPresenceUpdateAtom,
  remoteCursorsAtom,
  setWorkspaceActiveSheetAtom,
  type SpreadsheetBackend,
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

describe('SpreadsheetPresenceOverlay DOM geometry', () => {
  it('uses the supplied current-sheet DOM rect and participant identity', async () => {
    const store = createStore()
    store.setter(setWorkspaceActiveSheetAtom, { sheetId: 'sheet-1' })
    const calls: string[] = []
    const { getByTestId, queryByTestId } = render(() => (
      <SpreadsheetUiProvider backend={createBackend()} store={store}>
        <SpreadsheetPresenceOverlay
          activeSheetId="sheet-1"
          resolveSelectionRect={(sheetId, selection) => {
            calls.push(`${sheetId}:${selection.kind}`)
            return { left: 41, top: 22, width: 80, height: 25 }
          }}
        />
      </SpreadsheetUiProvider>
    ))
    store.setter(applyPresenceUpdateAtom, {
      kind: 'join',
      participant: { id: 'alice', displayName: 'Alice A', colorHint: '#3b82f6', lastSeenAt: 1 },
    })
    store.setter(applyPresenceUpdateAtom, {
      kind: 'join',
      participant: { id: 'bob', displayName: 'Bob B', colorHint: '#ef4444', lastSeenAt: 1 },
    })
    store.setter(applyPresenceUpdateAtom, {
      kind: 'cursor',
      participantId: 'alice',
      sheetId: 'sheet-1',
      selection: {
        kind: 'range',
        sheetId: 'sheet-1',
        anchor: { row: 3, col: 4 },
        focus: { row: 5, col: 6 },
      },
    })
    store.setter(applyPresenceUpdateAtom, {
      kind: 'cursor',
      participantId: 'bob',
      sheetId: 'sheet-2',
      selection: {
        kind: 'cell',
        sheetId: 'sheet-2',
        anchor: { row: 0, col: 0 },
        focus: { row: 0, col: 0 },
      },
    })
    expect(store.getter(remoteCursorsAtom)).toHaveLength(2)

    await waitFor(() => {
      const marker = getByTestId('presence-cursor-alice') as HTMLElement
      expect(marker.style.left).toBe('41px')
      expect(marker.style.top).toBe('22px')
      expect(marker.style.width).toBe('80px')
      expect(marker.style.height).toBe('25px')
      expect(marker.style.getPropertyValue('--presence-color')).toBe('#3b82f6')
    })
    expect(calls).toContain('sheet-1:range')
    expect(getByTestId('presence-label-alice').textContent).toBe('Alice A')
    expect(queryByTestId('presence-cursor-bob')).toBeNull()
    expect(getByTestId('presence-overlay').getAttribute('aria-hidden')).toBe('true')
  })
})
