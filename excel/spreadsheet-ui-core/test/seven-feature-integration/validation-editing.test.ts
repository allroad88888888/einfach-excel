import { expect, test } from 'vitest'
import { fixture } from '../advanced-validation/fixture'
import { commitCellEditingAtom } from '../../src/editing/commit-cell-editing'
import { editingCommitLifecycleAtom } from '../../src/editing/commit-state'
import {
  cancelEditingAtom,
  editingDraftAtom,
  editingSessionAtom,
  startEditingAtom,
} from '../../src/editing/session-atoms'
import { nativeValidationConfirmationAtom } from '../../src/data-validation/advanced/confirmation-state'

async function rejectedInput() {
  const context = fixture()
  context.store.setter(startEditingAtom, {
    sheetId: 's', cell: { row: 1, col: 1 }, source: 'formula-bar', draft: '-1',
  })
  context.request.mockRejectedValueOnce(Object.assign(new Error('DATA_VALIDATION_FAILED'), {
    detail: { title: 'Check quantity', message: 'Enter a positive quantity.' },
  }))
  expect(await context.store.setter(commitCellEditingAtom)).toBe('rejected')
  expect(context.store.getter(editingCommitLifecycleAtom).status).toBe('rejected')
  expect(context.request).toHaveBeenCalledTimes(1)
  return context
}

test('refocusing an unchanged rejected formula-bar draft preserves native Stop feedback', async () => {
  const { store, request } = await rejectedInput()
  const session = store.getter(editingSessionAtom)
  const feedback = store.getter(nativeValidationConfirmationAtom)
  expect(feedback).toMatchObject({
    style: 'stop', title: 'Check quantity', message: 'Enter a positive quantity.',
  })
  store.setter(editingDraftAtom, { draft: '-1', source: 'formula-bar' })
  expect(store.getter(nativeValidationConfirmationAtom)).toBe(feedback)
  expect(store.getter(editingSessionAtom)).toBe(session)
  store.setter(editingDraftAtom, { draft: '-1' })
  expect(store.getter(editingSessionAtom)).toBe(session)
  expect(store.getter(nativeValidationConfirmationAtom)).toBe(feedback)
  expect(request).toHaveBeenCalledTimes(1)
})

test.each(['draft', 'source', 'new session'] as const)(
  'a changed %s still invalidates the rejected input feedback', async (change) => {
    const { store, request } = await rejectedInput()
    const session = store.getter(editingSessionAtom)
    if (change === 'draft') store.setter(editingDraftAtom, { draft: '2' })
    else if (change === 'source') store.setter(editingDraftAtom, { draft: '-1', source: 'cell' })
    else {
      store.setter(cancelEditingAtom)
      store.setter(startEditingAtom, {
        sheetId: 's', cell: { row: 1, col: 1 }, source: 'formula-bar', draft: '-1',
      })
    }
    expect(store.getter(editingSessionAtom)).not.toBe(session)
    expect(store.getter(nativeValidationConfirmationAtom)).toBeNull()
    expect(request).toHaveBeenCalledTimes(1)
  },
)
