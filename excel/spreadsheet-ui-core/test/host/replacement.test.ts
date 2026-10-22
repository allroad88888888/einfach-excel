import { createStore } from '@einfach/core'
import { expect, test, vi } from 'vitest'
import { configureHostControlsAtom, disposeRustWorkbookRuntimeAtom, hostControlsAtom,
  replaceRustWorkbookRuntimeAtom, rustWorkbookConnectionAtom, startRustWorkbookRuntimeAtom,
  workbookChangeAtom, workbookReplacementErrorAtom } from '../../src'
import type { WorkerLike } from '../../src/rust-worker/types'
import { TEST_FUNCTION_CATALOG } from '../support/function-catalog'

function worker(fail = '', pause = '') {
  let listener: ((event: MessageEvent) => void) | undefined
  const commands: { command: string; payload: unknown }[] = []
  const terminate = vi.fn()
  let release: (() => void) | undefined
  const instance: WorkerLike = {
    postMessage(message) {
      const request = message as { id: number; command: string; payload: Record<string, unknown> }
      commands.push(request)
      if (request.command === 'formula.awaitAsync') return
      const result = request.command === 'formula.catalog' ? TEST_FUNCTION_CATALOG :
        request.command === 'workbook.initialize'
          ? (request.payload.sheets as { id: string; name: string }[]).map((sheet, index) =>
            ({ ...sheet, index, rowCount: 20, colCount: 8 })) :
        request.command === 'workbook.openFile' ? { title: 'Opened', sheets: [
          { id: 'new', key: '44', name: 'Opened', index: 0, rowCount: 20, colCount: 8 },
        ] } : undefined
      const respond = () => listener?.({ data: request.command === fail
        ? { id: request.id, ok: false, error: { code: 'FAILED', message: 'candidate failed' } }
        : { id: request.id, ok: true, result } } as MessageEvent)
      if (request.command === pause && !release) release = respond
      else respond()
    },
    addEventListener(type, callback) { if (type === 'message') listener = callback },
    removeEventListener(type) { if (type === 'message') listener = undefined }, terminate,
  }
  return { instance, commands, terminate, release: () => release?.() }
}
const definition = { title: 'Old', sheets: [{ id: 'old', name: 'Old', rowCount: 20, colCount: 8 }],
  createImportChunks: () => [] }

test.each(['workbook.openFile', 'host.configure'])('failed %s preserves old workbook and publishes no successful import', async (failure) => {
  const old = worker(), candidate = worker(failure), store = createStore()
  const factory = vi.fn().mockReturnValueOnce(old.instance).mockReturnValue(candidate.instance)
  await store.setter(startRustWorkbookRuntimeAtom, { workerFactory: factory, definition })
  const previous = store.getter(rustWorkbookConnectionAtom)
  const event = store.getter(workbookChangeAtom)
  expect(await store.setter(replaceRustWorkbookRuntimeAtom, 'memory text')).toBe(false)
  expect(store.getter(workbookReplacementErrorAtom)!.message).toBe('candidate failed')
  expect(store.getter(rustWorkbookConnectionAtom)).toBe(previous)
  expect(store.getter(workbookChangeAtom)).toBe(event)
  expect(old.terminate).not.toHaveBeenCalled()
  expect(candidate.terminate).toHaveBeenCalledOnce()
  store.setter(disposeRustWorkbookRuntimeAtom)
})

test('successful replacement and same Store restart restore controls and issue distinct import identities', async () => {
  const old = worker(), candidate = worker(), restarted = worker(), store = createStore()
  const factory = vi.fn().mockReturnValueOnce(old.instance).mockReturnValueOnce(candidate.instance)
    .mockReturnValue(restarted.instance)
  await store.setter(configureHostControlsAtom, { busy: true, allowSheetStructure: false })
  await store.setter(startRustWorkbookRuntimeAtom, { workerFactory: factory, definition })
  const first = store.getter(workbookChangeAtom)!
  expect(first.source).toBe('import')
  expect(old.commands.find((command) => command.command === 'host.configure')!.payload)
    .toEqual(store.getter(hostControlsAtom))
  await store.setter(configureHostControlsAtom, { busy: false })
  expect(await store.setter(replaceRustWorkbookRuntimeAtom, 'memory text')).toBe(true)
  const second = store.getter(workbookChangeAtom)!
  expect(second.connectionId).not.toBe(first.connectionId)
  expect(candidate.commands.find((command) => command.command === 'host.configure')!.payload)
    .toEqual({ readOnly: false, busy: false, allowSheetStructure: false })
  expect(old.terminate).toHaveBeenCalledOnce()
  await store.setter(configureHostControlsAtom, { readOnly: true })
  expect(await store.setter(replaceRustWorkbookRuntimeAtom, null)).toBe(false)
  expect(store.getter(workbookReplacementErrorAtom)!.code).toBe('HOST_READ_ONLY')
  await store.setter(startRustWorkbookRuntimeAtom, { workerFactory: factory, definition })
  expect(store.getter(workbookChangeAtom)!.connectionId).not.toBe(second.connectionId)
  expect(restarted.commands.find((command) => command.command === 'host.configure')!.payload)
    .toEqual({ readOnly: true, busy: false, allowSheetStructure: false })
  store.setter(disposeRustWorkbookRuntimeAtom)
})

for (const pause of ['workbook.openFile', 'formula.catalog', 'host.configure']) {
  test.each(['readOnly', 'busy'] as const)(`replacement rechecks latest %s after delayed ${pause}`, async (control) => {
    const old = worker(), candidate = worker('', pause), store = createStore()
    const factory = vi.fn().mockReturnValueOnce(old.instance).mockReturnValue(candidate.instance)
    await store.setter(startRustWorkbookRuntimeAtom, { workerFactory: factory, definition })
    const previous = store.getter(rustWorkbookConnectionAtom)
    const event = store.getter(workbookChangeAtom)
    const replacement = store.setter(replaceRustWorkbookRuntimeAtom, 'memory text')
    // 等候选确实停在指定 await，再修改运行期控制。
    await vi.waitFor(() =>
      expect(candidate.commands.some((entry) => entry.command === pause)).toBe(true))
    await store.setter(configureHostControlsAtom, { [control]: true })
    candidate.release()
    expect(await replacement).toBe(false)
    expect(store.getter(workbookReplacementErrorAtom)!.code).toBe(control === 'readOnly' ? 'HOST_READ_ONLY' : 'HOST_BUSY')
    expect(store.getter(rustWorkbookConnectionAtom)).toBe(previous)
    expect(store.getter(workbookChangeAtom)).toBe(event)
    expect(old.terminate).not.toHaveBeenCalled()
    expect(candidate.terminate).toHaveBeenCalledOnce()
    store.setter(disposeRustWorkbookRuntimeAtom)
  })
}
