import { describe, expect, test } from '@jest/globals'
import { createStore } from '@einfach/core'
import type { SpreadsheetBackend } from '@einfach/spreadsheet-ui-core'
import {
  dispatchStructuralCommand,
  type StructuralCommandDispatchContext,
} from '../src/structural-commands'

describe('structural command host dispatch', () => {
  test('injects host ports into a core command runner without retaining state', () => {
    const store = createStore()
    const backend = {} as SpreadsheetBackend
    let received: StructuralCommandDispatchContext<'delete-rows'> | undefined

    const result = dispatchStructuralCommand(
      store,
      backend,
      { command: 'delete-rows', operationSource: 'toolbar', timeoutMs: 25 },
      (context) => {
        received = context
        return 'dispatched'
      },
    )

    expect(result).toBe('dispatched')
    expect(received).toMatchObject({
      command: 'delete-rows',
      operationSource: 'toolbar',
      timeoutMs: 25,
      source: backend,
    })
    expect(received?.refreshProjection).toEqual(expect.any(Function))
  })
})
