import { describe, expect, test } from 'vitest'
import { createStore } from '@einfach/core'
import {
  beginNameManagerTableRenameAtom,
  cancelNameManagerTableRenameAtom,
  nameManagerTableEditorAtom,
  resetNameManagerTableEditorAtom,
  setNameManagerTablePendingDeleteAtom,
  settleNameManagerTableRenameAtom,
  updateNameManagerTableRenameDraftAtom,
} from '../src/named-ranges'

describe('Name manager table editor atoms', () => {
  test('owns rename and delete-confirm drafts for its current manager session', () => {
    const store = createStore()

    store.setter(resetNameManagerTableEditorAtom, 12)
    store.setter(beginNameManagerTableRenameAtom, { sessionId: 12, name: 'Sales' })
    store.setter(updateNameManagerTableRenameDraftAtom, { sessionId: 12, value: 'Revenue' })
    store.setter(setNameManagerTablePendingDeleteAtom, { sessionId: 12, name: 'Costs' })

    expect(store.getter(nameManagerTableEditorAtom)).toEqual({
      sessionId: 12,
      renamingTable: 'Sales',
      renameDraft: 'Revenue',
      pendingDeleteTable: 'Costs',
    })
  })

  test('rejects stale session writes and clears only a matching applied rename', () => {
    const store = createStore()

    store.setter(resetNameManagerTableEditorAtom, 4)
    store.setter(beginNameManagerTableRenameAtom, { sessionId: 4, name: 'Sales' })
    store.setter(updateNameManagerTableRenameDraftAtom, { sessionId: 3, value: 'Ignored' })
    store.setter(setNameManagerTablePendingDeleteAtom, { sessionId: 3, name: 'Ignored' })
    store.setter(settleNameManagerTableRenameAtom, {
      sessionId: 4,
      from: 'Costs',
      to: 'Expenses',
    })

    expect(store.getter(nameManagerTableEditorAtom)).toMatchObject({
      sessionId: 4,
      renamingTable: 'Sales',
      renameDraft: 'Sales',
      pendingDeleteTable: null,
    })

    store.setter(settleNameManagerTableRenameAtom, {
      sessionId: 4,
      from: 'Sales',
      to: 'Revenue',
    })
    expect(store.getter(nameManagerTableEditorAtom)).toMatchObject({
      renamingTable: null,
      renameDraft: '',
    })

    store.setter(cancelNameManagerTableRenameAtom, 3)
    expect(store.getter(nameManagerTableEditorAtom).sessionId).toBe(4)
  })
})
