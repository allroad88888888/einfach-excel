import { createStore } from '@einfach/core'
import { describe, expect, test } from '@jest/globals'

import {
  commitCellEditingAtom,
  editingCommitLifecycleAtom,
  editingSessionAtom,
  startEditingAtom,
  type EditingCommitRequest,
  type EditingStartInput,
} from '../src/editing'
import { bindEditingMutation, startCellEdit } from './editing-test-support'

describe('editing commit settlement', () => {
  test('retains the frozen draft after a rejected transport and permits an explicit retry', async () => {
    const store = createStore()
    let attempts = 0
    const seenInputs: string[] = []
    startCellEdit(store, '=SUM(A1:A3)')

    const source = {
      async setCellInput(request: EditingCommitRequest) {
        attempts += 1
        seenInputs.push(request.input)
        if (attempts === 1) throw new Error('backend rejected edit')
        return {
          sheetId: request.sheetId,
          requestId: request.requestId,
          revision: 'rev-retry',
        }
      },
    }
    bindEditingMutation(store, source.setCellInput)

    await expect(
      store.setter(commitCellEditingAtom),
    ).resolves.toBe('rejected')
    expect(store.getter(editingCommitLifecycleAtom).status).toBe('rejected')
    expect(store.getter(editingSessionAtom)).toMatchObject({
      status: 'drafting',
      draft: '=SUM(A1:A3)',
    })

    await expect(
      store.setter(commitCellEditingAtom),
    ).resolves.toBe('completed')
    expect(attempts).toBe(2)
    expect(seenInputs).toEqual(['=SUM(A1:A3)', '=SUM(A1:A3)'])
  })

  test('keeps the ticket active while publishing the terminal session', async () => {
    const store = createStore()
    startCellEdit(store, 'clear active last')
    let idleReplacementAttempts = 0
    const replacementInput: EditingStartInput = {
      sheetId: 'replacement',
      cell: { row: 9, col: 9 },
      draft: 'replacement',
      source: 'keyboard',
    }
    const unsubscribeSession = store.sub(editingSessionAtom, () => {
      if (idleReplacementAttempts === 0 && store.getter(editingSessionAtom).status === 'idle') {
        idleReplacementAttempts += 1
        store.setter(startEditingAtom, replacementInput)
      }
    })
    bindEditingMutation(store, async (request) => ({
      sheetId: request.sheetId,
      requestId: request.requestId,
      revision: 'rev-clear-last',
    }))

    await expect(
      store.setter(commitCellEditingAtom),
    ).resolves.toBe('completed')
    unsubscribeSession()

    expect(idleReplacementAttempts).toBe(1)
    expect(store.getter(editingSessionAtom).status).toBe('idle')

    store.setter(startEditingAtom, replacementInput)
    expect(store.getter(editingSessionAtom)).toMatchObject({
      status: 'drafting',
      source: { sheetId: 'replacement', cell: { row: 9, col: 9 } },
      draft: 'replacement',
    })
  })
})
