import { createStore } from '@einfach/core'
import { describe, expect, test } from '@jest/globals'

import { commitCellEditingAtom, historyStackAtom } from '../src'
import { bindEditingMutation, startCellEdit } from './editing-test-support'

describe('editing history projection', () => {
  test('does not invent UI history before Rust exposes replay commands', async () => {
    const store = createStore()
    bindEditingMutation(store, async (request) => ({
      sheetId: request.sheetId,
      requestId: request.requestId,
      revision: 'rev-without-replay',
    }))
    startCellEdit(store, 'untracked')

    await expect(
      store.setter(commitCellEditingAtom),
    ).resolves.toBe('completed')

    expect(store.getter(historyStackAtom)).toMatchObject({ cursor: 0, entries: [] })
  })
})
