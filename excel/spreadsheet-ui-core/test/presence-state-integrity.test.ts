import { describe, expect, test } from 'vitest'
import { createStore } from '@einfach/core'
import { applyPresenceUpdateAtom, presenceStateAtom, remoteCursorsAtom } from '../src/presence'

function cursorUpdate(participantId: string, sheetId: string, selectionSheetId = sheetId) {
  return {
    kind: 'cursor' as const,
    participantId,
    sheetId,
    selection: {
      kind: 'cell' as const,
      sheetId: selectionSheetId,
      anchor: { row: 1, col: 2 },
      focus: { row: 1, col: 2 },
    },
  }
}

describe('presence cursor input integrity', () => {
  test('ignores cursors that cannot be attributed to a joined participant or one sheet', () => {
    const store = createStore()
    const initialState = store.getter(presenceStateAtom)

    store.setter(applyPresenceUpdateAtom, cursorUpdate('unknown', 'sheet-1'))

    expect(store.getter(presenceStateAtom)).toBe(initialState)
    expect(store.getter(remoteCursorsAtom)).toEqual([])

    store.setter(applyPresenceUpdateAtom, {
      kind: 'join',
      participant: { id: 'alice', displayName: 'Alice', lastSeenAt: 1_000 },
    })
    const joinedState = store.getter(presenceStateAtom)

    store.setter(applyPresenceUpdateAtom, cursorUpdate('alice', 'sheet-1', 'sheet-2'))

    expect(store.getter(presenceStateAtom)).toBe(joinedState)
    expect(store.getter(remoteCursorsAtom)).toEqual([])
  })
})
