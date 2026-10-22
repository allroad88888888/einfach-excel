import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checkReactSource } from './check-presentation-boundary.mjs'

const transport = '@einfach/spreadsheet-ui-core/rust-worker'
const runtime = '@einfach/spreadsheet-ui-core/rust-runtime'
for (const file of ['page/WorkbookRuntimeProvider.tsx', 'worker/create-workbook-worker.ts']) {
  test(`${file} permits only erased WorkerLike references`, () => {
    assert.deepEqual(checkReactSource(file, `import type { WorkerLike } from '${transport}'`), [])
    assert.deepEqual(checkReactSource(file, `import { type WorkerLike as Worker } from '${transport}'`), [])
    for (const source of [`import { WorkerLike } from '${transport}'`,
      `import { type WorkerLike, createWorkerTransport } from '${transport}'`,
      `import type { WorkerCommand } from '${transport}'`, `import * as worker from '${transport}'`])
      assert.equal(checkReactSource(file, source).length, 1)
  })
}
test('the one bundled Worker may only install the Core runtime', () => {
  assert.deepEqual(checkReactSource('worker/workbook.worker.ts', `import '${runtime}'`), [])
  for (const source of [`import '${runtime}'; store.setter(command)`,
    `import runtime from '${runtime}'`, `import '${runtime}?worker'`])
    assert.ok(checkReactSource('worker/workbook.worker.ts', source).some(message => message.includes('纯装配')))
})
test('other React views cannot import transport or runtime even as types', () => {
  for (const file of ['workbook/grid/Grid.tsx', 'worker/other.worker.ts', 'page/WorkbookRuntimeProvider.tsx']) {
    assert.ok(checkReactSource(file, `import '${runtime}'`).length > 0)
    assert.ok(checkReactSource(file, `await import('${runtime}')`).length > 0)
    assert.ok(checkReactSource(file, `await import('${transport}')`).length > 0)
    if (!file.includes('Provider'))
      assert.ok(checkReactSource(file, `import type { WorkerLike } from '${transport}'`).length > 0)
  }
})
test('package exceptions retain atom connection and direct Store bans', () => {
  for (const file of ['worker/create-workbook-worker.ts', 'page/WorkbookRuntimeProvider.tsx']) {
    for (const source of ["import { rustWorkbookConnectionAtom } from '@einfach/spreadsheet-ui-core'",
      "import { atom } from '@einfach/core'", 'store.getter(state)', 'store.setter(command)', 'store.sub(state, listener)'])
      assert.ok(checkReactSource(file, source).length > 0)
  }
})
