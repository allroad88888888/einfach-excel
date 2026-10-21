import { createStore } from '@einfach/core'
import { expect, test, vi } from 'vitest'
import { startRustWorkbookRuntimeAtom, disposeRustWorkbookRuntimeAtom,
  spreadsheetRuntimeAtom } from '../../src'
import type { WorkerLike } from '../../src/rust-worker'
import { TEST_FUNCTION_CATALOG } from '../support/function-catalog'

test('real startup writer binds its one deferred waiter after derived connection identity flushes', async () => {
  let listener: ((event: MessageEvent) => void) | undefined
  const commands: string[] = []
  const worker: WorkerLike = {
    postMessage(value) {
      const request = value as { id: number; command: string }
      commands.push(request.command)
      if (request.command === 'formula.awaitAsync') return
      const result = request.command === 'formula.catalog' ? TEST_FUNCTION_CATALOG :
        [{ id: 's', name: 'Sheet', index: 0 }]
      listener?.({ data: { id: request.id, ok: true, result } } as MessageEvent)
    },
    addEventListener(type, callback) { if (type === 'message') listener = callback },
    removeEventListener() {}, terminate: vi.fn(),
  }
  const store = createStore()
  await store.setter(startRustWorkbookRuntimeAtom, {
    definition: { title: 'Book', sheets: [{ id: 's', name: 'Sheet', rowCount: 100, colCount: 8 }],
      createImportChunks: () => [] }, workerFactory: () => worker,
  })
  await vi.waitFor(() => expect(commands.filter(command => command === 'formula.awaitAsync')).toHaveLength(1))
  expect(store.getter(spreadsheetRuntimeAtom)).toEqual({ status: 'ready' })
  store.setter(disposeRustWorkbookRuntimeAtom)
  expect(worker.terminate).toHaveBeenCalledOnce()
})
