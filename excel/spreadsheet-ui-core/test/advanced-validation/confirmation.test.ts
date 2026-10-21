import { expect, test } from 'vitest'
import { fixture } from './fixture'
import { projectionSnapshotAtom } from '../../src/projection'
import { nativeValidationConfirmationAtom, offerNativeValidationConfirmationAtom,
  validationErrorStyle } from '../../src/data-validation/advanced/confirmation-state'
import { runNativeValidationConfirmationAtom } from '../../src/data-validation/advanced/confirmation-command'
import { startEditingAtom, editingSessionAtom } from '../../src/editing/session-atoms'
import type { RustWorkbookCommands } from '../../src/rust-workbook/commands'

function offerPaste() {
  const context = fixture()
  const witness = context.store.getter(projectionSnapshotAtom)
  if (witness.request?.kind !== 'visible-window') throw new Error('Expected visible projection')
  const payload: RustWorkbookCommands['clipboard.paste']['payload'] = {
    request: { sheetId: 's', requestId: witness.request.requestId, row: 1, col: 1,
      text: '7\t8', token: 'original', rowCount: 100, colCount: 8 }, projection: witness.request,
  }
  context.store.setter(offerNativeValidationConfirmationAtom, { error: Object.assign(new Error('DATA_VALIDATION_WARNING'),
    { detail: { title: 'Review quantity', message: 'Please check' } }), operation: { command: 'clipboard.paste', payload }, witness })
  return { ...context, payload, alert: () => context.store.getter(nativeValidationConfirmationAtom),
    runConfirmation: (action: 'continue' | 'cancel') => context.store.setter(runNativeValidationConfirmationAtom, action) }
}

test('warning Continue replays the exact batch and revision once; Cancel makes no request', async () => {
  const { alert, request, payload, runConfirmation } = offerPaste()
  expect(alert()).toMatchObject({ style: 'warning', title: 'Review quantity', message: 'Please check' })
  ;(payload.request as { text: string }).text = 'changed external clipboard'
  expect(await runConfirmation('continue')).toBe(true)
  expect(request).toHaveBeenCalledExactlyOnceWith('clipboard.paste', expect.objectContaining({
    request: expect.objectContaining({ text: '7\t8', token: 'original', row: 1, col: 1,
      validationConfirmation: 'continue', validationRevision: 1 }),
  }))
  expect(alert()).toBeNull()
  const cancelled = offerPaste()
  expect(await cancelled.runConfirmation('cancel')).toBe(true)
  expect(cancelled.request).not.toHaveBeenCalled()
})

test('changed revision blocks confirmation before transport', async () => {
  const { alert, project, request, runConfirmation } = offerPaste()
  project(2)
  expect(await runConfirmation('continue')).toBe(false)
  expect(alert()?.error).toContain('workbook changed')
  expect(request).not.toHaveBeenCalled()
})

test('pending confirmation blocks duplicates and Cancel; native rejection retains original payload', async () => {
  const { alert, request, runConfirmation } = offerPaste()
  let fail!: (error: Error) => void
  request.mockImplementationOnce(() => new Promise((_, reject) => { fail = reject }))
  const pending = runConfirmation('continue')
  expect(alert()?.busy).toBe(true)
  expect(await runConfirmation('continue')).toBe(false)
  expect(await runConfirmation('cancel')).toBe(false)
  fail(new Error('Native protection changed'))
  expect(await pending).toBe(false)
  expect(alert()).toMatchObject({ busy: false, error: 'Native protection changed' })
  expect(request).toHaveBeenCalledTimes(1)
})

test('Stop never offers a native continuation and cancelling preserves the editing draft', async () => {
  const { store, request } = fixture()
  store.setter(startEditingAtom, { sheetId: 's', cell: { row: 1, col: 1 }, source: 'cell', draft: 'invalid' })
  store.setter(offerNativeValidationConfirmationAtom, { error: new Error('DATA_VALIDATION_FAILED'), operation: { command: 'cell.setInput' } })
  expect(await store.setter(runNativeValidationConfirmationAtom, 'continue')).toBe(false)
  expect(await store.setter(runNativeValidationConfirmationAtom, 'cancel')).toBe(true)
  expect(store.getter(editingSessionAtom).draft).toBe('invalid')
  expect(request).not.toHaveBeenCalled()
})

test('only native validation error codes can create a confirmation', () => {
  expect(validationErrorStyle(new Error('auto-fill rejected: DATA_VALIDATION_INFORMATION'))).toBe('information')
  expect(validationErrorStyle(new Error('old DATA_VALIDATION_WARNING unrelated'))).toBeNull()
  expect(validationErrorStyle(new Error('unrelated: DATA_VALIDATION_WARNING'))).toBeNull()
  expect(validationErrorStyle('DATA_VALIDATION_FAILED')).toBe('stop')
})

test('a Stop discovered during confirmed batch submission removes Continue and uses its own message', async () => {
  const { alert, request, runConfirmation } = offerPaste()
  request.mockRejectedValueOnce(Object.assign(new Error('DATA_VALIDATION_FAILED'),
    { detail: { title: 'Stop here', message: 'A different cell is invalid' } }))
  expect(await runConfirmation('continue')).toBe(false)
  expect(alert()).toMatchObject({ style: 'stop', title: 'Stop here', message: 'A different cell is invalid', busy: false })
  expect(await runConfirmation('continue')).toBe(false)
  expect(request).toHaveBeenCalledTimes(1)
})
