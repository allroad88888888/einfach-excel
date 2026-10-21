import { expect, test } from 'vitest'
import { fixture } from './fixture'
import { setRustWorkbookConnectionAtom } from '../../src/runtime/workbook-connection'
import type { RustWorkbookConnection } from '../../src/rust-workbook/commands'

test('custom formula prompt and warning round trip the existing native validation commands', async () => {
  const { run, panel, request } = fixture({ kind: 'custom-formula', formula: '=B2>0', ignoreBlank: false,
    anchor: { row: 1, col: 1 }, inputMessage: { title: 'Quantity', message: 'Enter quantity' },
    errorAlert: { style: 'warning', title: 'Check', message: 'Positive only' } })
  expect(await run('open')).toBe(true)
  expect(panel()).toMatchObject({ kind: 'custom-formula', formula: '=B2>0', range: 'B2:B3',
    showInputMessage: true, inputTitle: 'Quantity', inputMessage: 'Enter quantity',
    errorStyle: 'warning', errorTitle: 'Check', errorMessage: 'Positive only' })
  await run({ formula: '=B2>1', errorStyle: 'information', min: '', max: '' })
  expect(await run('save')).toBe(true)
  expect(request.mock.calls[1]).toMatchObject(['validation.change', { rule: {
    kind: 'custom-formula', formula: '=B2>1', ignoreBlank: false,
    inputMessage: { title: 'Quantity', message: 'Enter quantity' },
    errorAlert: { style: 'information', title: 'Check', message: 'Positive only' },
  } }])
  expect(panel().sheetId).toBeNull()
})

test('blank formula is a recoverable draft and explicit clear ignores it', async () => {
  const { run, panel, request } = fixture()
  await run('open'); await run({ kind: 'custom-formula', formula: '' })
  expect(await run('save')).toBe(false)
  expect(panel().error).toBe('Enter a validation formula.')
  expect(request).toHaveBeenCalledTimes(1)
  expect(await run('clear')).toBe(true)
  expect(request.mock.calls[1]).toMatchObject(['validation.change', { rule: null }])
})

test('reading permits cancellation; late success or error cannot reopen the editor', async () => {
  for (const reject of [false, true]) {
    const { run, panel, request } = fixture()
    let finish!: (value: unknown) => void
    request.mockImplementationOnce(() => new Promise((resolve, rejectRequest) => {
      finish = reject ? rejectRequest : resolve
    }))
    const pending = run('open')
    expect(panel()).toMatchObject({ busy: true, phase: 'reading' })
    expect(await run('close')).toBe(true)
    finish(reject ? new Error('late') : null)
    expect(await pending).toBe(false)
    expect(panel().sheetId).toBeNull()
  }
})

test('saving rejects duplicates and cancellation; failed native save keeps all draft fields', async () => {
  const { run, panel, request } = fixture()
  await run('open'); await run({ kind: 'custom-formula', formula: '=B2>0', errorTitle: 'Retry' })
  let fail!: (error: Error) => void
  request.mockImplementationOnce(() => new Promise((_, reject) => { fail = reject }))
  const pending = run('save')
  expect(panel()).toMatchObject({ busy: true, phase: 'saving' })
  expect(await run('save')).toBe(false); expect(await run('close')).toBe(false)
  fail(new Error('Native save failed'))
  expect(await pending).toBe(false)
  expect(panel()).toMatchObject({ busy: false, formula: '=B2>0', errorTitle: 'Retry', error: 'Native save failed' })
})

test('replacement connection cannot receive an old read or write result', async () => {
  const { store, run, panel, request } = fixture()
  let finish!: (value: unknown) => void
  request.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  const pending = run('open')
  store.setter(setRustWorkbookConnectionAtom, { request: request as RustWorkbookConnection['request'], dispose() {} })
  finish({ kind: 'custom-formula', formula: '=TRUE', ignoreBlank: true })
  expect(await pending).toBe(false); expect(panel().sheetId).toBeNull()
})
